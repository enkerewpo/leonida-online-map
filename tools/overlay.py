#!/usr/bin/env python3
"""Draws data/ over the reference image for checking: python3 tools/overlay.py out.png x0 y0 x1 y1 [scale]"""
import json, sys
from pathlib import Path
import cv2, numpy as np
sys.path.insert(0, str(Path(__file__).parent))
from geo import lnglat_to_px
ROOT = Path(__file__).resolve().parent.parent
out, x0, y0, x1, y1 = sys.argv[1], *map(int, sys.argv[2:6])
s = float(sys.argv[6]) if len(sys.argv) > 6 else 1.0
img = cv2.imread(str(ROOT / 'reference/leonida.png'))[y0:y1, x0:x1]
img = cv2.resize(img, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
img = (img * 0.55 + 255 * 0.45).astype(np.uint8)
P = lambda r: np.array([[(v - o) * s for v, o in zip(lnglat_to_px(*p), (x0, y0))] for p in r], np.int32)
load = lambda n: json.load(open(ROOT / 'data' / f'{n}.geojson'))['features']
for f in load('land'):
    g = f['geometry']
    for pl in ([g['coordinates']] if g['type'] == 'Polygon' else g['coordinates']):
        for r in pl: cv2.polylines(img, [P(r)], True, (140, 90, 0), 1, cv2.LINE_AA)
for f in load('buildings'):
    cv2.polylines(img, [P(f['geometry']['coordinates'][0])], True, (200, 80, 30), 1, cv2.LINE_AA)
col = {'motorway': ((0, 0, 220), 3), 'primary': ((0, 120, 255), 2), 'street': ((30, 30, 30), 2)}
for f in load('roads'):
    c, w = col[f['properties']['class']]
    pts = P(f['geometry']['coordinates'])
    cv2.polylines(img, [pts], False, c, w, cv2.LINE_AA)
    for p in (pts[0], pts[-1]): cv2.circle(img, tuple(int(v) for v in p), 2, (0, 160, 0), -1)
cv2.imwrite(out, img)
