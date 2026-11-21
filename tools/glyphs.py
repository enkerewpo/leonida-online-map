#!/usr/bin/env python3
"""Builds MapLibre glyph files (signed-distance-field PBFs) from fonts/Jost.ttf.

Writes public/glyphs/<font name>/<start>-<end>.pbf for Latin ranges. Chinese labels are drawn by the browser with
Noto Sans SC/TC (MapLibre's localIdeographFontFamily), so no CJK ranges are built here.
Usage: python3 tools/glyphs.py   (needs freetype-py, opencv-python, numpy)
"""
from pathlib import Path

import cv2
import freetype
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
SIZE, BUFFER, RADIUS, CUTOFF = 24, 3, 8, 0.25
WEIGHTS = {'Jost Medium': 500, 'Jost SemiBold': 600, 'Jost Bold': 700}
RANGES = [0, 256, 8192]  # Basic Latin + Latin-1, Latin Extended-A/B, General Punctuation


def varint(n):
    out = bytearray()
    while True:
        b = n & 0x7F
        n >>= 7
        out.append(b | (0x80 if n else 0))
        if not n:
            return bytes(out)


def field(num, wire, payload):
    key = varint((num << 3) | wire)
    if wire == 0:
        return key + varint(payload)
    return key + varint(len(payload)) + payload


def zigzag(n):
    return (n << 1) ^ (n >> 31)


def sdf(bitmap):
    h, w = bitmap.shape
    pad = np.zeros((h + 2 * BUFFER, w + 2 * BUFFER), np.uint8)
    pad[BUFFER:BUFFER + h, BUFFER:BUFFER + w] = bitmap
    inside = (pad >= 128).astype(np.uint8)
    d_out = cv2.distanceTransform(1 - inside, cv2.DIST_L2, 5)
    d_in = cv2.distanceTransform(inside, cv2.DIST_L2, 5)
    d = d_out - d_in
    return np.clip(np.round(255 - 255 * (d / RADIUS + CUTOFF)), 0, 255).astype(np.uint8)


def build(name, weight):
    face = freetype.Face(str(ROOT / 'fonts/Jost.ttf'))
    face.set_var_design_coords((weight,))
    face.set_pixel_sizes(0, SIZE)
    for start in RANGES:
        end = start + 255
        glyphs = b''
        for cp in range(start, end + 1):
            if face.get_char_index(cp) == 0:
                continue
            face.load_char(cp, freetype.FT_LOAD_RENDER)
            g = face.glyph
            bm = g.bitmap
            w, h = bm.width, bm.rows
            msg = field(1, 0, cp)
            if w and h:
                arr = np.array(bm.buffer, np.uint8).reshape(h, bm.pitch)[:, :w]
                msg += field(2, 2, sdf(arr).tobytes())
            msg += field(3, 0, w) + field(4, 0, h)
            msg += field(5, 0, zigzag(g.bitmap_left)) + field(6, 0, zigzag(g.bitmap_top - SIZE))
            msg += field(7, 0, g.advance.x >> 6)
            glyphs += field(3, 2, msg)
        stack = field(1, 2, name.encode()) + field(2, 2, f'{start}-{end}'.encode()) + glyphs
        out = ROOT / 'public/glyphs' / name / f'{start}-{end}.pbf'
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes(field(1, 2, stack))
    print(name)


if __name__ == '__main__':
    for n, w in WEIGHTS.items():
        build(n, w)
