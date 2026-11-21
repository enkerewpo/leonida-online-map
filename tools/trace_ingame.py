#!/usr/bin/env python3
"""Seeds the base layers from the clean in-game map (GTADB day tiles, CC BY 4.0, stitched at zoom 5 into
reference/ingame-z5.png by tools/stitch.py and aligned onto the poster frame by tools/align.py).

The in-game map has no lettering, icons, grid or hill shading: roads, buildings, water, sand and land are flat colours
with crisp edges, so every class is read straight from its colour and the road network is traced from clean bands.
Writes data/{land,landuse,buildings,roads}.geojson. Re-running overwrites them; hand edits belong in later commits.

Usage: python3 tools/trace_ingame.py [--tiles DIR --zoom 6]
  With --tiles, reads GTADB day tiles (files z,y,x.jpg) straight from DIR/<zoom>; zoom 6 needs ~25 GB of RAM.
"""
import argparse
import math
import os
import sys
from pathlib import Path

import cv2
import numpy as np
from shapely.affinity import affine_transform
from shapely.geometry import LineString
from skimage.morphology import skeletonize

sys.path.insert(0, str(Path(__file__).parent))
import extract as X  # noqa: E402  (graph and polygon helpers)

ROOT = Path(__file__).resolve().parent.parent

# Non-water colours of the in-game map (sampled with k-means). Water is found by hue instead: every shade of blue.
PALETTE = {
    'land': ['6c9784', '608c70', '67907e', '598469', '608d6f', '598c7a', '80a19b', '7a9a78', '8aa17c', '4e7a5c'],
    'urban': ['9ea4ac', 'bec0c9', 'a8adb4', '8f969e'],
    'road': ['d0d1da', 'cfd3d5', 'c8cbd2', 'dcdde3'],
    'highway': ['d0cdb9', 'dadacd', 'e6e0c4', 'ece8d6'],
    'building_in': ['96a7be', '97a7bd', '8fa0b6', '889bb4'],  # darker blue: buildings you can enter
    'building': ['acb9cc', 'acb7c7', 'a6b1c1', 'b4bfcd'],
    'rail': ['839aad'],
    'beach': ['c1b895', 'd7cda5', 'cbc29f'],
    'pale': ['f2f3f5', 'ffffff'],  # runways, helipads, plazas
}
NAMES = ['water'] + list(PALETTE)
K = {n: i for i, n in enumerate(NAMES)}


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
            owner.append(K[name])
    cents, owner = np.array(cents), np.array(owner)
    cls = owner[((lab[:, None, :] - cents[None]) ** 2).sum(-1).argmin(1)].astype(np.uint8)
    water = (hue > 176) & (hue < 225) & (sat > 0.30)
    cls[water] = K['water']
    return cls.reshape(64, 64, 64)


def classify(img):
    lut = build_lut()
    out = np.empty(img.shape[:2], np.uint8)
    for y in range(0, img.shape[0], 2048):
        t = img[y:y + 2048] >> 2
        out[y:y + 2048] = lut[t[..., 0], t[..., 1], t[..., 2]]
    return out


def poly_share(poly, cls, K):
    """Share of dark (enterable) building colour inside a footprint."""
    x0, y0, x1, y1 = [int(v) for v in poly.bounds]
    x0, y0 = max(0, x0), max(0, y0)
    sub = cls[y0:y1 + 1, x0:x1 + 1]
    m = np.zeros(sub.shape, np.uint8)
    cv2.fillPoly(m, [np.round(np.array(poly.exterior.coords) - [x0, y0]).astype(np.int32)], 1)
    inb = m.astype(bool) & np.isin(sub, [K['building'], K['building_in']])
    return float((sub[inb] == K['building_in']).mean()) if inb.any() else 0.0


def fill_small_holes(mask, max_area):
    """Fills enclosed holes up to max_area px (traffic islands, roundabout centres, roof gaps)."""
    inv = (~mask.astype(bool)).astype(np.uint8)
    n, lab_, st, _ = cv2.connectedComponentsWithStats(inv, connectivity=4)
    small = np.zeros(n, bool)
    small[1:] = st[1:, cv2.CC_STAT_AREA] <= max_area
    # The outside (touching the border) is never a hole.
    for edge in (lab_[0], lab_[-1], lab_[:, 0], lab_[:, -1]):
        small[np.unique(edge)] = False
    return mask.astype(bool) | small[lab_]


def skeleton_strips(mask, strip=3000, pad=96):
    out = np.zeros(mask.shape, bool)
    H = mask.shape[0]
    for y in range(0, H, strip):
        a, b = max(0, y - pad), min(H, y + strip + pad)
        sk = skeletonize(mask[a:b])
        out[y:min(H, y + strip)] = sk[y - a:y - a + min(strip, H - y)]
    return out


def load_tiles(d, z):
    tiles = {}
    for f in os.listdir(d):
        _, y, x = map(int, f[:-4].split(','))
        tiles[(x, y)] = f
    # Same origin as the zoom-5 mosaic: tile 17 at zoom 5, i.e. 17 * 2^(z-5).
    o = 17 * 2 ** (z - 5)
    w = max(x for x, _ in tiles) - o + 1
    h = max(y for _, y in tiles) - o + 1
    img = np.zeros((h * 256, w * 256, 3), np.uint8)
    for (x, y), f in tiles.items():
        if x >= o and y >= o:
            img[(y - o) * 256:(y - o + 1) * 256, (x - o) * 256:(x - o + 1) * 256] = cv2.imread(os.path.join(d, f))
    return img


def minzoom_road(kind, length_m):
    base = {'motorway': 9, 'primary': 11, 'street': 13, 'track': 14}[kind]
    if kind in ('street', 'track') and length_m > 600:
        base -= 0.5
    if kind in ('street', 'track') and length_m < 80:
        base += 0.5
    return base


def minzoom_area(m2):
    return 12.5 if m2 > 20000 else 13.5 if m2 > 3000 else 14.5 if m2 > 400 else 15.5


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--tiles')
    ap.add_argument('--zoom', type=int, default=5)
    a = ap.parse_args()
    z = a.zoom
    S = 2 ** (z - 5)  # pixel scale relative to zoom 5
    img = load_tiles(os.path.join(a.tiles, str(z)), z) if a.tiles else cv2.imread(str(ROOT / 'reference/ingame-z5.png'))
    print('image', img.shape)
    T = np.load(ROOT / 'reference/z5_to_ref.npy') @ np.diag([1 / S, 1 / S, 1])
    to_ref = [T[0, 0], T[0, 1], T[1, 0], T[1, 1], T[0, 2], T[1, 2]]
    M_PER_PX = math.hypot(T[0, 0], T[1, 0]) * X.M_PER_PX_REF
    feat = lambda g, p: X.feature(affine_transform(g, to_ref), p)
    cls = classify(img)
    del img
    print('classified', {n: round(float((cls == i).mean()), 3) for n, i in K.items()})

    # Small specks of a class inside another (anti-aliasing at edges) are folded into their surroundings.
    cls = cv2.medianBlur(cls, 3)

    water = cls == K['water']
    land = ~water
    X.write('land', [feat(p, {'class': 'land'}) for p in X.polygons(land, 120 * S * S, 1.6)])

    use = []
    urban = np.isin(cls, [K['urban'], K['road'], K['building'], K['building_in'], K['pale'], K['rail']])
    urban = cv2.morphologyEx(urban.astype(np.uint8), cv2.MORPH_OPEN, np.ones((9 * S, 9 * S), np.uint8))
    urban = cv2.morphologyEx(urban, cv2.MORPH_CLOSE, np.ones((15 * S, 15 * S), np.uint8)).astype(bool) & land
    # Roads through the countryside are not urban ground: keep only blocks that contain urban-ground colour.
    n, lab_, st, _ = cv2.connectedComponentsWithStats(urban.astype(np.uint8))
    ug = np.bincount(lab_.ravel(), weights=(cls == K['urban']).ravel().astype(np.float32), minlength=n)
    keep = np.zeros(n, bool)
    keep[1:] = (ug[1:] / np.maximum(st[1:, cv2.CC_STAT_AREA], 1) > 0.25) & (st[1:, cv2.CC_STAT_AREA] > 4000 * S * S)
    urban = keep[lab_]
    use += [feat(p, {'class': 'urban'}) for p in X.polygons(urban, 4000 * S * S, 2.5)]
    use += [feat(p, {'class': 'beach'}) for p in X.polygons(cls == K['beach'], 150 * S * S, 1.6)]
    use += [feat(p, {'class': 'paved'}) for p in X.polygons(cls == K['pale'], 400 * S * S, 1.6)]
    # Swamp: land broken up by many small channels.
    w8 = water.astype(np.uint8)
    shore = cv2.morphologyEx(w8, cv2.MORPH_GRADIENT, np.ones((3, 3), np.uint8)).astype(np.float32)
    wf = cv2.boxFilter(w8.astype(np.float32), -1, (151 * S, 151 * S))
    sd = cv2.boxFilter(shore, -1, (151 * S, 151 * S))
    marsh = ((wf > 0.15) & (wf < 0.85) & (sd > 0.05 / S)).astype(np.uint8)
    marsh = cv2.morphologyEx(marsh, cv2.MORPH_OPEN, np.ones((41 * S, 41 * S), np.uint8))
    n, lab_, st, _ = cv2.connectedComponentsWithStats(marsh)
    big = np.zeros(n, bool)
    big[1:] = st[1:, cv2.CC_STAT_AREA] > 400000 * S * S
    swamp = big[lab_] & land & ~urban
    use += [feat(p, {'class': 'swamp'}) for p in X.polygons(swamp, 150 * S * S, 1.6)]
    X.write('landuse', use)
    del swamp, marsh, wf, sd, shore

    # Buildings are drawn in 3D from above: roofs carry ridge lines, shading and parts in other blues. Everything
    # blue-grey (both building shades and the darker line colour) is one building; gaps inside are closed.
    anyb = np.isin(cls, [K['building'], K['building_in'], K['rail']]).astype(np.uint8)
    anyb = cv2.morphologyEx(anyb, cv2.MORPH_CLOSE, np.ones((2 * S + 1, 2 * S + 1), np.uint8))
    anyb = fill_small_holes(anyb, 600 * S * S).astype(np.uint8)
    anyb = cv2.morphologyEx(anyb, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    n, lab_, st, _ = cv2.connectedComponentsWithStats(anyb, connectivity=4)
    del lab_
    feats = []
    for poly in X.building_polygons(anyb, min_area=40 * S * S):
        f = feat(poly, {'class': 'building'})
        if f is None:
            continue
        m2 = poly.area * M_PER_PX ** 2
        f['properties']['enterable'] = bool(poly_share(poly, cls, K) > 0.5)
        f['properties']['minzoom'] = minzoom_area(m2)
        feats.append(f)
    X.write('buildings', feats)
    print('enterable buildings', sum(f['properties']['enterable'] for f in feats), 'of', len(feats))
    del anyb

    # Roads: clean bands of road or highway colour, thinned to centrelines and turned into a graph.
    hw = cls == K['highway']
    rm = np.isin(cls, [K['road'], K['highway']]).astype(np.uint8)
    rm = cv2.morphologyEx(rm, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3 + 2 * S, 3 + 2 * S)))
    # Islands inside the road surface (traffic islands, small roundabouts, gaps between lanes) would turn into
    # loops of centreline; fill them so each road gets one centreline.
    rm = fill_small_holes(rm, 750 * S * S).astype(np.uint8)
    width = cv2.distanceTransform(rm, cv2.DIST_L2, 3)
    skel = skeleton_strips(rm.astype(bool))
    print('skeleton px', int(skel.sum()))
    edges, cent = X.road_graph(skel)
    edges = X.clean_graph(edges, rounds=3, spur=20 * S)
    edges = [e for e in edges if not (e[0] == e[1] and X.length(e[2]) < 200 * S)]
    print('edges', len(edges))
    lines, props = [], []
    for a, b_, path in edges:
        simp = X.shape_line(np.array(path, float), cent[a], cent[b_])
        if simp is None:
            continue
        ix = np.array(path[1:-1] or path)
        w = float(np.median(width[ix[:, 1], ix[:, 0]])) * 2
        white = float(hw[ix[:, 1], ix[:, 0]].mean())
        w /= S
        kind = 'motorway' if white > 0.4 else 'primary' if w >= 14 else 'street' if w >= 6 else 'track'
        lines.append([tuple(map(float, p)) for p in simp])
        props.append(kind)
    healed = X.heal(lines, max_join=40 * S, max_snap=20 * S)
    for seg, k in healed:
        lines.append(seg)
        props.append(props[k])
    print('healed', len(healed))
    out = []
    for l, c in zip(lines, props):
        if len(l) < 2:
            continue
        g = LineString(l)
        f = feat(g, {'class': c})
        if f:
            f['properties']['minzoom'] = minzoom_road(c, g.length * M_PER_PX)
            out.append(f)
    X.write('roads', out)


if __name__ == '__main__':
    main()
