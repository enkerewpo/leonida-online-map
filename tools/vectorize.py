#!/usr/bin/env python3
"""Vectorises the in-game map (GTADB day tiles, "GTA VI Map Tiles (CC BY 4.0) — https://map.gtadb.org") colour by
colour, one source zoom level at a time. No feature recognition: every flat colour region (water in three depths,
land in three tones, urban ground, road surface, highway, buildings and enterable buildings, beach, rail, paved) is
traced into polygons, so the vector map reproduces the in-game map exactly, at every level.

Writes build/vector/L<level>.geojsonl (one GeoJSON feature per line, with a tippecanoe zoom range) for an optional
vector rendering of the base map. Works block by block, so memory stays small at any level.

Usage: python3 tools/vectorize.py TILES_DIR [levels, default 2 3 4 5 6]
  TILES_DIR holds <level>/<level>,<y>,<x>.jpg (the layout of rolux/gtadb.org maps/tiles/6/day).
"""
import json
import os
import sys
from pathlib import Path

import cv2
import numpy as np
from shapely.affinity import affine_transform
from shapely.geometry import Polygon, mapping

sys.path.insert(0, str(Path(__file__).parent))
from geo import game_to_lnglat  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'build/vector'
BLOCK = 16  # tiles per block side (4096 px)

# Which map zooms (tile zooms of the vector tileset) each source level serves.
ZOOMS = {2: (8, 11), 3: (12, 12), 4: (13, 13), 5: (14, 14), 6: (15, 16)}

PALETTE = {
    'land': ['6c9784', '608c70', '67907e', '598469', '608d6f', '598c7a', '80a19b', '7a9a78', '8aa17c', '4e7a5c'],
    'urban': ['9ea4ac', 'bec0c9', 'a8adb4', '8f969e', '969ea8'],
    'road': ['d0d1da', 'cfd3d5', 'c8cbd2', 'dcdde3', 'ccccd8', 'babac6'],
    'highway': ['d0cdb9', 'dadacd', 'e6e0c4', 'ece8d6'],
    'building_enterable': ['96a7be', '97a7bd', '8fa0b6', '889bb4'],
    'building': ['acb9cc', 'acb7c7', 'a6b1c1', 'b4bfcd'],
    'rail': ['7b94a6', '839aad'],
    'beach': ['c1b895', 'd7cda5', 'cbc29f'],
    'paved': ['f2f3f5', 'ffffff'],
}
# Drawing order (bottom to top); deep water is the map background and is not traced.
CLASSES = ['water_mid', 'water_shallow', 'land', 'land_dark', 'land_light', 'beach', 'urban', 'paved', 'road',
           'highway', 'rail', 'building', 'building_enterable']
CID = {c: i + 1 for i, c in enumerate(CLASSES)}  # 0 = deep water


def build_lut():
    q = np.arange(0, 256, 4, dtype=np.uint8)
    b, g, r = np.meshgrid(q, q, q, indexing='ij')
    bgr = np.stack([b, g, r], -1).reshape(-1, 1, 3) + 2
    lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB).reshape(-1, 3).astype(np.float32)
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV_FULL).reshape(-1, 3).astype(np.float32)
    hue, sat = hsv[:, 0] * 360 / 256, hsv[:, 1] / 255
    cents, owner = [], []
    for name, hexes in PALETTE.items():
        for h in hexes:
            c = cv2.cvtColor(np.uint8([[[int(h[4:6], 16), int(h[2:4], 16), int(h[0:2], 16)]]]), cv2.COLOR_BGR2LAB)[0, 0]
            cents.append(c.astype(np.float32))
            owner.append(name)
    cents = np.array(cents)
    names = np.array(owner)[((lab[:, None, :] - cents[None]) ** 2).sum(-1).argmin(1)]
    out = np.array([CID.get(n, CID['land']) for n in names], np.uint8)
    L = lab[:, 0] * 100 / 255
    # Highways are cream; anything greyer is ordinary road.
    out[(out == CID['highway']) & (lab[:, 2] < 128 + 7)] = CID['road']
    # Land keeps its relief shading in three tones.
    isl = out == CID['land']
    out[isl & (L < 53)] = CID['land_dark']
    out[isl & (L > 62)] = CID['land_light']
    # Water by hue, in three depths.
    water = (hue > 176) & (hue < 225) & (sat > 0.30)
    out[water] = 0
    out[water & (L >= 60)] = CID['water_mid']
    out[water & (L >= 67)] = CID['water_shallow']
    return out.reshape(64, 64, 64)


def load_block(d, level, tx0, ty0, n):
    img = np.empty((n * 256, n * 256, 3), np.uint8)
    img[:] = (172, 142, 53)  # deep sea where a tile is missing
    found = False
    for j in range(n):
        for i in range(n):
            f = os.path.join(d, f'{level},{ty0 + j},{tx0 + i}.jpg')
            if os.path.exists(f):
                img[j * 256:(j + 1) * 256, i * 256:(i + 1) * 256] = cv2.imread(f)
                found = True
    return img if found else None


def polygons(mask, min_area, eps):
    cs, hier = cv2.findContours(mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    out = []
    if hier is None:
        return out
    hier = hier[0]
    for i, c in enumerate(cs):
        if hier[i][3] != -1 or cv2.contourArea(c) < min_area:
            continue
        shell = cv2.approxPolyDP(c, eps, True)[:, 0, :]
        if len(shell) < 3:
            continue
        holes, j = [], hier[i][2]
        while j != -1:
            if cv2.contourArea(cs[j]) >= min_area:
                h = cv2.approxPolyDP(cs[j], eps, True)[:, 0, :]
                if len(h) >= 3:
                    holes.append(h)
            j = hier[j][0]
        p = Polygon(shell, holes)
        if not p.is_valid:
            p = p.buffer(0)
        if not p.is_empty:
            out.append(p)
    return out


def main():
    tiles = sys.argv[1]
    levels = [int(x) for x in sys.argv[2:]] or [2, 3, 4, 5, 6]
    lut = build_lut()
    OUT.mkdir(parents=True, exist_ok=True)
    for level in levels:
        d = os.path.join(tiles, str(level))
        xs, ys = set(), set()
        for f in os.listdir(d):
            _, y, x = map(int, f[:-4].split(','))
            xs.add(x)
            ys.add(y)
        # level px -> game metres (GTADB: px = (x + 16384) * 2^L / 32)
        k = 32 / 2 ** level
        M = np.array([[k, 0, -16384], [0, -k, 16384], [0, 0, 1]])
        zmin, zmax = ZOOMS[level]
        # Source px per screen px at the most detailed zoom this level serves decides how much detail to keep.
        eps = 0.6 if level >= 5 else 0.8
        min_area = 3 if level >= 5 else 2
        n_out = 0
        with open(OUT / f'L{level}.geojsonl', 'w') as fo:
            for ty in range(min(ys), max(ys) + 1, BLOCK):
                for tx in range(min(xs), max(xs) + 1, BLOCK):
                    img = load_block(d, level, tx, ty, BLOCK)
                    if img is None:
                        continue
                    t = img >> 2
                    cls = lut[t[..., 0], t[..., 1], t[..., 2]]
                    del img, t
                    cls = cv2.medianBlur(cls, 3)
                    ox, oy = tx * 256, ty * 256
                    m = M @ np.array([[1, 0, ox], [0, 1, oy], [0, 0, 1]])
                    aff = [m[0, 0], m[0, 1], m[1, 0], m[1, 1], m[0, 2], m[1, 2]]
                    for name in CLASSES:
                        mask = (cls == CID[name]).astype(np.uint8)
                        if not mask.any():
                            continue
                        for p in polygons(mask, min_area, eps):
                            # A hair of overlap hides the seams between blocks and between neighbouring colours.
                            g = affine_transform(p.buffer(0.35, join_style=2), aff)
                            gm = mapping(g)
                            conv = lambda o: [round(v, 7) for v in game_to_lnglat(*o)] if isinstance(o[0], (int, float)) else [conv(v) for v in o]
                            feat = {'type': 'Feature', 'properties': {'class': name},
                                    'tippecanoe': {'minzoom': zmin, 'maxzoom': zmax, 'layer': 'base'},
                                    'geometry': {'type': gm['type'], 'coordinates': conv(gm['coordinates'])}}
                            fo.write(json.dumps(feat, separators=(',', ':')) + '\n')
                            n_out += 1
                    print(f'L{level} block {tx},{ty}: {n_out} features so far', flush=True)
        print(f'L{level}: {n_out} features', flush=True)


if __name__ == '__main__':
    main()
