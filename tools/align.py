#!/usr/bin/env python3
"""Aligns the in-game map mosaic (reference/ingame-z5.png, from GTADB's day tiles) onto the official poster frame
(reference/leonida.png) and saves the 2x3 affine that maps in-game z5 pixels to poster pixels: reference/z5_to_ref.npy.

Both maps are reduced to a land/water mask and matched with ECC (affine), coarse to fine."""
from pathlib import Path
import cv2, numpy as np
ROOT = Path(__file__).resolve().parent.parent

def water_mask(img, sea_hexes):
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB).astype(np.float32)
    best = None
    for h in sea_hexes:
        c = cv2.cvtColor(np.uint8([[[int(h[4:6], 16), int(h[2:4], 16), int(h[0:2], 16)]]]), cv2.COLOR_BGR2LAB)[0, 0].astype(np.float32)
        d = np.linalg.norm(lab - c, axis=2)
        best = d if best is None else np.minimum(best, d)
    return (best < 26).astype(np.uint8)

def landmask(img, sea=None):
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV_FULL).astype(np.float32)
    hue = hsv[..., 0] * 360 / 256; sat = hsv[..., 1] / 255; val = hsv[..., 2] / 255
    w = ((hue > 176) & (hue < 225) & (sat > 0.22)).astype(np.uint8)
    w = cv2.medianBlur(w, 5)
    n, l, st, _ = cv2.connectedComponentsWithStats(1 - w)
    keep = np.zeros(n, bool); keep[1:] = st[1:, 4] > 30
    return keep[l].astype(np.float32)

ref = cv2.imread(str(ROOT / 'reference/leonida.png'))
ing = cv2.imread(str(ROOT / 'reference/ingame-z5.png'))
s_ref = 0.1
A = landmask(cv2.resize(ref, None, fx=s_ref, fy=s_ref, interpolation=cv2.INTER_AREA), ['00abc4', '38b8cf', '75c5d3', '54bdce'])
# initial guess: scale so the in-game land fits the poster land box
s_ing0 = s_ref * 0.3
B = landmask(cv2.resize(ing, None, fx=s_ing0, fy=s_ing0, interpolation=cv2.INTER_AREA), ['358eac', '4c9db8', '57a4bf', '79b1c5', '5fa1b7', '59abc2', '51a1b8', '2f8fb0'])
def bbox(m):
    ys, xs = np.nonzero(m > 0.5); return xs.min(), ys.min(), xs.max(), ys.max()
ax0, ay0, ax1, ay1 = bbox(A); bx0, by0, bx1, by1 = bbox(B)
sx = (ax1 - ax0) / (bx1 - bx0); sy = (ay1 - ay0) / (by1 - by0)
W0 = np.array([[sx, 0, ax0 - sx * bx0], [0, sy, ay0 - sy * by0]], np.float32)  # B px -> A px
print('initial', sx, sy)
Wb = np.linalg.inv(np.vstack([W0, [0, 0, 1]]))[:2].astype(np.float32)  # A px -> B px for ECC warp of B
H, W = A.shape
M = Wb
for sig in (6, 3, 1.5):
    a = cv2.GaussianBlur(A, (0, 0), sig); b = cv2.GaussianBlur(B, (0, 0), sig)
    cc, M = cv2.findTransformECC(a, b, M, cv2.MOTION_AFFINE, (3, 400, 1e-7), None, 1)
    print(sig, cc)
# M maps A(small ref) px -> B(small ingame) px. Invert to get ingame -> ref, then scale to full res.
Mi = np.linalg.inv(np.vstack([M, [0, 0, 1]]))
T = np.diag([1 / s_ref, 1 / s_ref, 1]) @ Mi @ np.diag([s_ing0, s_ing0, 1])
np.save(ROOT / 'reference/z5_to_ref.npy', T[:2])
import json
json.dump({'$comment': 'Affine (2x3) from GTADB day-tile zoom-5 mosaic pixels (origin tile 17,17) to poster pixels of tools/geo.py; fitted by tools/align.py.', 'matrix': T[:2].tolist()}, open(ROOT / 'tools/z5_to_ref.json', 'w'), indent=1)
print(T[:2])
b2 = cv2.warpAffine(B, M, (W, H), flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP)
inter = ((A > .5) & (b2 > .5)).sum(); union = ((A > .5) | (b2 > .5)).sum(); print('IoU', inter / union)
vis = np.zeros((H, W, 3), np.uint8); vis[A > .5] = (0, 0, 200); vis[b2 > .5] += np.uint8([0, 150, 0])
cv2.imwrite('/tmp/align.png', vis)
