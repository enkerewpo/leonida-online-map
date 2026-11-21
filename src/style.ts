// The map style: the in-game pause-map palette, with per-zoom visibility close to the game's.
import type { StyleSpecification, ExpressionSpecification, LayerSpecification } from 'maplibre-gl';
import type { Lang } from './i18n';
import { CATEGORIES, category } from './categories';

export const COLORS = {
  seaDeep: '#419dbc',
  sea: '#52aeca',
  shallow: '#5db6d0',
  land: '#75a58e',
  landDark: '#669877',
  landLight: '#81b09e',
  urban: '#aeb9bc',
  building: '#acb9cc',
  buildingIn: '#96a7be',
  buildingEdge: '#8e9eaa',
  beach: '#d7cda5',
  swamp: '#5c9083',
  street: '#d1d9db',
  halo: 'rgba(24, 44, 58, 0.62)',
  water: '#1e6c8a',
};

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

/** Pixel widths that grow with zoom like a real road does (base 1.6 is close to "constant metres" without getting silly). */
const width = (stops: [number, number][], base = 1.6): ExpressionSpecification =>
  ['interpolate', ['exponential', base], ['zoom'], ...stops.flat()] as ExpressionSpecification;

const fade = (from: number, to: number, max = 1): ExpressionSpecification =>
  ['interpolate', ['linear'], ['zoom'], from, 0, to, max];

const fadeOut = (from: number, to: number): ExpressionSpecification =>
  ['interpolate', ['linear'], ['zoom'], from, 1, to, 0];

const cls = (...c: string[]): ExpressionSpecification => ['in', ['get', 'class'], ['literal', c]];
const kind = (...k: string[]): ExpressionSpecification => ['in', ['get', 'kind'], ['literal', k]];

export function nameField(lang: Lang): ExpressionSpecification {
  return lang === 'en' ? ['coalesce', ['get', 'name:en'], ['get', 'name']] : ['coalesce', ['get', `name:${lang}`], ['get', 'name']];
}

/** CJK text wants much less tracking than spaced Latin capitals. */
export function spacing(lang: Lang, latin: number): number {
  return lang === 'en' ? latin : Math.min(latin, 0.06);
}

/** Every layer whose text follows the UI language, with its Latin letter-spacing. */
export const LABEL_LAYERS: Record<string, number> = {
  'label-landmark': 0.03,
  'label-water': 0.12,
  'label-district': 0.12,
  'label-town': 0.02,
  'label-city': 0.08,
  'label-county': 0.12,
  'label-state': 0.75,
  'poi-label': 0.02,
  'road-name': 0.04,
};

const categoryColor: ExpressionSpecification = [
  'match', ['get', 'category'],
  ...Object.entries(CATEGORIES).flatMap(([id, c]) => [id, c.color]),
  category('').color,
] as unknown as ExpressionSpecification;

const BASE_LAYERS = new Set(['land', 'landuse', 'buildings', 'roads']);

/** Shown from a feature's own `minzoom` (fractional), so detail appears gradually as in a map app. */
const byMinzoom: ExpressionSpecification = ['>=', ['zoom'], ['coalesce', ['get', 'minzoom'], 0]];

export function buildStyle(glyphs: string, lang: Lang, tilesUrl: string): StyleSpecification {
  const name = nameField(lang);
  const sp = (n: number) => spacing(lang, n);
  const src = (id: string, promoteId?: string) => ({ [id]: { type: 'geojson' as const, data: EMPTY, ...(promoteId ? { promoteId } : {}) } });

  const layers: LayerSpecification[] = [
    {
      id: 'background', type: 'background',
      paint: { 'background-color': ['interpolate', ['linear'], ['zoom'], 11, COLORS.seaDeep, 15, '#4aa6c3'] },
    },
    // Lighter shallow water around every coast, fading into the deeper sea offshore.
    {
      id: 'coast-shallow-wide', type: 'line', source: 'land',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': COLORS.sea,
        'line-width': width([[9, 14], [12, 110], [15, 880]], 2),
        'line-blur': width([[9, 10], [12, 80], [15, 640]], 2),
        'line-opacity': 0.9,
      },
    },
    {
      id: 'coast-shallow', type: 'line', source: 'land',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': COLORS.shallow,
        'line-width': width([[9, 3], [12, 22], [15, 176], [18, 1400]], 2),
        'line-blur': width([[9, 2], [12, 16], [15, 128], [18, 1000]], 2),
        'line-opacity': 0.75,
      },
    },
    {
      id: 'land', type: 'fill', source: 'land',
      paint: { 'fill-color': COLORS.land, 'fill-antialias': true },
    },
    {
      id: 'landuse', type: 'fill', source: 'landuse',
      filter: ['!', cls('runway')],
      paint: {
        'fill-color': [
          'match', ['get', 'class'],
          'urban', COLORS.urban,
          'industrial', '#a5b0b6',
          'airport', '#b6c0c3',
          'beach', COLORS.beach,
          'swamp', COLORS.swamp,
          'park', COLORS.landLight,
          'grass', COLORS.landLight,
          'golf', '#8cbc9c',
          'forest', COLORS.landDark,
          'farmland', '#8fb28f',
          'water', COLORS.sea,
          COLORS.landLight,
        ],
        'fill-opacity': ['interpolate', ['linear'], ['zoom'], 10, ['match', ['get', 'class'], 'urban', 0.82, 1], 13, 1],
      },
    },
    {
      id: 'landuse-swamp-pattern', type: 'fill', source: 'landuse', minzoom: 11.5,
      filter: cls('swamp'),
      paint: { 'fill-pattern': 'swamp', 'fill-opacity': fade(11.5, 12.5, 0.9) },
    },
    {
      id: 'landuse-runway', type: 'fill', source: 'landuse',
      filter: cls('runway'),
      paint: { 'fill-color': '#8c979d' },
    },
    {
      id: 'building', type: 'fill', source: 'buildings', minzoom: 12.5,
      paint: {
        'fill-color': ['case', ['boolean', ['get', 'enterable'], false], COLORS.buildingIn, COLORS.building],
        'fill-outline-color': ['case', ['boolean', ['get', 'enterable'], false], '#7e8fa8', COLORS.buildingEdge],
        'fill-opacity': fade(12.5, 13.5),
      },
    },
    // Roads: casings first, then fills, minor to major.
    {
      id: 'road-track', type: 'line', source: 'roads', minzoom: 13,
      filter: cls('track', 'path'),
      layout: { 'line-cap': 'round' },
      paint: { 'line-color': '#e9ece2', 'line-width': width([[13, 0.6], [16, 1.8], [18, 3]]), 'line-dasharray': [2, 1.6], 'line-opacity': fade(13, 13.8, 0.85) },
    },
    {
      id: 'road-ferry', type: 'line', source: 'roads', minzoom: 11,
      filter: cls('ferry'),
      paint: { 'line-color': '#e8f6fb', 'line-width': width([[11, 0.8], [16, 2]]), 'line-dasharray': [3, 3], 'line-opacity': 0.7 },
    },
    {
      id: 'road-street-casing', type: 'line', source: 'roads', minzoom: 15,
      filter: cls('street', 'service'),
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': 'rgba(140, 157, 164, 0.5)', 'line-width': width([[15, 1.6], [16, 5.6], [18, 17]]), 'line-opacity': fade(15, 15.6) },
    },
    {
      id: 'road-primary-casing', type: 'line', source: 'roads', minzoom: 13.2,
      filter: cls('primary', 'secondary', 'trunk'),
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': 'rgba(126, 143, 150, 0.5)', 'line-width': width([[13.2, 2.2], [14, 4], [16, 9.5], [18, 25]]), 'line-opacity': fade(13.2, 14) },
    },
    {
      id: 'road-motorway-casing', type: 'line', source: 'roads',
      filter: cls('motorway'),
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': 'rgba(176, 160, 110, 0.75)', 'line-width': width([[10, 1.8], [12, 3.2], [14, 6.6], [16, 14], [18, 34]]) },
    },
    {
      id: 'road-street', type: 'line', source: 'roads', minzoom: 13.2,
      filter: cls('street', 'service'),
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['interpolate', ['linear'], ['zoom'], 13.5, COLORS.street, 16, '#ffffff'],
        'line-width': width([[13.2, 0.35], [14, 0.9], [16, 4], [18, 13]]),
        'line-opacity': fade(13.2, 14),
      },
    },
    {
      id: 'road-primary', type: 'line', source: 'roads', minzoom: 11.9,
      filter: cls('primary', 'secondary', 'trunk'),
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['interpolate', ['linear'], ['zoom'], 12, '#e4eaec', 15, '#ffffff'],
        'line-width': width([[11.9, 0.5], [13, 1.2], [14, 2.4], [16, 7], [18, 20]]),
        'line-opacity': fade(11.9, 12.6),
      },
    },
    {
      id: 'road-motorway', type: 'line', source: 'roads',
      filter: cls('motorway'),
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#ece4c4', 'line-width': width([[10, 0.9], [12, 1.8], [14, 4.2], [16, 10], [18, 26]]) },
    },
    {
      id: 'road-rail', type: 'line', source: 'roads', minzoom: 12.5,
      filter: cls('rail'),
      paint: { 'line-color': '#7f8d95', 'line-width': width([[12.5, 0.8], [16, 2]]), 'line-dasharray': [4, 2] },
    },
    {
      id: 'road-name', type: 'symbol', source: 'roads', minzoom: 15,
      filter: ['all', ['has', 'name'], ['!', cls('motorway')]],
      layout: {
        'symbol-placement': 'line',
        'text-field': name,
        'text-font': ['Jost Medium'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 15, 10.5, 18, 13],
        'text-letter-spacing': sp(0.04),
        'text-max-angle': 30,
        'symbol-spacing': 320,
      },
      paint: { 'text-color': '#4e5d66', 'text-halo-color': 'rgba(255,255,255,0.9)', 'text-halo-width': 1.4 },
    },
    {
      id: 'road-shield', type: 'symbol', source: 'roads', minzoom: 11.5,
      filter: ['all', ['has', 'ref'], cls('motorway', 'trunk', 'primary')],
      layout: {
        'symbol-placement': 'line',
        'symbol-spacing': 420,
        'text-field': ['get', 'ref'],
        'text-font': ['Jost Bold'],
        'text-size': 10.5,
        'text-rotation-alignment': 'viewport',
        'icon-image': 'shield',
        'icon-text-fit': 'both',
        'icon-rotation-alignment': 'viewport',
      },
      paint: { 'text-color': '#33424b' },
    },
    {
      id: 'building-3d', type: 'fill-extrusion', source: 'buildings', minzoom: 13.5,
      layout: { visibility: 'none' },
      paint: {
        'fill-extrusion-color': ['case', ['boolean', ['get', 'enterable'], false], '#9aabc2', '#b3bfd0'],
        'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 13.5, 0, 14.5, ['get', 'render_height']],
        'fill-extrusion-opacity': 0.92,
        'fill-extrusion-vertical-gradient': true,
      },
    },
    // Search areas for finds that are only known roughly.
    {
      id: 'poi-area', type: 'fill', source: 'poi-area', minzoom: 12.5,
      paint: {
        'fill-color': categoryColor,
        'fill-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], 0.2, 0.06],
      },
    },
    {
      id: 'poi-area-line', type: 'line', source: 'poi-area', minzoom: 12.5,
      paint: {
        'line-color': categoryColor,
        'line-width': ['case', ['boolean', ['feature-state', 'selected'], false], 2, 1.2],
        'line-dasharray': [2, 1.5],
        'line-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], 0.95, 0.4],
      },
    },
    {
      id: 'poi-selected', type: 'circle', source: 'selection',
      paint: {
        'circle-radius': 21,
        'circle-color': 'rgba(255, 143, 177, 0.28)',
        'circle-stroke-color': '#ff8fb1',
        'circle-stroke-width': 2,
        'circle-pitch-alignment': 'viewport',
      },
    },
    {
      id: 'poi', type: 'symbol', source: 'poi', minzoom: 12.9,
      filter: ['!=', ['get', 'hidden'], true],
      layout: {
        'icon-image': ['concat', 'poi-', ['get', 'category']],
        'icon-size': ['interpolate', ['linear'], ['zoom'], 12.9, 0.62, 14.5, 0.86, 17, 1],
        'icon-allow-overlap': true,
        'icon-anchor': 'center',
      },
      paint: { 'icon-opacity': fade(12.9, 13.3) },
    },
    {
      id: 'poi-active', type: 'symbol', source: 'selection',
      layout: {
        'icon-image': ['concat', 'poi-', ['get', 'category']],
        'icon-size': ['interpolate', ['linear'], ['zoom'], 12.9, 0.8, 14.5, 0.9, 17, 1],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
    },
    {
      id: 'poi-label', type: 'symbol', source: 'poi', minzoom: 14.8,
      filter: ['!=', ['get', 'hidden'], true],
      layout: {
        'text-field': name,
        'text-font': ['Jost SemiBold'],
        'text-size': 11.5,
        'text-letter-spacing': sp(0.02),
        'text-anchor': 'top',
        'text-offset': [0, 1.35],
        'text-max-width': 9,
        'text-optional': true,
      },
      paint: { 'text-color': '#1c2b34', 'text-halo-color': 'rgba(255,255,255,0.92)', 'text-halo-width': 1.5 },
    },
    // Place labels, lowest priority first (later layers win collisions).
    {
      id: 'label-landmark', type: 'symbol', source: 'places', minzoom: 14.6,
      filter: kind('landmark'),
      layout: {
        'text-field': name,
        'text-font': ['Jost Medium'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 14.6, 10.5, 17, 13],
        'text-letter-spacing': sp(0.03),
        'text-max-width': 8,
        'symbol-sort-key': ['coalesce', ['get', 'rank'], 5],
      },
      paint: { 'text-color': '#34454f', 'text-halo-color': 'rgba(255, 255, 255, 0.8)', 'text-halo-width': 1.3, 'text-opacity': fade(14.6, 15) },
    },
    {
      id: 'label-water', type: 'symbol', source: 'places', minzoom: 10,
      filter: kind('water'),
      layout: {
        'text-field': name,
        'text-font': ['Jost Medium'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 10, 11, 14, 15],
        'text-letter-spacing': sp(0.12),
        'text-max-width': 7,
        'symbol-sort-key': ['coalesce', ['get', 'rank'], 4],
      },
      paint: { 'text-color': COLORS.water, 'text-halo-color': 'rgba(120, 200, 222, 0.5)', 'text-halo-width': 0.8 },
    },
    {
      id: 'label-district', type: 'symbol', source: 'places', minzoom: 13,
      filter: kind('district', 'island', 'airport'),
      layout: {
        'text-field': name,
        'text-font': ['Jost SemiBold'],
        'text-transform': 'uppercase',
        'text-size': ['interpolate', ['linear'], ['zoom'], 13, 10.5, 16, 13.5],
        'text-letter-spacing': sp(0.12),
        'text-max-width': 8,
        'symbol-sort-key': ['coalesce', ['get', 'rank'], 4],
      },
      paint: { 'text-color': '#ffffff', 'text-halo-color': COLORS.halo, 'text-halo-width': 1.2, 'text-halo-blur': 0.5, 'text-opacity': fade(13, 13.4) },
    },
    {
      id: 'label-town', type: 'symbol', source: 'places', minzoom: 12.3,
      filter: kind('town'),
      layout: {
        'text-field': name,
        'text-font': ['Jost SemiBold'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 12.3, 13, 15, 17],
        'text-letter-spacing': sp(0.02),
        'text-max-width': 8,
      },
      paint: { 'text-color': '#ffffff', 'text-halo-color': COLORS.halo, 'text-halo-width': 1.5, 'text-halo-blur': 0.5, 'text-opacity': fade(12.3, 12.7) },
    },
    {
      id: 'label-city', type: 'symbol', source: 'places', minzoom: 11.7,
      filter: kind('city'),
      layout: {
        'text-field': name,
        'text-font': ['Jost Bold'],
        'text-transform': 'uppercase',
        'text-size': ['interpolate', ['linear'], ['zoom'], 11.7, 13, 14, 19],
        'text-letter-spacing': sp(0.08),
        'text-max-width': 7,
      },
      paint: { 'text-color': '#ffffff', 'text-halo-color': COLORS.halo, 'text-halo-width': 1.4, 'text-halo-blur': 0.6, 'text-opacity': ['interpolate', ['linear'], ['zoom'], 11.7, 0, 12.1, 1, 14.6, 1, 15.2, 0] },
    },
    {
      id: 'label-county', type: 'symbol', source: 'places', maxzoom: 13.8,
      filter: kind('county'),
      layout: {
        'text-field': name,
        'text-font': ['Jost Bold'],
        'text-transform': 'uppercase',
        'text-size': ['interpolate', ['linear'], ['zoom'], 10, 12, 12, 17, 13.5, 22],
        'text-letter-spacing': sp(0.12),
        'text-max-width': 12,
        'text-allow-overlap': true,
      },
      paint: { 'text-color': '#ffffff', 'text-halo-color': COLORS.halo, 'text-halo-width': 1.5, 'text-halo-blur': 0.8, 'text-opacity': fadeOut(13.1, 13.8) },
    },
    {
      id: 'label-state', type: 'symbol', source: 'places', maxzoom: 12.4,
      filter: kind('state'),
      layout: {
        'text-field': name,
        'text-font': ['Jost Medium'],
        'text-transform': 'uppercase',
        'text-size': ['interpolate', ['linear'], ['zoom'], 10, 20, 12, 30],
        'text-letter-spacing': sp(0.75),
        'text-allow-overlap': true,
      },
      paint: { 'text-color': 'rgba(255,255,255,0.9)', 'text-halo-color': 'rgba(24, 44, 58, 0.22)', 'text-halo-width': 1.2, 'text-halo-blur': 1.5, 'text-opacity': fadeOut(11.9, 12.4) },
    },
  ];

  // Base layers come from the vector tiles; every feature waits for its own minzoom.
  for (const l of layers as (LayerSpecification & { source?: string; filter?: ExpressionSpecification })[]) {
    if (!l.source || !BASE_LAYERS.has(l.source)) continue;
    (l as { 'source-layer'?: string })['source-layer'] = l.source;
    l.source = 'base';
    l.filter = l.filter ? ['all', l.filter, byMinzoom] as ExpressionSpecification : byMinzoom;
  }

  return {
    version: 8,
    name: 'Leonida',
    glyphs,
    sources: { base: { type: 'vector', url: tilesUrl, attribution: 'Map data: GTA VI Map Tiles (CC BY 4.0) — map.gtadb.org; © Rockstar Games' }, ...src('places'), ...src('poi'), ...src('poi-area', 'id'), ...src('selection') },
    layers,
    light: { anchor: 'viewport', color: '#ffffff', intensity: 0.32, position: [1.3, 210, 35] },
  };
}
