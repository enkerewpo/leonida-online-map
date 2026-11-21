#!/usr/bin/env python3
"""Imports GTADB's GTA VI landmark list ("GTA VI Landmarks Data (CC BY 4.0) — https://map.gtadb.org",
rolux/gtadb.org map/data/6/landmarks.json) into data/landmarks.geojson: named buildings and places in game
coordinates, with a category and the zoom from which a map app would show them.
Usage: python3 tools/landmarks.py path/to/landmarks.json
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from geo import game_to_lnglat  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
# First matching tag wins: (tag, category, minzoom)
RULES = [
    ('#gas', 'gas', 16), ('#guns', 'guns', 16), ('#modshop', 'modshop', 16), ('#police', 'police', 15.5),
    ('#hospital', 'hospital', 15.5), ('#safehouse', 'safehouse', 15.5), ('#nightclub', 'club', 16),
    ('#stripclub', 'club', 16), ('#bar', 'bar', 16.5), ('#supermarket', 'shop', 16.5), ('supermarket', 'shop', 16.5),
    ('#clothes', 'clothes', 16.5), ('#shoes', 'clothes', 16.5), ('#hair', 'salon', 17), ('#electronics', 'shop', 16.5),
    ('#food', 'food', 17), ('restaurant', 'food', 17), ('#vendor', 'food', 17.5),
    ('#airport', 'airport', 13.5), ('#train', 'transit', 15.5), ('#metro', 'transit', 15.5), ('#metromover', 'transit', 16),
    ('#bus', 'transit', 17), ('#marina', 'marina', 15.5), ('#racetrack', 'sport', 14.5), ('#tennis', 'sport', 16.5),
    ('landmark', 'landmark', 14.5), ('hotel', 'hotel', 15.5), ('government', 'civic', 15.5), ('public', 'civic', 16),
    ('events', 'venue', 15), ('leisure', 'leisure', 16), ('transportation', 'transit', 16), ('retail', 'shop', 16.5),
    ('industrial', 'industrial', 16.5), ('utilities', 'industrial', 17), ('office', 'office', 16.5),
    ('natural', 'nature', 15), ('residential', 'residential', 17.5),
]
SKIP = {'demolished', '//may-not-exist'}

def main():
    d = json.load(open(sys.argv[1]))
    feats = []
    for key, v in d.items():
        name, pos, tags = v[0], v[1], set(v[6])
        if name.startswith("?") or tags & SKIP or len(pos) < 2:
            continue
        parts = [p.strip() for p in name.split(',')]
        cat, mz = 'building', 17
        for tag, c, z in RULES:
            if tag in tags:
                cat, mz = c, z
                break
        lng, lat = game_to_lnglat(pos[0], pos[1])
        p = {'id': key, 'name': parts[0], 'category': cat, 'minzoom': mz}
        if len(parts) > 1:
            p['area'] = ', '.join(parts[1:])
        if 'enterable' in tags:
            p['enterable'] = True
        if 'unconfirmed' in tags:
            p['unconfirmed'] = True
        p['source'] = 'https://map.gtadb.org'
        feats.append({'type': 'Feature', 'properties': p,
                      'geometry': {'type': 'Point', 'coordinates': [round(lng, 7), round(lat, 7)]}})
    with open(ROOT / 'data/landmarks.geojson', 'w') as f:
        f.write('{"type":"FeatureCollection","features":[\n')
        f.write(',\n'.join(json.dumps(x, ensure_ascii=False, separators=(',', ':')) for x in feats))
        f.write('\n]}\n')
    from collections import Counter
    print(len(feats), Counter(x['properties']['category'] for x in feats).most_common())

if __name__ == '__main__':
    main()
