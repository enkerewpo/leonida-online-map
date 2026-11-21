#!/usr/bin/env node
// Lays out the in-game map tiles of GTADB ("GTA VI Map Tiles (CC BY 4.0) — https://map.gtadb.org", rolux/gtadb.org
// maps/tiles/6/day, files <L>/<L>,<y>,<x>.jpg) as standard XYZ tiles public/tiles/day/<L+12>/<x+2046*2^L>/<y+…>.jpg,
// the frame described in tools/geo.py. The tiles are not committed; CI fetches GTADB and runs this before the build.
// Usage: node scripts/prepare-tiles.mjs <path to maps/tiles/6/day>
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const src = process.argv[2];
if (!src || !existsSync(src)) {
  console.error('usage: node scripts/prepare-tiles.mjs <gtadb.org/maps/tiles/6/day>');
  process.exit(1);
}
const out = resolve(import.meta.dirname, '../public/tiles/day');
rmSync(out, { recursive: true, force: true });
let n = 0;
for (const level of readdirSync(src).filter((d) => /^\d+$/.test(d)).map(Number).sort()) {
  const shift = 2046 * 2 ** level;
  for (const f of readdirSync(join(src, String(level)))) {
    const m = f.match(/^(\d+),(\d+),(\d+)\.jpg$/);
    if (!m) continue;
    const [, , y, x] = m.map(Number);
    const dir = join(out, String(level + 12), String(x + shift));
    mkdirSync(dir, { recursive: true });
    copyFileSync(join(src, String(level), f), join(dir, `${y + shift}.jpg`));
    n++;
  }
}
console.log(`${n} tiles -> ${out}`);
