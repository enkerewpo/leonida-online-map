#!/usr/bin/env python3
"""Builds MapLibre glyph files (signed-distance-field PBFs) from the fonts in fonts/.

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
# Font stack name -> (file, variable-font weight or None)
FONTS = {
    'Jost Medium': ('Jost.ttf', 500), 'Jost SemiBold': ('Jost.ttf', 600), 'Jost Bold': ('Jost.ttf', 700),
    'Barlow Condensed SemiBold': ('BarlowCondensed-SemiBold.ttf', None),
    'Barlow Condensed Bold': ('BarlowCondensed-Bold.ttf', None),
}
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


def sdf(hi, hi_left, hi_top, left, top, w, h, scale=4):
    """Signed distance field for a w x h glyph (plus BUFFER) at 1x, computed from a `scale`x render so the edge is
    exact to a fraction of a pixel (a 1x binarised bitmap gives visibly jagged edges)."""
    W, H = (w + 2 * BUFFER) * scale, (h + 2 * BUFFER) * scale
    canvas = np.zeros((H, W), np.uint8)
    ox = hi_left - (left - BUFFER) * scale
    oy = (top + BUFFER) * scale - hi_top
    hh, hw = hi.shape
    x0, y0 = max(0, ox), max(0, oy)
    x1, y1 = min(W, ox + hw), min(H, oy + hh)
    if x1 > x0 and y1 > y0:
        canvas[y0:y1, x0:x1] = hi[y0 - oy:y1 - oy, x0 - ox:x1 - ox]
    inside = (canvas >= 128).astype(np.uint8)
    d = (cv2.distanceTransform(1 - inside, cv2.DIST_L2, 5) - cv2.distanceTransform(inside, cv2.DIST_L2, 5)) / scale
    d = cv2.resize(d, (w + 2 * BUFFER, h + 2 * BUFFER), interpolation=cv2.INTER_AREA)
    return np.clip(np.round(255 - 255 * (d / RADIUS + CUTOFF)), 0, 255).astype(np.uint8)


def build(name, file, weight):
    face = freetype.Face(str(ROOT / 'fonts' / file))
    big = freetype.Face(str(ROOT / 'fonts' / file))
    if weight:
        face.set_var_design_coords((weight,))
        big.set_var_design_coords((weight,))
    face.set_pixel_sizes(0, SIZE)
    big.set_pixel_sizes(0, SIZE * 4)
    for start in RANGES:
        end = start + 255
        glyphs = b''
        for cp in range(start, end + 1):
            if face.get_char_index(cp) == 0:
                continue
            face.load_char(cp, freetype.FT_LOAD_RENDER)
            g = face.glyph
            w, h = g.bitmap.width, g.bitmap.rows
            msg = field(1, 0, cp)
            if w and h:
                big.load_char(cp, freetype.FT_LOAD_RENDER)
                b = big.glyph.bitmap
                hi = np.array(b.buffer, np.uint8).reshape(b.rows, b.pitch)[:, :b.width] if b.rows else np.zeros((1, 1), np.uint8)
                msg += field(2, 2, sdf(hi, big.glyph.bitmap_left, big.glyph.bitmap_top, g.bitmap_left, g.bitmap_top, w, h).tobytes())
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
    for n, (f, w) in FONTS.items():
        build(n, f, w)
