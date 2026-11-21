#!/usr/bin/env python3
"""Writes name:zh-Hans / name:zh-Hant into data/ from the glossary tools/i18n/zh-Hans.json.

Traditional Chinese is converted from Simplified with OpenCC (s2twp); entries in tools/i18n/zh-Hant.json override
it. Names marked "keep" stay in Latin script (no Chinese field is written). Existing hand-written Chinese names in
data/ are kept unless the glossary marks the name "official".
Usage: python3 tools/apply_i18n.py      (needs: pip install opencc-python-reimplemented)
"""
import json
from pathlib import Path

import opencc

ROOT = Path(__file__).resolve().parent.parent
FILES = ['places', 'landmarks', 'roads-named', 'poi']


def main():
    gl = json.load(open(ROOT / 'tools/i18n/zh-Hans.json'))
    hant_over = {}
    p = ROOT / 'tools/i18n/zh-Hant.json'
    if p.exists():
        hant_over = json.load(open(p))
    cc = opencc.OpenCC('s2twp')
    changed = 0
    for name in FILES:
        path = ROOT / 'data' / f'{name}.geojson'
        if not path.exists():
            continue
        fc = json.load(open(path))
        for f in fc['features']:
            pr = f['properties']
            en = pr.get('name')
            e = gl.get(en) if isinstance(en, str) else None
            # Areas like "Washington Beach, Vice Beach": translate each part the glossary knows.
            if isinstance(pr.get('area'), str):
                parts = [x.strip() for x in pr['area'].split(',')]
                zh = [gl.get(x, {}).get('zh') if gl.get(x, {}).get('status') != 'keep' else None for x in parts]
                if all(zh):
                    pr['area:zh-Hans'] = '，'.join(zh)
                    pr['area:zh-Hant'] = cc.convert(pr['area:zh-Hans'])
            if not e or e.get('status') == 'keep' or not e.get('zh'):
                continue
            if 'name:zh-Hans' in pr and e.get('status') != 'official':
                continue
            pr['name:zh-Hans'] = e['zh']
            pr['name:zh-Hant'] = hant_over.get(en, cc.convert(e['zh']))
            changed += 1
        compact = name in ('landmarks', 'roads-named')
        with open(path, 'w') as fo:
            if compact:
                fo.write('{"type":"FeatureCollection","features":[\n')
                fo.write(',\n'.join(json.dumps(x, ensure_ascii=False, separators=(',', ':')) for x in fc['features']))
                fo.write('\n]}\n')
            else:
                fo.write(json.dumps(fc, ensure_ascii=False, indent=1) + '\n')
    print(f'{changed} names written')


if __name__ == '__main__':
    main()
