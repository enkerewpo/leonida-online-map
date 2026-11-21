#!/usr/bin/env node
// Checks data/*.geojson against the contract in src/schema.json. Exit code 1 on any error.
// Usage: npm run validate [-- path/to/file.geojson ...]
import { readFileSync, readdirSync } from 'node:fs';
import { basename, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const schema = JSON.parse(readFileSync(resolve(root, 'src/schema.json'), 'utf8'));
const LANGS = schema.langs;
const i18nReport = [];
const I18N_FIELDS = ['name', 'area', 'where', 'note'];
const MAX_ERRORS_PER_FILE = 50;

let errorCount = 0;
let warningCount = 0;

const args = process.argv.slice(2);
const files = args.length ? args.map((a) => resolve(a)) : readdirSync(resolve(root, 'data')).filter((f) => f.endsWith('.geojson')).sort().map((f) => resolve(root, 'data', f));

for (const name of Object.keys(schema.layers)) {
  if (!args.length && !files.some((f) => basename(f) === `${name}.geojson`)) report(`data/${name}.geojson`, 'error', 'file is missing');
}

for (const file of files) validateFile(file);

if (i18nReport.length) console.log(`\nTranslation coverage:\n  ${i18nReport.join('\n  ')}`);
console.log(`\n${errorCount ? '✗' : '✓'} ${files.length} file(s), ${errorCount} error(s), ${warningCount} warning(s)`);
process.exit(errorCount ? 1 : 0);

function report(where, level, msg) {
  if (level === 'error') errorCount++; else warningCount++;
  console.log(`${level === 'error' ? 'error' : 'warn '}  ${where}: ${msg}`);
}

function validateFile(file) {
  const layer = basename(file, '.geojson');
  const rel = `data/${basename(file)}`;
  const rules = schema.layers[layer];
  const before = errorCount;
  const err = (where, msg) => { if (errorCount - before < MAX_ERRORS_PER_FILE) report(where, 'error', msg); else errorCount++; };
  if (!rules) { report(rel, 'error', `unknown layer "${layer}" (expected one of ${Object.keys(schema.layers).join(', ')})`); return; }

  let fc;
  try { fc = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { err(rel, `not valid JSON: ${e.message}`); return; }
  if (fc?.type !== 'FeatureCollection' || !Array.isArray(fc.features)) { err(rel, 'top level must be a FeatureCollection with a features array'); return; }

  const ids = new Set();
  fc.features.forEach((f, i) => {
    const p = f?.properties;
    const label = p?.id ?? p?.name;
    const at = `${rel} #${i}${label ? ` (${label})` : ''}`;
    if (f?.type !== 'Feature') { err(at, 'type must be "Feature"'); return; }
    if (!p || typeof p !== 'object' || Array.isArray(p)) { err(at, 'properties must be an object'); return; }

    // Geometry
    const g = f.geometry;
    if (g === null || g === undefined) {
      if (!rules.geometry.includes(null)) err(at, 'geometry is null; this layer needs a geometry');
    } else if (!rules.geometry.includes(g.type)) {
      err(at, `geometry type ${g.type} not allowed here (allowed: ${rules.geometry.filter(Boolean).join(', ')})`);
    } else {
      const problem = checkGeometry(g);
      if (problem) err(at, problem);
    }

    // Classification
    if (rules.class && !rules.class.includes(p.class)) err(at, `class "${p.class}" not allowed (allowed: ${rules.class.join(', ')})`);
    if (rules.kind && !rules.kind.includes(p.kind)) err(at, `kind "${p.kind}" not allowed (allowed: ${rules.kind.join(', ')})`);

    // i18n keys: <field>:<lang>, lang one of LANGS, plain string values
    for (const [k, v] of Object.entries(p)) {
      const m = k.match(/^([a-z_]+):(.+)$/);
      if (!m) continue;
      if (!I18N_FIELDS.includes(m[1])) err(at, `unknown localised field "${k}"`);
      else if (!LANGS.includes(m[2])) err(at, `"${k}": language must be one of ${LANGS.join(', ')} (case matters, e.g. zh-Hans)`);
      if (typeof v !== 'string' || !v.trim()) err(at, `"${k}" must be a non-empty string`);
    }
    for (const field of I18N_FIELDS) if (field in p && (typeof p[field] !== 'string' || !p[field].trim())) err(at, `"${field}" must be a non-empty string`);

    if ('name' in p || layer === 'places' || layer === 'poi') {
      if (typeof p.name !== 'string' || !p.name.trim()) err(at, '"name" (English) is required');
    }
    if (layer === 'buildings' && 'height' in p && !(typeof p.height === 'number' && p.height > 0 && p.height < 1000)) err(at, '"height" must be a positive number of metres');
    if (layer === 'roads' && 'ref' in p && (typeof p.ref !== 'string' || !p.ref.trim())) err(at, '"ref" must be a non-empty string');

    if (layer === 'landmarks') {
      if (!rules.category.includes(p.category)) err(at, `category "${p.category}" not allowed (allowed: ${rules.category.join(', ')})`);
      if (!(typeof p.minzoom === 'number' && p.minzoom >= 12 && p.minzoom <= 20)) err(at, '"minzoom" must be a number from 12 to 20');
      if (typeof p.source !== 'string' || !/^https?:\/\/\S+$/.test(p.source)) err(at, '"source" is required: an http(s) link');
    }
    if (layer === 'poi') {
      if (typeof p.id !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(p.id)) err(at, '"id" must be a lowercase slug like "turbo-ruiner"');
      else if (ids.has(p.id)) err(at, `duplicate id "${p.id}"`);
      else ids.add(p.id);
      if (!rules.category.includes(p.category)) err(at, `category "${p.category}" not allowed (allowed: ${rules.category.join(', ')})`);
      if (typeof p.source !== 'string' || !/^https?:\/\/\S+$/.test(p.source)) err(at, '"source" is required: an http(s) link to where this can be checked');
      if (!['area:en', 'area'].some((k) => typeof p[k] === 'string')) report(at, 'warn', 'no "area:en" text; the list shows nothing under the name');
      if (!g && !['where:en', 'where'].some((k) => typeof p[k] === 'string')) err(at, 'unpinned finds (null geometry) need a "where:en" description');
      if ('flags' in p) {
        if (!Array.isArray(p.flags)) err(at, '"flags" must be an array');
        else for (const fl of p.flags) if (!rules.flags.includes(fl)) err(at, `flag "${fl}" not allowed (allowed: ${rules.flags.join(', ')})`);
      }
      if ('radius_m' in p && !(typeof p.radius_m === 'number' && p.radius_m > 0 && p.radius_m <= 5000)) err(at, '"radius_m" must be a number of metres between 0 and 5000');
      if ('radius_m' in p && !g) err(at, '"radius_m" needs a point to centre on');
    }
  });
  const n = fc.features.length;
  const named = fc.features.filter((f) => typeof f?.properties?.name === 'string');
  const zh = named.filter((f) => f.properties['name:zh-Hans']).length;
  if (named.length) i18nReport.push(`${rel}: ${zh}/${named.length} names have Chinese`);
  console.log(`${errorCount === before ? 'ok   ' : 'FAIL '}  ${rel}: ${n} feature(s)${errorCount - before ? `, ${errorCount - before} error(s)` : ''}`);
}

function checkGeometry(g) {
  const [lon0, lon1] = schema.extent.lon, [lat0, lat1] = schema.extent.lat;
  const pos = (c) => {
    if (!Array.isArray(c) || c.length < 2 || !c.every((x) => typeof x === 'number' && Number.isFinite(x))) return 'position must be [lon, lat] numbers';
    if (c[0] < lon0 || c[0] > lon1 || c[1] < lat0 || c[1] > lat1) return `position [${c}] is outside Leonida's frame (lon ${lon0}..${lon1}, lat ${lat0}..${lat1}); real-world coordinates are not used`;
    return null;
  };
  const line = (cs, min) => {
    if (!Array.isArray(cs) || cs.length < min) return `needs at least ${min} positions`;
    for (const c of cs) { const e = pos(c); if (e) return e; }
    return null;
  };
  const ring = (cs) => {
    const e = line(cs, 4);
    if (e) return `ring ${e}`;
    const a = cs[0], b = cs[cs.length - 1];
    return a[0] === b[0] && a[1] === b[1] ? null : 'ring is not closed (first and last positions differ)';
  };
  const poly = (rs) => (!Array.isArray(rs) || !rs.length ? 'polygon has no rings' : rs.map(ring).find(Boolean) ?? null);
  switch (g.type) {
    case 'Point': return pos(g.coordinates);
    case 'LineString': return line(g.coordinates, 2);
    case 'MultiLineString': return Array.isArray(g.coordinates) && g.coordinates.length ? g.coordinates.map((l) => line(l, 2)).find(Boolean) ?? null : 'no lines';
    case 'Polygon': return poly(g.coordinates);
    case 'MultiPolygon': return Array.isArray(g.coordinates) && g.coordinates.length ? g.coordinates.map(poly).find(Boolean) ?? null : 'no polygons';
    default: return `unsupported geometry type ${g.type}`;
  }
}
