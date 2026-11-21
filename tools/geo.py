"""Leonida's coordinate frame, shared with src/geo.ts.

The base map is the in-game map tile pyramid of GTADB ("GTA VI Map Tiles (CC BY 4.0) — https://map.gtadb.org").
Its coordinates are game coordinates in metres (x east, y north), mapped to tile pixels at level L as
  px = (x + 16384) * 2^L / 32,  py = (16384 - y) * 2^L / 32.
For a standard web map, GTADB level L is served as XYZ zoom L + 12, with the tile index shifted by 2046 * 2^L, which
puts Leonida on the equator around 0, 0. Data files store longitude/latitude in that frame.

Positions read off Rockstar's official poster (tools/names.py) are first taken to game coordinates with the affine in
tools/z5_to_ref.json (zoom-5 mosaic pixel, origin tile 17, to poster pixel).
"""
import json
import math
from pathlib import Path

import numpy as np

ZOOM_SHIFT = 12
TILE_SHIFT = 2046
WORLD_PX_Z12 = 256 * 2 ** 12


def game_to_lnglat(x, y):
    px = TILE_SHIFT * 256 + (x + 16384) / 32
    py = TILE_SHIFT * 256 + (16384 - y) / 32
    lng = px / WORLD_PX_Z12 * 360 - 180
    lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * py / WORLD_PX_Z12))))
    return lng, lat


def lnglat_to_game(lng, lat):
    px = (lng + 180) / 360 * WORLD_PX_Z12
    s = math.sin(math.radians(lat))
    py = (0.5 - math.log((1 + s) / (1 - s)) / (4 * math.pi)) * WORLD_PX_Z12
    return (px - TILE_SHIFT * 256) * 32 - 16384, 16384 - (py - TILE_SHIFT * 256) * 32


_T = None


def poster_px_to_game(x, y):
    """Poster pixel (reference/leonida.png) to game metres."""
    global _T
    if _T is None:
        m = np.array(json.load(open(Path(__file__).with_name('z5_to_ref.json')))['matrix'])
        _T = np.linalg.inv(np.vstack([m, [0, 0, 1]]))
    zx, zy, _ = _T @ [x, y, 1]
    gx, gy = zx + 17 * 256, zy + 17 * 256  # zoom-5 global pixels; 1 px = 1 m at zoom 5
    return gx - 16384, 16384 - gy


def px_to_lnglat(x, y):
    """Poster pixel to lon/lat (used by tools/names.py)."""
    return game_to_lnglat(*poster_px_to_game(x, y))
