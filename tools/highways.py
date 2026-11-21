#!/usr/bin/env python3
"""Seeds data/roads-named.geojson with the numbered highways.

Route lines: the cream highway bands of the in-game map (reference/ingame-z5.png, the zoom-5 mosaic of GTADB's
day tiles) thinned to centrelines. Route numbers: the shields printed on Rockstar's official map, read by
tools/ocr.swift (tools/ocr-labels.jsonl); shield colour tells the kind (blue = Interstate, gold = county road,
white = U.S./state route). Each line takes the number of the nearest shield along the same road.
The lines are only there to carry labels along the road; people refine and add street names by hand.

Usage: python3 tools/highways.py
"""
import json
import re
import sys
from pathlib import Path

import cv2
import numpy as np
from shapely.geometry import LineString, Point
from skimage.morphology import skeletonize

sys.path.insert(0, str(Path(__file__).parent))
import graph as X  # noqa: E402
from geo import game_to_lnglat, poster_px_to_game  # noqa: E402
from vectorize import build_lut, CID  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
US_ROUTES = {'35', '82'}  # reported as U.S. Routes on the official map


def shields():
    img = cv2.imread(str(ROOT / 'reference/leonida.png'))
    out = []
    for line in open(ROOT / 'tools/ocr-labels.jsonl'):
        try:
            r = json.loads(line)
        except ValueError:
            continue
        t = r['t'].strip()
        if not re.fullmatch(r'\d{2,3}[A-Z]?', t) or r['c'] < 0.5 or (r['x'] < 1150 and r['y'] < 1300):
            continue
        x, y, w, h = r['x'], r['y'], max(r['w'], 20), max(r['h'], 20)
        box = img[max(0, y - h):y + h, max(0, x - w):x + w].reshape(-1, 3).astype(int)
        b, g, rr = box[:, 0], box[:, 1], box[:, 2]
        gold = ((rr > 190) & (g > 150) & (b < 110)).mean()
        blue = ((b > 140) & (rr < 110) & (g < 130)).mean()
        if gold > 0.1:
            ref, cls = f'CR {t}', 'primary'
        elif blue > 0.08:
            ref, cls = f'I-{t}', 'motorway'
        elif t in US_ROUTES:
            ref, cls = f'US {t}', 'motorway'
        else:
            ref, cls = f'SR {t}', 'primary'
        gx, gy = poster_px_to_game(x, y)
        out.append((ref, cls, gx, gy))
    # 2-digit readings that sit on a 3-digit shield are partial reads ('28' on '628').
    full = [s for s in out if not any(o[0] != s[0] and o[0].endswith(s[0].split(' ')[-1].split('-')[-1]) and
                                      abs(o[2] - s[2]) < 60 and abs(o[3] - s[3]) < 60 for o in out)]
    return full


def main():
    img = cv2.imread(str(ROOT / 'reference/ingame-z5.png'))
    lut = build_lut()
    t = img >> 2
    cls = lut[t[..., 0], t[..., 1], t[..., 2]]
    del img, t
    hw = (cls == CID['highway']).astype(np.uint8)
    hw = cv2.morphologyEx(hw, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
    n, lab, st, _ = cv2.connectedComponentsWithStats(hw)
    keep = np.zeros(n, bool)
    keep[1:] = np.maximum(st[1:, cv2.CC_STAT_WIDTH], st[1:, cv2.CC_STAT_HEIGHT]) > 150
    hw = keep[lab]
    skel = skeletonize(hw)
    edges, cent = X.road_graph(skel)
    edges = X.clean_graph(edges, rounds=3, spur=40)
    sh = shields()
    print(len(sh), 'shields', sorted({s[0] for s in sh}))
    feats = []
    to_game = lambda x, y: (x + 17 * 256 - 16384, 16384 - (y + 17 * 256))  # zoom-5 mosaic px -> game m
    for a, b, path in edges:
        if X.length(path) < 120:
            continue
        pts = cv2.approxPolyDP(np.array(path, np.float32)[:, None, :], 2.0, False)[:, 0, :]
        game = [to_game(float(x), float(y)) for x, y in pts]
        line = LineString(game)
        near = sorted(sh, key=lambda s: line.distance(Point(s[2], s[3])))
        props = {'class': 'motorway'}
        if near and line.distance(Point(near[0][2], near[0][3])) < 900:
            props = {'ref': near[0][0], 'class': near[0][1]}
        props['source'] = 'In-game map (GTADB tiles, CC BY 4.0) for the line; Rockstar official map for the number'
        feats.append({'type': 'Feature', 'properties': props,
                      'geometry': {'type': 'LineString', 'coordinates': [[round(v, 7) for v in game_to_lnglat(*p)] for p in game]}})
    with open(ROOT / 'data/roads-named.geojson', 'w') as f:
        f.write('{"type":"FeatureCollection","features":[\n')
        f.write(',\n'.join(json.dumps(x, ensure_ascii=False, separators=(',', ':')) for x in feats))
        f.write('\n]}\n')
    from collections import Counter
    print(len(feats), Counter(x['properties'].get('ref', '-') for x in feats).most_common())


if __name__ == '__main__':
    main()
