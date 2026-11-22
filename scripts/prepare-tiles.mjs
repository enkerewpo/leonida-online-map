#!/usr/bin/env node
// Builds the in-game map tiles from GTADB ("GTA VI Map Tiles (CC BY 4.0) — https://map.gtadb.org", rolux/gtadb.org
// maps/tiles/6/day, 256 px files <L>/<L>,<y>,<x>.jpg; level L is XYZ zoom L+12 at <x+2046*2^L>/<y+…>, the frame
// described in tools/geo.py) as 512 px XYZ tiles public/tiles/day/<z>/<x>/<y>.jpg, z 9–17. A 512 px tile at z is the
// four 256 px tiles of z+1 side by side, so the map needs a quarter of the requests for the same sharpness; z 9–10
// are scaled down from GTADB level 0. The tiles are not committed; CI fetches GTADB and runs this before the build.
// Usage: node scripts/prepare-tiles.mjs <path to maps/tiles/6/day>
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { join, resolve } from 'node:path';
import sharp from 'sharp';

const src = process.argv[2];
if (!src || !existsSync(src)) {
  console.error('usage: node scripts/prepare-tiles.mjs <gtadb.org/maps/tiles/6/day>');
  process.exit(1);
}
const out = resolve(import.meta.dirname, '../public/tiles/day');
// GTADB's own open-sea colour, so filled-in gaps and the background around the tiles do not show as a frame.
const SEA = { r: 47, g: 144, b: 176 };
const MIN_Z = 9, MAX_Z = 17;

// 256 px source tiles by XYZ key.
const tiles = new Map();
for (const level of readdirSync(src).filter((d) => /^\d+$/.test(d)).map(Number)) {
  const shift = 2046 * 2 ** level;
  for (const f of readdirSync(join(src, String(level)))) {
    const m = f.match(/^(\d+),(\d+),(\d+)\.jpg$/);
    if (m) tiles.set(`${level + 12}/${+m[3] + shift}/${+m[2] + shift}`, join(src, String(level), f));
  }
}

rmSync(out, { recursive: true, force: true });
sharp.concurrency(1);
const jobs = [];
for (let z = MAX_Z; z >= MIN_Z; z--) {
  const s = Math.max(z + 1, 12), f = 2 ** (s - z);
  const parents = new Set();
  for (const k of tiles.keys()) {
    const [tz, x, y] = k.split('/').map(Number);
    if (tz === s) parents.add(`${Math.floor(x / f)}/${Math.floor(y / f)}`);
  }
  for (const p of parents) {
    const [X, Y] = p.split('/').map(Number);
    jobs.push(async () => {
      const parts = [];
      for (let i = 0; i < f; i++) for (let j = 0; j < f; j++) {
        const t = tiles.get(`${s}/${X * f + i}/${Y * f + j}`);
        if (t) parts.push({ input: t, left: i * 256, top: j * 256 });
      }
      let img = sharp({ create: { width: 256 * f, height: 256 * f, channels: 3, background: SEA } }).composite(parts);
      if (f > 2) img = sharp(await img.png().toBuffer()).resize(512, 512, { kernel: 'lanczos3' });
      mkdirSync(join(out, String(z), String(X)), { recursive: true });
      await img.jpeg({ quality: 86, mozjpeg: true }).toFile(join(out, String(z), String(X), `${Y}.jpg`));
    });
  }
}
let next = 0;
await Promise.all(Array.from({ length: availableParallelism() }, async () => { while (next < jobs.length) await jobs[next++](); }));
console.log(`${jobs.length} tiles -> ${out}`);
