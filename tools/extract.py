#!/usr/bin/env python3
"""Seeds vector data from Rockstar's official Leonida map.

Reads the colour-managed reference image made by `npm run reference` (reference/leonida.png) and writes a first,
automatic cut of the base layers to data/:

  land.geojson       coastline, with lakes as holes
  landuse.geojson    urban, beach, swamp
  buildings.geojson  building footprints
  roads.geojson      a road network: centrelines split at junctions that share their end points

The output is a starting point for hand editing, not ground truth. Re-running overwrites these files.

How it works
  1. Every pixel is matched to the poster's palette (sea, land, urban ground, building, street, highway, beach,
     lettering, shields). The poster grid lines are found and masked.
  2. Lettering, shields and grid lines are "unknown": areas take the class of the nearest known pixel, so labels
     don't punch holes in the land.
  3. Streets and highways are thinned to centrelines and turned into a graph: junction pixels are merged into one
     node, short spurs are cut, chains through two-way nodes are joined, and each edge is simplified with
     Douglas-Peucker so straight streets become straight segments. Gaps where a label covered a road are bridged
     when the two loose ends line up.

Usage: python3 tools/extract.py [reference/leonida.png]
"""
import json
import math
import sys
from collections import defaultdict
from pathlib import Path

import cv2
import numpy as np
from shapely.geometry import LineString, Polygon, mapping
from skimage.morphology import skeletonize

sys.path.insert(0, str(Path(__file__).parent))
from geo import px_to_lnglat, M_PER_PX as M_PER_PX_REF  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent

PALETTE = {
    'water': ['00abc4', '0db1cb', '38b8cf', '20b4cc', '54bdce', '75c5d3', '75c1cf', '129eb4', '138b9e',
              '3e969d'],  # the last: island shadows cast on water
    'land': ['57998a', '418a72', '778c77', '335a51', '559887', '6c8f69'],
    'urban': ['94a4ad', '8ea6a9', 'a3aab0'],
    'building': ['aabac6', '8fa6c4'],
    'street': ['ccced7', 'cbd4d3', 'd6d8e0'],
    'highway': ['f7f8f2', 'f9faf9', 'fdfdfd'],
    'beach': ['bfb493', 'd8c9a0'],
    'ink': ['483242', '273033'],
    'label': ['f8f8d8', 'f0f0c8', 'e8e8c0'],
    'shield': ['4f669f', 'ed84a3'],
}
NAMES = list(PALETTE)

# Colours of the in-game pause map (a community capture aligned onto the poster by tools/align.py). It has almost
# no lettering, so it shows what the poster's labels, shields, grid and legend cover up.
INGAME = {
    'water': ['52aeca', '419dbc', '5db4cd'],
    'land': ['669877', '75a58e', '81b09e'],
    'urban': ['aeb9bc', 'b8c2c5'],
    'street': ['d1d9db'],
    'highway': ['fcfdfe', 'eef2f3'],
    'beach': ['d7cda5'],
}
C = {n: i for i, n in enumerate(NAMES)}

# Big county and city lettering survives the ink mask; boxes in reference pixels (x0, y0, x1, y1).
LETTERING = [
    (2200, 1300, 3180, 1480), (1840, 2840, 2660, 3020), (3340, 2560, 4340, 2740), (1680, 5480, 2680, 5660),
    (3440, 4240, 4480, 4420), (3400, 3840, 3920, 3980), (1520, 2500, 1860, 2740), (4560, 3560, 4980, 3700),
    (2780, 4280, 3120, 4360), (2860, 5080, 3180, 5180),
    (180, 160, 1100, 1250),  # legend box
    (3900, 5950, 4900, 7350),  # state seal and title
]


# The in-game capture has a few labels of its own (county names, LEONIDA): centre x, y, width, height in reference
# pixels, read with tools/ocr.swift on reference/ingame-aligned.png. Its evidence is not used inside these.
INGAME_LABELS = [(2818, 1299, 780, 110), (3550, 2404, 1100, 120), (2101, 2668, 740, 110), (2835, 3204, 1060, 220),
                 (4024, 4056, 950, 115), (2260, 5421, 1000, 120)]


# Poster artwork that sits on the sea: legend box, compass rose, state seal, title. Nothing inside is geography.
ARTWORK = [('box', 260, 200, 1130, 1300), ('circle', 765, 5333, 330), ('circle', 4384, 6247, 380),
           ('box', 3820, 6680, 5010, 7140)]


def in_artwork(x, y):
    for a in ARTWORK:
        if a[0] == 'box' and a[1] <= x <= a[3] and a[2] <= y <= a[4]:
            return True
        if a[0] == 'circle' and (x - a[1]) ** 2 + (y - a[2]) ** 2 <= a[3] ** 2:
            return True
    return False


def lab(hexes):
    rgb = np.array([[int(h[i:i + 2], 16) for i in (0, 2, 4)] for h in hexes], np.uint8)
    return cv2.cvtColor(rgb[None, :, ::-1], cv2.COLOR_BGR2LAB)[0].astype(np.float32)


def classify(img, palette=None):
    palette = palette or PALETTE
    centres, owner = [], []
    for name, hexes in palette.items():
        k = C[name]
        c = lab(hexes)
        centres.append(c)
        owner += [k] * len(c)
    centres, owner = np.concatenate(centres), np.array(owner)
    L = cv2.cvtColor(img, cv2.COLOR_BGR2LAB).astype(np.float32).reshape(-1, 3)
    out = np.empty(len(L), np.uint8)
    step = 1 << 20
    for s in range(0, len(L), step):
        out[s:s + step] = owner[((L[s:s + step, None, :] - centres[None]) ** 2).sum(-1).argmin(1)]
    return out.reshape(img.shape[:2])


def grid_lines(gray):
    """The poster's grid: thin lines a little lighter than both neighbours, running the full height or width."""
    g = gray.astype(np.int16)
    mask = np.zeros(gray.shape, bool)
    for axis in (1, 0):
        a = g if axis == 1 else g.T
        lighter = (a[:, 2:-2] - np.maximum(a[:, :-4], a[:, 4:]) > 6)
        share = lighter.mean(0)
        for x in np.nonzero(share > 0.25)[0] + 2:
            if axis == 1:
                mask[:, max(0, x - 2):x + 3] = True
            else:
                mask[max(0, x - 2):x + 3, :] = True
    return mask


def narrow_roads(img, cls):
    """Thin roads and tracks, down to 1-2 px wide anti-aliased lines. A pixel is weak evidence when it is lighter than
    its 5 px or 15 px surroundings and grey (not green or cyan); a chain of weak pixels counts when it touches strong
    evidence anywhere, and 1 px gaps in dashed-looking stretches are closed first. City streets come from their
    colour instead, and the outlines of white highways are left to the highway class."""
    from skimage.measure import label as cc_label
    lab_ = cv2.cvtColor(img, cv2.COLOR_BGR2LAB).astype(np.float32)
    L, A, B = lab_[..., 0], lab_[..., 1] - 128, lab_[..., 2] - 128
    ch = np.hypot(A, B)
    op = lambda k: cv2.morphologyEx(L.astype(np.uint8), cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))).astype(np.float32)
    th5, th15 = L - op(5), L - op(15)
    cyan = (A < -12) & (B < -8)
    weak = ((th5 > 7) | (th15 > 14)) & (ch < 26) & ~cyan
    strong = (th15 > 30) & (ch < 18)
    weak = cv2.morphologyEx(weak.astype(np.uint8), cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))).astype(bool)
    near_highway = cv2.dilate((cls == C['highway']).astype(np.uint8), np.ones((9, 9), np.uint8)).astype(bool)
    weak &= ~near_highway & (cls != C['building'])
    comp = cc_label(weak, connectivity=2)
    keep = np.unique(comp[strong & weak])
    m = np.isin(comp, keep[keep > 0])
    n, lab2, st, _ = cv2.connectedComponentsWithStats(m.astype(np.uint8), connectivity=8)
    big = np.zeros(n, bool)
    big[1:] = st[1:, cv2.CC_STAT_AREA] > 40
    return big[lab2]


def fill_unknown(cls, unknown, sigma=5):
    """Fills unknown pixels by a Gaussian-weighted vote of the known classes around them (no streaks), falling back
    to the nearest known pixel where nothing is known within reach."""
    known = (~unknown).astype(np.float32)
    k = int(sigma * 3) | 1
    wsum = cv2.GaussianBlur(known, (k * 2 + 1, k * 2 + 1), sigma)
    best, bestv = np.zeros(cls.shape, np.uint8), np.zeros(cls.shape, np.float32)
    for c in np.unique(cls[~unknown]):
        v = cv2.GaussianBlur(((cls == c) & ~unknown).astype(np.float32), (k * 2 + 1, k * 2 + 1), sigma)
        better = v > bestv
        best[better], bestv[better] = c, v[better]
    near = nearest_fill(cls, unknown)
    out = np.where(unknown & (wsum > 0.02), best, near)
    return np.where(unknown, out, cls).astype(np.uint8)


def nearest_fill(cls, unknown):
    _, idx = cv2.distanceTransformWithLabels(unknown.astype(np.uint8), cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
    ys, xs = np.nonzero(~unknown)
    lut = np.zeros(idx.max() + 1, np.uint8)
    lut[idx[ys, xs]] = cls[ys, xs]
    return lut[idx]


def polygons(mask, min_area, eps, close=0):
    m = mask.astype(np.uint8)
    if close:
        m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((close, close), np.uint8))
    contours, hier = cv2.findContours(m, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    out = []
    if hier is None:
        return out
    hier = hier[0]
    for i, c in enumerate(contours):
        if hier[i][3] != -1 or cv2.contourArea(c) < min_area:
            continue
        shell = cv2.approxPolyDP(c, eps, True)[:, 0, :]
        holes, j = [], hier[i][2]
        while j != -1:
            if cv2.contourArea(contours[j]) >= min_area / 2:
                h = cv2.approxPolyDP(contours[j], eps, True)[:, 0, :]
                if len(h) >= 3:
                    holes.append(h)
            j = hier[j][0]
        if len(shell) < 3:
            continue
        p = Polygon(shell, holes).buffer(0)
        if not p.is_empty:
            out.append(p)
    return out


def building_polygons(mask, min_area=40):
    """Buildings are drawn as flat blocks: a rotated rectangle when it fits, else a tightly simplified outline."""
    n, lab_, stats, _ = cv2.connectedComponentsWithStats(mask.astype(np.uint8), connectivity=4)
    out = []
    for i in range(1, n):
        x, y, w, h, area = stats[i]
        if area < min_area:
            continue
        sub = (lab_[y:y + h, x:x + w] == i).astype(np.uint8)
        cs, _ = cv2.findContours(sub, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        c = max(cs, key=cv2.contourArea) + np.array([x, y])
        rect = cv2.minAreaRect(c)
        if area / max(rect[1][0] * rect[1][1], 1) > 0.82:
            pts = cv2.boxPoints(rect)
        else:
            pts = cv2.approxPolyDP(c, 1.5, True)[:, 0, :].astype(np.float32)
        if len(pts) >= 3:
            p = Polygon(pts).buffer(0)
            if p.area >= 30:
                out.append(p)
    return out


# ---------- road graph ----------

OFFS = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]


def road_graph(skel):
    sk = skel.astype(np.uint8)
    nb = cv2.filter2D(sk, cv2.CV_8U, np.ones((3, 3), np.float32), borderType=cv2.BORDER_CONSTANT) - 1
    nb[sk == 0] = 0
    H, W = sk.shape
    node_px = (sk == 1) & (nb != 2)
    # Junction pixels that touch are one junction.
    ncomp, comp = cv2.connectedComponents(node_px.astype(np.uint8), connectivity=8)
    centroid = np.zeros((ncomp, 2))
    cnt = np.zeros(ncomp)
    ys, xs = np.nonzero(node_px)
    np.add.at(centroid, comp[ys, xs], np.stack([xs, ys], 1))
    np.add.at(cnt, comp[ys, xs], 1)
    centroid[1:] /= np.maximum(cnt[1:, None], 1)

    seen = np.zeros_like(sk, bool)
    edges = []  # [node_a, node_b, [(x, y), ...]]
    for y0, x0 in zip(ys, xs):
        for dy, dx in OFFS:
            y, x = y0 + dy, x0 + dx
            if not (0 <= y < H and 0 <= x < W) or not sk[y, x] or node_px[y, x] or seen[y, x]:
                continue
            path = [(x0, y0)]
            py, px_ = y0, x0
            end = None
            while True:
                path.append((x, y))
                seen[y, x] = True
                nxt = None
                for ddy, ddx in OFFS:
                    yy, xx = y + ddy, x + ddx
                    if (yy, xx) == (py, px_) or not (0 <= yy < H and 0 <= xx < W) or not sk[yy, xx]:
                        continue
                    if node_px[yy, xx]:
                        if comp[yy, xx] == comp[y0, x0] and len(path) < 4:
                            continue
                        end = (xx, yy)
                        break
                    if not seen[yy, xx]:
                        nxt = (yy, xx)
                if end or nxt is None:
                    break
                py, px_ = y, x
                y, x = nxt
            if end is None:
                continue
            path.append(end)
            edges.append([int(comp[y0, x0]), int(comp[end[1], end[0]]), path])
    return edges, centroid


def length(path):
    p = np.array(path, float)
    return float(np.hypot(*np.diff(p, axis=0).T).sum()) if len(p) > 1 else 0.0


def clean_graph(edges, rounds=2, spur=12):
    edges = [e for e in edges if not (e[0] == e[1] and length(e[2]) < 12)]
    for _ in range(rounds):
        deg = defaultdict(int)
        for a, b, _ in edges:
            deg[a] += 1
            deg[b] += 1
        edges = [e for e in edges if not ((deg[e[0]] == 1 or deg[e[1]] == 1) and length(e[2]) < spur)]
    # Join chains through nodes that have exactly two edges.
    alive = {i: e for i, e in enumerate(edges)}
    inc = defaultdict(set)
    for i, (a, b, _) in alive.items():
        inc[a].add(i)
        inc[b].add(i)
    for n in list(inc):
        ids = list(inc[n])
        if len(ids) != 2:
            continue
        i, j = ids
        ea, eb = alive[i], alive[j]
        if ea[0] == ea[1] or eb[0] == eb[1]:
            continue
        pa = ea[2] if ea[1] == n else ea[2][::-1]
        a0 = ea[0] if ea[1] == n else ea[1]
        pb = eb[2] if eb[0] == n else eb[2][::-1]
        b1 = eb[1] if eb[0] == n else eb[0]
        alive[i] = [a0, b1, pa + pb[1:]]
        del alive[j]
        inc[n].clear()
        inc[b1].discard(j)
        inc[b1].add(i)
    return list(alive.values())


def bridge_gaps(lines, unknown, max_gap=160, max_angle=18):
    """Connects loose road ends on either side of a label: close, facing each other, and lined up."""
    ends = []
    for k, pts in enumerate(lines):
        for at in (0, -1):
            p = np.array(pts[at], float)
            q = np.array(pts[1 if at == 0 else -2], float)
            d = p - q
            n = np.hypot(*d)
            if n == 0:
                continue
            x, y = int(p[0]), int(p[1])
            if unknown[max(0, y - 8):y + 9, max(0, x - 8):x + 9].any():
                ends.append((k, p, d / n))
    used, out = set(), []
    for i, (ki, pi, di) in enumerate(ends):
        if i in used:
            continue
        best = None
        for j, (kj, pj, dj) in enumerate(ends):
            if j <= i or kj == ki or j in used:
                continue
            v = pj - pi
            dist = np.hypot(*v)
            if dist < 4 or dist > max_gap:
                continue
            v = v / dist
            if math.degrees(math.acos(np.clip(v @ di, -1, 1))) > max_angle:
                continue
            if math.degrees(math.acos(np.clip(-v @ dj, -1, 1))) > max_angle:
                continue
            t = np.linspace(0, 1, 12)[1:-1, None]
            mid = (pi + (pj - pi) * t).astype(int)
            if unknown[np.clip(mid[:, 1], 0, unknown.shape[0] - 1), np.clip(mid[:, 0], 0, unknown.shape[1] - 1)].mean() < 0.6:
                continue
            if best is None or dist < best[0]:
                best = (dist, j, pj)
        if best:
            used |= {i, best[1]}
            out.append([tuple(pi), tuple(best[2])])
    return out


def chaikin(p, corner_deg=40, rounds=2):
    """Rounds gentle bends into smooth curves; keeps sharp corners (street corners, ramps meeting roads)."""
    for _ in range(rounds):
        if len(p) < 3:
            return p
        out = [p[0]]
        for i in range(1, len(p) - 1):
            v1, v2 = p[i] - p[i - 1], p[i + 1] - p[i]
            n1, n2 = np.hypot(*v1), np.hypot(*v2)
            ang = math.degrees(math.acos(np.clip(v1 @ v2 / max(n1 * n2, 1e-9), -1, 1)))
            if ang > corner_deg:
                out.append(p[i])
                continue
            out.append(p[i] - v1 * 0.25)
            out.append(p[i] + v2 * 0.25)
        out.append(p[-1])
        p = np.array(out)
    return p


def shape_line(pts, a, b):
    """Centreline pixels to a clean vector line: snap the ends to the junction centres (dropping the pixel hook next
    to them), straighten what is straight, and keep curves as curves."""
    trim = lambda q, c: q[np.hypot(*(q - c).T) > 3] if len(q) > 2 else q
    body = trim(trim(pts, a), b)
    pts = np.vstack([a, body, b]) if len(body) else np.vstack([a, b])
    if length(pts) < 8:
        return None
    simp = cv2.approxPolyDP(pts.astype(np.float32)[:, None, :], 1.1, False)[:, 0, :].astype(float)
    if len(simp) < 2:
        return None
    return chaikin(simp) if length(simp) > 60 else simp


def review_dead_ends(lines, score, blocked, win=70, max_len=95):
    """Looks at every loose end again. Walks the cheapest path through road-like pixels (by `score`) to any other road
    ahead of the end; if the path is short and road-like along its whole length the road is continued, otherwise the
    end is a real dead end. Returns the extra paths."""
    from skimage.graph import MCP_Geometric
    H, W = score.shape
    canvas = np.zeros((H, W), np.int32)
    for k, l in enumerate(lines):
        cv2.polylines(canvas, [np.round(np.array(l)).astype(np.int32)], False, k + 1, 1)
    count = defaultdict(int)
    for l in lines:
        for p in (l[0], l[-1]):
            count[(round(p[0]), round(p[1]))] += 1
    extra = []
    for k, l in enumerate(lines):
        for at in (0, -1):
            p = np.array(l[at], float)
            if count[(round(p[0]), round(p[1]))] > 1:
                continue
            q = np.array(l[1] if at == 0 else l[-2], float)
            d = p - q
            if np.hypot(*d) == 0:
                continue
            d /= np.hypot(*d)
            x, y = int(round(p[0])), int(round(p[1]))
            x0, y0, x1, y1 = max(0, x - win), max(0, y - win), min(W, x + win + 1), min(H, y + win + 1)
            sc = score[y0:y1, x0:x1]
            cost = 1.0 / np.clip(sc, 0.08, None)
            cost[blocked[y0:y1, x0:x1]] = 1e3
            tgt = canvas[y0:y1, x0:x1]
            yy, xx = np.mgrid[y0:y1, x0:x1]
            ahead = ((xx - x) * d[0] + (yy - y) * d[1]) > 0.35 * np.hypot(xx - x, yy - y)
            near_self = np.hypot(xx - x, yy - y) < 10
            targets = (tgt > 0) & (tgt != k + 1) & ahead & ~near_self
            if not targets.any():
                continue
            m = MCP_Geometric(cost)
            cum, _ = m.find_costs([(y - y0, x - x0)])
            ty, tx = np.unravel_index(np.where(targets, cum, np.inf).argmin(), cum.shape)
            if not np.isfinite(cum[ty, tx]):
                continue
            path = np.array(m.traceback((ty, tx)))
            if len(path) < 2 or len(path) > max_len:
                continue
            vals = sc[path[:, 0], path[:, 1]]
            if np.mean(vals > 0.35) < 0.85:
                continue
            pts = np.stack([path[:, 1] + x0, path[:, 0] + y0], 1).astype(float)
            simp = cv2.approxPolyDP(pts.astype(np.float32)[:, None, :], 1.1, False)[:, 0, :].astype(float)
            extra.append(([tuple(v) for v in simp], k))
    return extra


def heal(lines, max_join=45, max_snap=22):
    """Joins dead ends: two loose ends that face each other are connected; a loose end that points at another road
    within reach is extended onto it (a T junction). Returns the extra segments."""
    from shapely.strtree import STRtree
    from shapely.geometry import Point
    geoms = [LineString(l) for l in lines]
    tree = STRtree(geoms)
    ends = []
    endpoint_count = defaultdict(int)
    for l in lines:
        for p in (l[0], l[-1]):
            endpoint_count[(round(p[0]), round(p[1]))] += 1
    for k, l in enumerate(lines):
        for at in (0, -1):
            p = np.array(l[at], float)
            if endpoint_count[(round(p[0]), round(p[1]))] > 1:
                continue
            q = np.array(l[1] if at == 0 else l[-2], float)
            d = p - q
            n = np.hypot(*d)
            if n > 0:
                ends.append((k, p, d / n))
    extra, used = [], set()
    pts = np.array([e[1] for e in ends]) if ends else np.zeros((0, 2))
    for i, (ki, pi, di) in enumerate(ends):
        if i in used:
            continue
        best = None
        if len(pts):
            dist = np.hypot(*(pts - pi).T)
            for j in np.argsort(dist)[:8]:
                if j == i or j in used or ends[j][0] == ki or dist[j] > max_join or dist[j] < 1:
                    continue
                v = (pts[j] - pi) / dist[j]
                if v @ di > math.cos(math.radians(35)) and -v @ ends[j][2] > math.cos(math.radians(35)):
                    best = ('join', j, pts[j])
                    break
        if best is None:
            probe = Point(*(pi + di * max_snap))
            seg = LineString([pi, pi + di * max_snap])
            for g in tree.query(seg):
                if g == ki:
                    continue
                hit = seg.intersection(geoms[g])
                if not hit.is_empty:
                    hp = np.array(hit.coords[0] if hit.geom_type == 'Point' else hit.representative_point().coords[0])
                    if best is None or np.hypot(*(hp - pi)) < np.hypot(*(best[2] - pi)):
                        best = ('snap', g, hp)
        if best:
            used.add(i)
            if best[0] == 'join':
                used.add(best[1])
            extra.append(([tuple(pi), tuple(best[2])], ki))
    return extra


# ---------- output ----------

def feature(geom, props):
    p = geom.representative_point()
    if in_artwork(p.x, p.y):
        return None
    def conv(o):
        if isinstance(o, (list, tuple)) and o and isinstance(o[0], (int, float)):
            return [round(v, 6) for v in px_to_lnglat(*o)]
        return [conv(v) for v in o]
    g = mapping(geom)
    return {'type': 'Feature', 'properties': props, 'geometry': {'type': g['type'], 'coordinates': conv(g['coordinates'])}}


def write(name, feats):
    path = ROOT / 'data' / f'{name}.geojson'
    with open(path, 'w') as f:
        f.write('{"type":"FeatureCollection","features":[\n')
        feats = [x for x in feats if x is not None]
        f.write(',\n'.join(json.dumps(x, ensure_ascii=False, separators=(',', ':')) for x in feats))
        f.write('\n]}\n')
    print(f'{path.relative_to(ROOT)}: {len([x for x in feats if x is not None])} features')


def main():
    src = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith('--') else str(ROOT / 'reference/leonida.png')
    img = cv2.imread(src)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    cls = classify(img)
    grid = grid_lines(gray)
    grid_all = grid.copy()
    print('classified; grid px', int(grid.sum()))

    ink = ((gray < 58) | (cls == C['ink'])).astype(np.uint8)
    # Railways and road casings are dark too, but long; lettering strokes are short. Keep only short ink.
    n, lab_, stats, _ = cv2.connectedComponentsWithStats(ink, connectivity=8)
    long_ = np.zeros(n, bool)
    long_[1:] = np.maximum(stats[1:, cv2.CC_STAT_WIDTH], stats[1:, cv2.CC_STAT_HEIGHT]) > 110
    ink = (ink.astype(bool) & ~long_[lab_])
    lettering = np.zeros(gray.shape, bool)
    for x0, y0, x1, y1 in LETTERING:
        lettering[y0:y1, x0:x1] = True
    # Highway shields: the coloured badge plus the white inside it.
    shield = cv2.dilate((cls == C['shield']).astype(np.uint8), np.ones((17, 17), np.uint8))
    shield = cv2.morphologyEx(shield, cv2.MORPH_CLOSE, np.ones((25, 25), np.uint8)).astype(bool)
    # Dark ink only counts as lettering next to letter fill (cream or white); island shadows are dark too but sit
    # between land and water.
    letter_fill = cv2.dilate(np.isin(cls, [C['label'], C['highway']]).astype(np.uint8), np.ones((7, 7), np.uint8)).astype(bool)
    ink &= letter_fill
    labels = (cv2.dilate(ink.astype(np.uint8), np.ones((9, 9), np.uint8)).astype(bool)
              | cv2.dilate((cls == C['label']).astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool) | shield | lettering)
    # Route shields drawn in white: solid white blobs wider than any road.
    blob = cv2.morphologyEx((cls == C['highway']).astype(np.uint8), cv2.MORPH_OPEN, np.ones((15, 15), np.uint8))
    n, lab_, stats, _ = cv2.connectedComponentsWithStats(blob)
    small = np.zeros(n, bool)
    small[1:] = np.maximum(stats[1:, cv2.CC_STAT_WIDTH], stats[1:, cv2.CC_STAT_HEIGHT]) < 90
    labels |= cv2.dilate((small[lab_] & (lab_ > 0)).astype(np.uint8), np.ones((9, 9), np.uint8)).astype(bool)
    # Every printed label, by the boxes tools/ocr.swift read off the map (tools/ocr-labels.jsonl).
    ocr = ROOT / 'tools/ocr-labels.jsonl'
    ocr_box = np.zeros(gray.shape, bool)
    if ocr.exists():
        for line in open(ocr):
            try:
                t = json.loads(line)
            except ValueError:
                continue
            if t['c'] < 0.3 or t['h'] < 8:
                continue
            w, h = int(t['w'] * 0.58) + 6, int(t['h'] * 0.68) + 4
            ocr_box[max(0, t['y'] - h):t['y'] + h, max(0, t['x'] - w):t['x'] + w] = True
        # Inside a text box only the lettering itself is unknown: letter fill, outline and shadow (anything that is
        # not plainly land or water colour), grown by a few pixels. The ground between letters keeps its class.
        letterish = ~np.isin(cls, [C['land'], C['water'], C['urban'], C['beach']])
        letterish |= (gray < 70)
        labels |= ocr_box & cv2.dilate(letterish.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool)
    # Shields and letters are outlines: also cover what they enclose (small closed shapes only).
    cs, _ = cv2.findContours(labels.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    fill = np.zeros(labels.shape, np.uint8)
    for c in cs:
        x, y, w, h = cv2.boundingRect(c)
        if max(w, h) < 160:
            cv2.drawContours(fill, [c], -1, 1, -1)
    labels |= fill.astype(bool)
    unknown = labels | grid
    # Thin roads are anti-aliased into the ground colour, so also take narrow strokes that are lighter than their
    # surroundings and nearly grey (a white top-hat), not only pixels that match the street colours.
    L, A, B = cv2.split(cv2.cvtColor(img, cv2.COLOR_BGR2LAB).astype(np.int16))
    tophat = L - cv2.morphologyEx(L.astype(np.uint8), cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))).astype(np.int16)
    chroma = np.hypot(A - 128, B - 128)
    rural = cv2.boxFilter(np.isin(cls, [C['land'], C['ink'], C['street']]).astype(np.float32), -1, (21, 21)) > 0.5
    # Road evidence: lighter than the local ground and grey rather than green. Hysteresis keeps faint stretches
    # (roads darkened by hill shading) as long as they connect to a clear one, so tracks don't break up.
    from skimage.filters import apply_hysteresis_threshold
    Lf = L.astype(np.float32)
    ground = cv2.morphologyEx(L.astype(np.uint8), cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))).astype(np.float32)
    score = (Lf - ground) / 40 - np.maximum(chroma.astype(np.float32) - 10, 0) / 25
    score[~rural] = 0
    thin = narrow_roads(img, cls)
    roads_px = np.isin(cls, [C['street'], C['highway']]) | thin
    covered = labels | grid
    covered_ok = np.zeros(covered.shape, bool)
    ingame_path = ROOT / 'reference/ingame-aligned.png'
    if ingame_path.exists():
        ing = classify(cv2.imread(str(ingame_path)), INGAME)
        for cx, cy, w, h in INGAME_LABELS:
            ing[max(0, cy - h * 6 // 10):cy + h * 6 // 10, max(0, cx - w * 6 // 10):cx + w * 6 // 10] = C['ink']
        # Grid lines are 5 px wide: their neighbours on the poster are the better guess, so only labels take the
        # in-game classes.
        cls = np.where(labels, ing, cls)
        covered = labels
        under = covered & np.isin(ing, [C['street'], C['highway']])
        # Cross-check: a poster stroke counts as a road only if the in-game map has a road close by. This drops
        # big lettering, shields and other light artwork that the colour rules alone mistake for roads.
        ing_road = cv2.dilate(np.isin(ing, [C['street'], C['highway']]).astype(np.uint8), np.ones((13, 13), np.uint8)).astype(bool)
        # Only white strokes need it (lettering and shields are white); grey streets and thin tracks are kept as drawn.
        roads_px = (roads_px & ~covered & (ing_road | (cls != C['highway']))) | under
        labels = labels & ~np.isin(ing, [C['street'], C['highway'], C['water'], C['land'], C['urban'], C['beach']])
        unknown = labels | (grid & ~np.isin(ing, [C['street'], C['highway'], C['water'], C['land'], C['urban'], C['beach']]))
        grid = grid & unknown
        covered_ok = covered & ~unknown
        print('filled from in-game map:', int(covered.sum() - unknown.sum()), 'px')
    base = fill_unknown(cls, unknown | roads_px | (cls == C['building']) | grid_all)
    base = cv2.medianBlur(base, 3)

    land = base != C['water']
    write('land', [feature(p, {'class': 'land'}) for p in polygons(land, 20, 0.9)])

    use = [feature(p, {'class': 'urban'}) for p in polygons(base == C['urban'], 1500, 4.0, close=9)]
    use += [feature(p, {'class': 'beach'}) for p in polygons(base == C['beach'], 300, 2.5)]
    water = (base == C['water']).astype(np.uint8)
    shore = cv2.morphologyEx(water, cv2.MORPH_GRADIENT, np.ones((3, 3), np.uint8)).astype(np.float32)
    wf = cv2.boxFilter(water.astype(np.float32), -1, (61, 61))
    sd = cv2.boxFilter(shore, -1, (61, 61))
    marsh = (wf > 0.15) & (wf < 0.8) & (sd > 0.08)
    marsh = cv2.morphologyEx(marsh.astype(np.uint8), cv2.MORPH_OPEN, np.ones((15, 15), np.uint8))
    marsh = cv2.morphologyEx(marsh, cv2.MORPH_CLOSE, np.ones((31, 31), np.uint8)).astype(bool)
    n, lab_, st, _ = cv2.connectedComponentsWithStats(marsh.astype(np.uint8))
    big = np.zeros(n, bool)
    big[1:] = st[1:, cv2.CC_STAT_AREA] > 25000
    # Only the land inside a marsh is wetland; its channels stay water (holes in the land layer).
    swamp = big[lab_] & land & (base != C['urban'])
    use += [feature(p, {'class': 'swamp'}) for p in polygons(swamp, 20, 0.9)]
    write('landuse', use)

    bmask = ((cls == C['building']) & ~unknown).astype(np.uint8)
    bmask = cv2.morphologyEx(bmask, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    write('buildings', [feature(p, {'class': 'building'}) for p in building_polygons(bmask)])

    rm = (roads_px & ~unknown & ~grid_all).astype(np.uint8)
    rm = cv2.morphologyEx(rm, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
    hw = cls == C['highway']
    width = cv2.distanceTransform(rm, cv2.DIST_L2, 3)
    skel = skeletonize(rm.astype(bool))
    if '--debug' in sys.argv:
        np.savez_compressed('/tmp/leonida-debug.npz', rm=rm, skel=skel, labels=labels, grid=grid, base=base, cls=cls)
    edges, cent = road_graph(skel)
    print('skeleton px', int(skel.sum()), 'raw edges', len(edges))
    edges = clean_graph(edges)
    edges = [e for e in edges if not (e[0] == e[1] and length(e[2]) < 500)]
    edges = clean_graph(edges, rounds=1, spur=12)
    print('clean edges', len(edges))

    lines, props = [], []
    for a, b, path in edges:
        if length(path) < 8:
            continue
        simp = shape_line(np.array(path, float), cent[a], cent[b])
        if simp is None:
            continue
        ix = np.array(path[1:-1] or path)
        w = float(np.median(width[ix[:, 1], ix[:, 0]])) * 2
        white = float(hw[ix[:, 1], ix[:, 0]].mean())
        kind = 'motorway' if white > 0.5 and w >= 6 else 'primary' if white > 0.5 or w >= 7 else 'street'
        lines.append([tuple(map(float, p)) for p in simp])
        props.append(kind)
    reviewed = review_dead_ends(lines, np.maximum(score, roads_px.astype(np.float32) * 2), unknown & ~covered_ok)
    print('dead ends continued after review', len(reviewed))
    for seg, k in reviewed:
        lines.append(seg)
        props.append(props[k])
    healed = heal(lines)
    print('healed', len(healed))
    for seg, k in healed:
        lines.append(seg)
        props.append(props[k])
    bridges = bridge_gaps(lines, labels, max_gap=160)
    bridges += bridge_gaps(lines + bridges, grid, max_gap=16, max_angle=25)
    print('bridged', len(bridges))
    lines += bridges
    props += ['street'] * len(bridges)
    write('roads', [feature(LineString(l), {'class': c}) for l, c in zip(lines, props) if len(l) >= 2])


if __name__ == '__main__':
    main()
