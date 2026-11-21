"""Leonida's coordinate frame, shared with src/geo.ts.

Data is stored as longitude/latitude so standard GIS tools and MapLibre can read it. The state is placed on the
equator at 0, 0 (where degrees are close to square); one pixel of the reference image is 2.68224 m, from the
poster's scale bar (600 px = 1 mile).
"""
M_PER_PX = 1609.344 / 600
M_PER_DEG = 111319.49
REF_W, REF_H = 5378, 7504  # reference/leonida.png: the map inside the poster's frame


def px_to_lnglat(x, y):
    k = M_PER_PX / M_PER_DEG
    return (x - REF_W / 2) * k, -(y - REF_H / 2) * k


def lnglat_to_px(lng, lat):
    k = M_PER_PX / M_PER_DEG
    return lng / k + REF_W / 2, -lat / k + REF_H / 2
