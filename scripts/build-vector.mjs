#!/usr/bin/env node
// Builds public/tiles/vector.pmtiles from build/vector/L*.geojsonl (tools/vectorize.py on GTADB's day tiles): the
// in-game map traced into flat colour polygons, one source level per zoom band (see ZOOMS in tools/vectorize.py),
// so detail follows the original map's own levels and stays sharp at every zoom. Needs tippecanoe 2.x on PATH.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const dir = join(ROOT, 'build/vector');
const inputs = existsSync(dir) ? readdirSync(dir).filter((f) => /^L\d\.geojsonl$/.test(f)).sort().map((f) => join(dir, f)) : [];
if (!inputs.length) {
  console.error('build/vector/L*.geojsonl are missing: run python3 tools/vectorize.py <gtadb day tiles>');
  process.exit(1);
}
mkdirSync(join(ROOT, 'public/tiles'), { recursive: true });
const out = join(ROOT, 'public/tiles/vector.pmtiles');
execFileSync('tippecanoe', [
  '-o', out, '--force', '-l', 'base', '-Z', '8', '-z', '16', '--full-detail=13', '--low-detail=12', '--minimum-detail=12',
  '--no-tile-size-limit', '--no-feature-limit', '--no-tiny-polygon-reduction', '--no-simplification-of-shared-nodes',
  '--read-parallel', '--quiet', ...inputs,
], { stdio: 'inherit' });
console.log(`wrote ${out} from ${inputs.length} level(s)`);
