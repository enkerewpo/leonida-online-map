// Search over places and finds in all three languages at once.
import { LANGS } from './i18n';
import type { Feature } from './data';

export interface Entry {
  type: 'place' | 'poi';
  feature: Feature;
  keys: string[];
}

export const norm = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’'`.]/g, '').trim();

export function buildIndex(places: Feature[], pois: Feature[]): Entry[] {
  const keysOf = (p: Record<string, any>, fields: string[]) => {
    const out = new Set<string>();
    for (const f of fields) {
      if (typeof p[f] === 'string') out.add(norm(p[f]));
      for (const l of LANGS) if (typeof p[`${f}:${l}`] === 'string') out.add(norm(p[`${f}:${l}`]));
    }
    return [...out];
  };
  return [
    ...places.map((f) => ({ type: 'place' as const, feature: f, keys: keysOf(f.properties ?? {}, ['name']) })),
    ...pois.map((f) => ({ type: 'poi' as const, feature: f, keys: [...keysOf(f.properties ?? {}, ['name']), ...keysOf(f.properties ?? {}, ['area']).map((k) => '\u0001' + k)] })),
  ];
}

/** Name prefix beats word prefix beats substring; area text only counts after names. */
export function search(index: Entry[], q: string, limit = 30): Entry[] {
  const n = norm(q);
  if (!n) return [];
  const scored: [number, Entry][] = [];
  for (const e of index) {
    let best = 0;
    for (const k of e.keys) {
      const isArea = k.startsWith('\u0001');
      const key = isArea ? k.slice(1) : k;
      let s = 0;
      if (key === n) s = 100;
      else if (key.startsWith(n)) s = 80;
      else if (key.split(/[\s-]+/).some((w) => w.startsWith(n))) s = 60;
      else if (key.includes(n)) s = 40;
      if (isArea) s = s * 0.4;
      if (s > best) best = s;
    }
    if (best > 0) scored.push([best + (e.type === 'place' ? 1 : 0), e]);
  }
  return scored.sort((a, b) => b[0] - a[0]).slice(0, limit).map(([, e]) => e);
}
