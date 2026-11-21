#!/usr/bin/env node
// Builds public/tiles/vector.pmtiles from build/vector/L6.geojsonl (tools/vectorize.py on GTADB's level-6 tiles):
// the in-game map traced into flat colour polygons, used above the zoom where the raster tiles run out of detail.
// Needs tippecanoe 2.x on PATH.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const src = join(ROOT, 'build/vector/L6.geojsonl');
if (!existsSync(src)) {
  console.error('build/vector/L6.geojsonl is missing: run python3 tools/vectorize.py <gtadb day tiles> 6');
  process.exit(1);
}
mkdirSync(join(ROOT, 'public/tiles'), { recursive: true });
const out = join(ROOT, 'public/tiles/vector.pmtiles');
execFileSync('tippecanoe', [
  '-o', out, '--force', '-l', 'base', '-Z', '16', '-z', '16', '--full-detail=13',
  '--no-tile-size-limit', '--no-feature-limit', '--no-tiny-polygon-reduction', '--no-simplification-of-shared-nodes',
  '--read-parallel', '--quiet', src,
], { stdio: 'inherit' });
console.log(`wrote ${out}`);
