#!/usr/bin/env python3
"""Draws data/ to a PNG for a quick look without the web app: python3 tools/preview.py out.png [scale]"""
import json, sys
from pathlib import Path
import cv2, numpy as np
sys.path.insert(0, str(Path(__file__).parent))
from geo import lnglat_to_px, REF_W, REF_H
ROOT = Path(__file__).resolve().parent.parent
out, s = sys.argv[1], float(sys.argv[2]) if len(sys.argv) > 2 else 0.25
W, H = int(REF_W * s), int(REF_H * s)
SEA = (196, 171, 0)
c = np.zeros((H, W, 3), np.uint8); c[:] = SEA
P = lambda r: np.array([[int(v * s) for v in lnglat_to_px(*p)] for p in r], np.int32)
def poly(f, col):
    g = f['geometry']
    for pl in ([g['coordinates']] if g['type'] == 'Polygon' else g['coordinates']):
        cv2.fillPoly(c, [P(pl[0])], col)
        for h in pl[1:]: cv2.fillPoly(c, [P(h)], SEA)
load = lambda n: json.load(open(ROOT / 'data' / f'{n}.geojson'))['features']
for f in load('land'): poly(f, (114, 138, 65))
col = {'urban': (169, 166, 142), 'beach': (147, 180, 191), 'swamp': (110, 120, 70)}
for f in load('landuse'): poly(f, col[f['properties']['class']])
wid = {'motorway': 3, 'primary': 2, 'street': 1}
for f in load('roads'): cv2.polylines(c, [P(f['geometry']['coordinates'])], False, (250, 250, 250), wid[f['properties']['class']])
cv2.imwrite(out, c)
