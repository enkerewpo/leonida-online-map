#!/usr/bin/env python3
"""Turns the text read off the official map (tools/ocr.swift) into data/places.geojson.

Each label keeps its printed position. The kind comes from how the poster prints it: county names are the biggest
white capitals, towns white mixed case, districts and islands cream capitals, landmarks dark purple, water names
dark teal. Names Rockstar has published in Chinese get name:zh-Hans / name:zh-Hant; the rest stay English until
someone adds the in-game translation.

Usage: swift tools/ocr.swift reference/leonida.png > /tmp/ocr.jsonl && python3 tools/names.py /tmp/ocr.jsonl
"""
import json
import re
import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from geo import px_to_lnglat  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
ZH = {'Leonida': ('雷奥奈达州', '雷奧奈達州'), 'Vice City': ('罪恶城', '罪惡城')}
SKIP_BOXES = [(150, 150, 1150, 1300), (3900, 5950, 4950, 7400)]  # legend, seal and title
# Canonical names (as printed on the official map and in community region lists) and their kind. OCR readings are
# matched against this list; a reading that matches nothing is kept only if it is a clean landmark label.
CANON = {
    'county': ['Lummox County', 'Kelly County', 'Leonard County', 'Vice-Dale County', 'Mariana County'],
    'city': ['Vice City', 'Port Gellhorn'],
    'town': ['Ambrosia', 'Hamlet', 'Capri', 'Key Lento', 'Grassrivers', 'Watson Bay', 'Belville', 'Millport', 'Grayson',
             'Bonanza', 'Moreau', 'Waning Sands', 'Gellhorn', 'Southwind', 'Frogswater', 'Big Pine', 'Bluegrass',
             'Tequesta', 'Vice Beach', 'Belpoint'],
    'district': ['Little Cuba', 'Downtown', 'Salton', 'Rockridge', 'Crosstown', 'Bayside', 'La Perle', 'Balsero',
                 'Stockyard', 'Decor District', 'Leaf Links', 'Southside', 'Tequesta Retreat', 'Ocean Beach',
                 'Washington Beach', 'Vinewood Beach', 'Port Vice City', 'South Vice-Dale', 'West Vice-Dale County',
                 'South Kelly County', 'North Kelly County', 'North Leonard County', 'South Leonard County',
                 'East Lummox County', 'South West Lummox County', 'Pelican Valley', 'Wild Hog Point', 'Sandbars',
                 'Manifest Canyon', 'Emerald Springs', 'Buckskin Swamp', 'Mount Kalaga National Park',
                 'Richard Barebone State Park', 'Breakwater Quarry', 'Gullet Marsh', 'North Mariana County'],
    'island': ['Hyde Island', 'Saint Attaway Islands', 'Frampton Islands', 'Featherstone Islands', 'Zephyr Islands',
               'Little Hardin Island', 'Draper Island', 'Crude Islands', 'Washington Island', 'Penmarch Isle',
               'Oldby Island', 'Rialto Islands', 'Casanova Island', 'Catalan Island', 'Vespucci Island',
               'Starfish Island', 'Waxman Island', 'Dalton Island', 'Gloriana Key', 'Catalan Key', 'Corsair Key',
               'Shoeless Keys', 'Riquezas Keys', 'Permit Keys', 'Goose Key', 'Maroon Key', 'Abismo Key', 'Bobcat Key',
               'Harbor Key'],
    'water': ['Partridge Bay', 'Okchiloha Bay', 'Moreau River', 'Lake Tallaloko', 'San Malo Bay', 'Millport Basin',
              'Lake Leonida', 'Atlantic Ocean', 'Draper Bay', 'Borrachero Sound', 'Burial Creek', 'Emerald River',
              'Capri Sound', 'Tortoise Lake', 'Nehrling River', 'Catalan Bay', 'Bobcat Bight', 'Tola Bay',
              'Gulf of Leonida', 'Pelican River', 'Wetman Bay', 'Leonida Bay', 'Cottonmouth Lake', 'Gambit Bay',
              'Leonida Straits', 'Peregrine Bay', 'Peacock Bay', 'Leith River', 'Kalaga Reservoir', 'Three Toe Lake'],
    'airport': ['VCIA', 'Mile Zero Air Station', 'Henry J Edwards Airport', 'Wild Hog Airfield'],
}
CANON_KIND = {n: k for k, ns in CANON.items() for n in ns}

JUNK = re.compile(r'^(INTERSTATE|DALE|COUNTY|\d+[A-Z]?|[A-Z]{1,2}|LEGEND|SCALE|VISIT.*|LEONIDAN?)$')


def kind_of(img, t):
    x, y, w, h = t['x'], t['y'], t['w'], t['h']
    box = img[max(0, y - h // 2):y + h // 2, max(0, x - w // 2):x + w // 2]
    if box.size == 0:
        return None
    lab = cv2.cvtColor(box, cv2.COLOR_BGR2LAB).reshape(-1, 3).astype(int)
    L, A, B = lab[:, 0], lab[:, 1] - 128, lab[:, 2] - 128
    cream = ((L > 225) & (B > 12)).mean()
    white = ((L > 235) & (abs(B) < 8) & (abs(A) < 6)).mean()
    purple = ((L < 120) & (A > 6) & (B < -4)).mean()
    teal = ((L < 150) & (L > 60) & (A < -6) & (B < 0)).mean()
    text = t['t']
    upper = text.upper() == text
    if cream > 0.08 and cream >= white:
        return 'district'
    if purple > 0.06 and purple > teal:
        return 'landmark'
    if teal > 0.06:
        return 'water'
    if white > 0.06:
        if h >= 70 and upper:
            return 'county'
        if h >= 46:
            return 'city'
        return 'town'
    return 'water' if not upper else 'district'


def clean(s):
    s = s.replace('•', '').replace('·', '').strip(" .'-")
    s = re.sub(r'\s+', ' ', s)
    return s


def main():
    rows = [json.loads(l) for l in open(sys.argv[1])]
    img = cv2.imread(str(ROOT / 'reference/leonida.png'))
    out = []
    for r in rows:
        t = clean(r['t'])
        if r['c'] < 0.5 or len(t) < 3 or not t.isascii() or JUNK.match(t):
            continue
        if any(x0 <= r['x'] <= x1 and y0 <= r['y'] <= y1 for x0, y0, x1, y1 in SKIP_BOXES):
            continue
        r['t'] = t
        out.append(r)
    # Overlapping tiles read the same label twice; tile edges cut words. Keep the longest reading nearby.
    out.sort(key=lambda r: -len(r['t']))
    keep = []
    for r in out:
        if any(abs(r['x'] - k['x']) < max(k['w'], 60) and abs(r['y'] - k['y']) < max(k['h'], 30)
               and (r['t'].lower() in k['t'].lower()) for k in keep):
            continue
        keep.append(r)
    import difflib
    for r in keep:
        r['kind'] = kind_of(img, r)
    norm = lambda t: re.sub(r'[^a-z ]', '', t.lower().replace('-', ' ')).strip()
    canon_norm = {norm(n): n for n in CANON_KIND}

    def match(t):
        n = norm(t)
        if n in canon_norm:
            return canon_norm[n]
        best = difflib.get_close_matches(n, list(canon_norm), n=1, cutoff=0.8)
        return canon_norm[best[0]] if best else None

    keep.sort(key=lambda r: r['y'])
    used, named = set(), {}
    # Two-line labels first: a pair stacked on each other that together match a known name.
    for i, a in enumerate(keep):
        for j in range(i + 1, len(keep)):
            b = keep[j]
            dy = b['y'] - a['y']
            if dy > 2.2 * max(a['h'], b['h']):
                break
            if abs(b['x'] - a['x']) < 0.5 * max(a['w'], b['w']) + 30:
                m = match(a['t'] + ' ' + b['t'])
                if m and i not in used and j not in used:
                    used |= {i, j}
                    named.setdefault(m, []).append(((a['x'] + b['x']) / 2, (a['y'] + b['y']) / 2, max(a['h'], b['h'])))
    landmarks = []
    for i, r in enumerate(keep):
        if i in used:
            continue
        m = match(r['t'])
        if m:
            named.setdefault(m, []).append((r['x'], r['y'], r['h']))
        elif r['kind'] == 'landmark' and r['c'] >= 0.99 and re.fullmatch(r"[A-Z][A-Za-z'.& ]{4,}", r['t']):
            landmarks.append(r)
    # Landmarks printed on two lines (e.g. 'Leonida' / 'State Prison').
    landmarks.sort(key=lambda r: r['y'])
    lm, skip = [], set()
    for i, a in enumerate(landmarks):
        if i in skip:
            continue
        for j in range(i + 1, len(landmarks)):
            b = landmarks[j]
            if b['y'] - a['y'] > 1.8 * a['h']:
                break
            if abs(b['x'] - a['x']) < 0.5 * max(a['w'], b['w']) and abs(a['h'] - b['h']) < 6:
                a = dict(a, t=a['t'] + ' ' + b['t'], y=(a['y'] + b['y']) / 2)
                skip.add(j)
                break
        lm.append(a)
    feats = []
    RANK = {'county': 1, 'city': 2, 'town': 3, 'district': 4, 'island': 4, 'water': 4, 'airport': 4, 'landmark': 5}
    def add(name, kind, x, y):
        lng, lat = px_to_lnglat(x, y)
        p = {'name': name, 'kind': kind, 'rank': RANK[kind]}
        if name in ZH:
            p['name:zh-Hans'], p['name:zh-Hant'] = ZH[name]
        p['source'] = 'Rockstar Games official Leonida map (rockstargames.com/VI/media)'
        feats.append({'type': 'Feature', 'properties': p, 'geometry': {'type': 'Point', 'coordinates': [round(lng, 6), round(lat, 6)]}})
    for name, pos in named.items():
        x, y, _ = max(pos, key=lambda q: q[2])  # the biggest printing of a name (tile duplicates removed)
        add(name, CANON_KIND[name], x, y)
    for r in lm:
        add(r['t'], 'landmark', r['x'], r['y'])
    lng, lat = px_to_lnglat(2689, 3600)
    feats.insert(0, {'type': 'Feature', 'properties': {'name': 'Leonida', 'kind': 'state', 'rank': 0, 'name:zh-Hans': ZH['Leonida'][0], 'name:zh-Hant': ZH['Leonida'][1], 'source': 'Rockstar Games'}, 'geometry': {'type': 'Point', 'coordinates': [round(lng, 6), round(lat, 6)]}})
    with open(ROOT / 'data/places.geojson', 'w') as f:
        f.write('{"type":"FeatureCollection","features":[\n')
        f.write(',\n'.join(json.dumps(x, ensure_ascii=False, separators=(',', ':')) for x in feats))
        f.write('\n]}\n')
    from collections import Counter
    print(len(feats), Counter(x['properties']['kind'] for x in feats))
    for x in feats:
        print(x['properties']['kind'][:5], x['properties']['name'])
    missing = sorted(set(CANON_KIND) - {x['properties']['name'] for x in feats})
    print('not found on the map:', missing)


if __name__ == '__main__':
    main()
