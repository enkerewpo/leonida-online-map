"""Pixel-skeleton to road-graph helpers (used by tools/highways.py)."""
from collections import defaultdict

import cv2
import numpy as np

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
