#!/usr/bin/env node
// Lays out the in-game map tiles of GTADB ("GTA VI Map Tiles (CC BY 4.0) — https://map.gtadb.org", rolux/gtadb.org
// maps/tiles/6/day, files <L>/<L>,<y>,<x>.jpg) as standard XYZ tiles public/tiles/day/<L+12>/<x+2046*2^L>/<y+…>.jpg,
// the frame described in tools/geo.py, and adds zooms 9–11 (scaled down from level 0) so the whole state fits on a
// phone screen. The tiles are not committed; CI fetches GTADB and runs this before the build.
// Usage: node scripts/prepare-tiles.mjs <path to maps/tiles/6/day>
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import sharp from 'sharp';

const src = process.argv[2];
if (!src || !existsSync(src)) {
  console.error('usage: node scripts/prepare-tiles.mjs <gtadb.org/maps/tiles/6/day>');
  process.exit(1);
}
const out = resolve(import.meta.dirname, '../public/tiles/day');
const SEA = { r: 47, g: 142, b: 174 };
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

// Zooms 9–11 from the zoom-12 tiles (GTADB level 0).
const z12 = join(out, '12');
const have = new Map();
for (const x of readdirSync(z12)) for (const yf of readdirSync(join(z12, x))) have.set(`${x}/${parseInt(yf)}`, join(z12, x, yf));
const xs = [...have.keys()].map((k) => +k.split('/')[0]), ys = [...have.keys()].map((k) => +k.split('/')[1]);
for (let z = 11; z >= 9; z--) {
  const f = 2 ** (12 - z);
  for (let tx = Math.floor(Math.min(...xs) / f); tx <= Math.floor(Math.max(...xs) / f); tx++) {
    for (let ty = Math.floor(Math.min(...ys) / f); ty <= Math.floor(Math.max(...ys) / f); ty++) {
      const parts = [];
      for (let i = 0; i < f; i++) for (let j = 0; j < f; j++) {
        const p = have.get(`${tx * f + i}/${ty * f + j}`);
        if (p) parts.push({ input: p, left: i * 256, top: j * 256 });
      }
      if (!parts.length) continue;
      const big = await sharp({ create: { width: 256 * f, height: 256 * f, channels: 3, background: SEA } })
        .composite(parts).png().toBuffer();
      mkdirSync(join(out, String(z), String(tx)), { recursive: true });
      await sharp(big).resize(256, 256, { kernel: 'lanczos3' }).jpeg({ quality: 88 }).toFile(join(out, String(z), String(tx), `${ty}.jpg`));
      n++;
    }
  }
}
console.log(`${n} tiles -> ${out}`);
