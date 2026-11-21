#!/usr/bin/env node
// Builds public/tiles/leonida.pmtiles (vector tiles, zoom 8-16) from the base layers in data/.
// data/*.geojson stays the editable source of truth; the tiles are generated and not committed.
// Each feature's `minzoom` property becomes tippecanoe's per-feature minzoom, so small roads and buildings
// only enter the tiles where they are shown, like any map app. Needs tippecanoe 2.x on PATH.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const LAYERS = ['land', 'landuse', 'buildings', 'roads'];
const tmp = mkdtempSync(join(tmpdir(), 'leonida-'));
const out = join(ROOT, 'public/tiles/leonida.pmtiles');
mkdirSync(join(ROOT, 'public/tiles'), { recursive: true });

function ringArea(ring) {
  // Shoelace in degrees, then to m² at the equator (Leonida sits on it).
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  return Math.abs(a / 2) * 111319.49 ** 2;
}

const args = [];
for (const name of LAYERS) {
  const fc = JSON.parse(readFileSync(join(ROOT, 'data', `${name}.geojson`), 'utf8'));
  const lines = [];
  for (const f of fc.features) {
    if (!f.geometry) continue;
    const p = f.properties ?? {};
    if (name === 'buildings') {
      const area = f.geometry.type === 'Polygon' ? ringArea(f.geometry.coordinates[0]) : 0;
      p.render_height = typeof p.height === 'number' && p.height > 0 ? p.height
        : Math.round(Math.min(Math.max(5 + Math.sqrt(area) * 0.28, 6), 40));
    }
    const feat = { type: 'Feature', properties: p, geometry: f.geometry };
    if (typeof p.minzoom === 'number') feat.tippecanoe = { minzoom: Math.max(8, Math.floor(p.minzoom)) };
    lines.push(JSON.stringify(feat));
  }
  const file = join(tmp, `${name}.geojsonl`);
  writeFileSync(file, lines.join('\n') + '\n');
  args.push('-L', `${name}:${file}`);
  console.log(`${name}: ${lines.length}`);
}

execFileSync('tippecanoe', [
  '-o', out, '--force', '-Z', '8', '-z', '16', '--full-detail=13', '--minimum-detail=11',
  '--no-tile-size-limit', '--no-feature-limit', '--no-tiny-polygon-reduction-at-maximum-zoom',
  '--detect-shared-borders', '--read-parallel', '--quiet', ...args,
], { stdio: 'inherit' });
rmSync(tmp, { recursive: true, force: true });
console.log(`wrote ${out}`);
