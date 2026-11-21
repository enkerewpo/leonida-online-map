#!/usr/bin/env python3
"""Side-by-side check: the official map (left) and our vector data drawn alone (right), same window.
Usage: python3 tools/render_check.py out.png x0 y0 x1 y1 [scale]"""
import json, sys
from pathlib import Path
import cv2, numpy as np
sys.path.insert(0, str(Path(__file__).parent))
from geo import lnglat_to_px
ROOT = Path(__file__).resolve().parent.parent
out, x0, y0, x1, y1 = sys.argv[1], *map(int, sys.argv[2:6]); s = float(sys.argv[6]) if len(sys.argv) > 6 else 1.0
SEA = (202, 174, 82)
W, H = int((x1 - x0) * s), int((y1 - y0) * s)
c = np.zeros((H, W, 3), np.uint8); c[:] = SEA
P = lambda r: np.array([[(lnglat_to_px(*q)[0] - x0) * s * 16, (lnglat_to_px(*q)[1] - y0) * s * 16] for q in r], np.int32)
def poly(f, col, hole=None):
    g = f['geometry']
    for pl in ([g['coordinates']] if g['type'] == 'Polygon' else g['coordinates']):
        m = np.zeros(c.shape[:2], np.uint8)
        cv2.fillPoly(m, [P(pl[0])], 255, cv2.LINE_AA, 4)
        for h in pl[1:]: cv2.fillPoly(m, [P(h)], 0, cv2.LINE_AA, 4)
        a = (m.astype(np.float32) / 255)[..., None]
        c[:] = (c * (1 - a) + np.array(col) * a).astype(np.uint8)
L = lambda n: json.load(open(ROOT / f'data/{n}.geojson'))['features']
for f in L('land'): poly(f, (119, 152, 102))
for f in L('landuse'): poly(f, {'urban': (188, 185, 174), 'beach': (165, 205, 215), 'swamp': (110, 140, 95)}.get(f['properties']['class'], (0, 0, 255)))
for f in L('buildings'): poly(f, (170, 160, 150))
for cl, w, col in (('street', 2, (219, 217, 209)), ('primary', 3, (240, 240, 240)), ('motorway', 4, (255, 255, 255))):
    for f in L('roads'):
        if f['properties']['class'] == cl: cv2.polylines(c, [P(f['geometry']['coordinates'])], False, col, w, cv2.LINE_AA, 4)
ref = cv2.resize(cv2.imread(str(ROOT / 'reference/leonida.png'))[y0:y1, x0:x1], (W, H), interpolation=cv2.INTER_AREA)
cv2.imwrite(out, np.hstack([ref, np.full((H, 6, 3), 255, np.uint8), c]))
