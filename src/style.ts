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


const fade = (from: number, to: number, max = 1): ExpressionSpecification =>
  ['interpolate', ['linear'], ['zoom'], from, 0, to, max];

const fadeOut = (from: number, to: number): ExpressionSpecification =>
  ['interpolate', ['linear'], ['zoom'], from, 1, to, 0];

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
  'landmark': 0.02,
  'road-name': 0.04,
};

/** Label halo: the game's night blue, so white names read on sea, grass and streets alike. */
const HALO = 'rgba(6, 8, 40, 0.96)';

const categoryColor: ExpressionSpecification = [
  'match', ['get', 'category'],
  ...Object.entries(CATEGORIES).flatMap(([id, c]) => [id, c.color]),
  category('').color,
] as unknown as ExpressionSpecification;

/** CSS px per in-game tile: half size on high-density screens, so each tile pixel lands on a device pixel. */
export const TILE_SIZE = (globalThis.devicePixelRatio || 1) >= 1.5 ? 128 : 256;

export function buildStyle(glyphs: string, lang: Lang, tilesUrl: string): StyleSpecification {
  const name = nameField(lang);
  const sp = (n: number) => spacing(lang, n);
  const src = (id: string, promoteId?: string) => ({ [id]: { type: 'geojson' as const, data: EMPTY, ...(promoteId ? { promoteId } : {}) } });

  const layers: LayerSpecification[] = [
    {
      id: 'background', type: 'background',
      paint: { 'background-color': '#2f8eae' },
    },
    // The in-game map itself (GTADB tiles, levels 0-6 as zooms 12-18, plus 9-11 scaled down), over the same deep sea.
    {
      id: 'ingame', type: 'raster', source: 'ingame',
      paint: { 'raster-fade-duration': 120, 'raster-resampling': 'linear' },
    },
    // Road names along the road (data/roads-named.geojson; empty until that file exists).
    {
      id: 'road-name', type: 'symbol', source: 'roads-named', minzoom: 15.5,
      filter: ['has', 'name'],
      layout: {
        'symbol-placement': 'line',
        'text-field': name,
        'text-font': ['Barlow Condensed Bold'],
        'text-transform': 'uppercase',
        'text-size': ['interpolate', ['linear'], ['zoom'], 15, 12.4, 18, 15.3],
        'text-letter-spacing': sp(0.03),
        'text-max-angle': 30,
        'symbol-spacing': 320,
        'text-padding': 4,
      },
      paint: { 'text-color': '#fdfbff', 'text-halo-color': HALO, 'text-halo-width': 1.6, 'text-opacity': fade(15.5, 15.9) },
    },
    // Route numbers as small shields along the road; the lines themselves are in the in-game tiles.
    {
      id: 'road-shield', type: 'symbol', source: 'roads-named', minzoom: 13,
      filter: ['has', 'ref'],
      layout: {
        'symbol-placement': 'line',
        'symbol-spacing': 400,
        'icon-image': 'shield',
        'icon-text-fit': 'both',
        'icon-rotation-alignment': 'viewport',
        'text-rotation-alignment': 'viewport',
        'text-field': ['get', 'ref'],
        'text-font': ['Barlow Condensed Bold'],
        'text-size': 11.8,
        'text-letter-spacing': 0.02,
        'text-padding': 6,
      },
      paint: { 'text-color': '#1c2230', 'icon-opacity': fade(13, 13.4), 'text-opacity': fade(13, 13.4) },
    },
    // Landmarks: each from its own minzoom, and only where icon and name fit (no overlap allowed).
    // Before a marker's icon fits, a small dot in its category colour shows that something is there.
    {
      id: 'landmark-dot', type: 'circle', source: 'landmarks', minzoom: 12.5,
      filter: ['<', ['zoom'], ['min', ['coalesce', ['get', 'minzoom'], 16], 16.8]],
      paint: {
        'circle-color': categoryColor,
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 12.5, 1.8, 15, 3.2, 17, 3.8],
        'circle-stroke-color': 'rgba(253, 251, 255, 0.9)',
        'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 12.5, 0.6, 15, 1],
        'circle-opacity': ['interpolate', ['linear'], ['zoom'], 12.5, 0, 13, 0.95],
        'circle-stroke-opacity': ['interpolate', ['linear'], ['zoom'], 12.5, 0, 13, 0.95],
      },
    },
    {
      id: 'poi-dot', type: 'circle', source: 'poi', maxzoom: 13.2,
      paint: {
        'circle-color': categoryColor,
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 2.6, 13, 4],
        'circle-stroke-color': '#fdfbff',
        'circle-stroke-width': 1.2,
      },
    },
    {
      id: 'landmark', type: 'symbol', source: 'landmarks',
      filter: ['>=', ['zoom'], ['min', ['coalesce', ['get', 'minzoom'], 16], 16.8]],
      layout: {
        'icon-image': ['concat', 'lm-', ['get', 'category']],
        'icon-size': ['interpolate', ['linear'], ['zoom'], 13, 0.85, 16, 1, 19, 1.12],
        'icon-padding': 3,
        'text-field': name,
        'text-font': ['Barlow Condensed Bold'],
        'text-transform': 'uppercase',
        'text-size': ['interpolate', ['linear'], ['zoom'], 14, 12.4, 18, 14.8],
        'text-letter-spacing': sp(0.03),
        'text-anchor': 'top',
        'text-offset': [0, 1.05],
        'text-max-width': 8,
        'text-optional': true,
        'symbol-sort-key': ['min', ['coalesce', ['get', 'minzoom'], 16], 16.8],
      },
      paint: {
        'icon-opacity': ['case', ['==', ['get', 'unconfirmed'], true], 0.72, 1],
        'text-color': '#fdfbff',
        'text-halo-color': HALO,
        'text-halo-width': 1.8,
        'text-halo-blur': 0,
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
    // Selected find: a blip ring like the game's map, with a pulse the app animates (src/main.ts).
    {
      id: 'poi-pulse', type: 'circle', source: 'selection',
      paint: {
        'circle-radius': 20,
        'circle-color': 'rgba(0, 0, 0, 0)',
        'circle-stroke-color': '#fdfbff',
        'circle-stroke-width': 1.5,
        'circle-stroke-opacity': 0,
        'circle-pitch-alignment': 'viewport',
      },
    },
    {
      id: 'poi-selected', type: 'circle', source: 'selection',
      paint: {
        'circle-radius': 20,
        'circle-color': 'rgba(12, 13, 27, 0.28)',
        'circle-stroke-color': '#fdfbff',
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
        'text-font': ['Barlow Condensed Bold'],
        'text-transform': 'uppercase',
        'text-size': 13.6,
        'text-letter-spacing': sp(0.03),
        'text-anchor': 'top',
        'text-offset': [0, 1.35],
        'text-max-width': 9,
        'text-optional': true,
      },
      paint: { 'text-color': '#fdfbff', 'text-halo-color': HALO, 'text-halo-width': 1.8, 'text-halo-blur': 0 },
    },
    // Place labels, lowest priority first (later layers win collisions). Big regions show zoomed out and
    // give way as you zoom in; smaller places take over, as in the game's map.
    {
      id: 'label-landmark', type: 'symbol', source: 'places', minzoom: 15,
      filter: kind('landmark'),
      layout: {
        'text-field': name,
        'text-font': ['Barlow Condensed Bold'],
        'text-transform': 'uppercase',
        'text-size': ['interpolate', ['linear'], ['zoom'], 15, 12.4, 18, 15.3],
        'text-letter-spacing': sp(0.03),
        'text-max-width': 8,
        'symbol-sort-key': ['coalesce', ['get', 'rank'], 5],
      },
      paint: { 'text-color': '#fdfbff', 'text-halo-color': HALO, 'text-halo-width': 1.8, 'text-opacity': fade(15, 15.4) },
    },
    {
      id: 'label-water', type: 'symbol', source: 'places', minzoom: 12.4,
      filter: kind('water'),
      layout: {
        'text-field': name,
        'text-font': ['Barlow Condensed Bold'],
        'text-transform': 'uppercase',
        'text-size': ['interpolate', ['linear'], ['zoom'], 12.4, 13, 16, 17.7],
        'text-letter-spacing': sp(0.03),
        'text-max-width': 7,
        'symbol-sort-key': ['coalesce', ['get', 'rank'], 4],
      },
      paint: { 'text-color': '#b9c4ff', 'text-halo-color': HALO, 'text-halo-width': 1.8, 'text-opacity': ['interpolate', ['linear'], ['zoom'], 12.4, 0, 12.8, 1, 17, 1, 17.6, 0] },
    },
    {
      id: 'label-district', type: 'symbol', source: 'places', minzoom: 14,
      filter: kind('district', 'island', 'airport'),
      layout: {
        'text-field': name,
        'text-font': ['Barlow Condensed Bold'],
        'text-transform': 'uppercase',
        'text-size': ['interpolate', ['linear'], ['zoom'], 14, 12.4, 17, 16.5],
        'text-letter-spacing': sp(0.03),
        'text-max-width': 8,
        'symbol-sort-key': ['coalesce', ['get', 'rank'], 4],
      },
      paint: { 'text-color': '#fdfbff', 'text-halo-color': HALO, 'text-halo-width': 1.8, 'text-halo-blur': 0, 'text-opacity': ['interpolate', ['linear'], ['zoom'], 14, 0, 14.2, 1, 17.6, 1, 17.8, 0] },
    },
    {
      id: 'label-town', type: 'symbol', source: 'places', minzoom: 13.2,
      filter: kind('town'),
      layout: {
        'text-field': name,
        'text-font': ['Barlow Condensed Bold'],
        'text-transform': 'uppercase',
        'text-size': ['interpolate', ['linear'], ['zoom'], 13.2, 15.3, 16, 20.1],
        'text-letter-spacing': sp(0.03),
        'text-max-width': 8,
      },
      paint: { 'text-color': '#fdfbff', 'text-halo-color': HALO, 'text-halo-width': 1.8, 'text-halo-blur': 0, 'text-opacity': ['interpolate', ['linear'], ['zoom'], 13.2, 0, 13.4, 1, 17, 1, 17.2, 0] },
    },
    {
      id: 'label-city', type: 'symbol', source: 'places', minzoom: 12.3, maxzoom: 16.2,
      filter: kind('city'),
      layout: {
        'text-field': name,
        'text-font': ['Barlow Condensed Bold'],
        'text-transform': 'uppercase',
        'text-size': ['interpolate', ['linear'], ['zoom'], 12.3, 15.3, 15, 23.6],
        'text-letter-spacing': sp(0.03),
        'text-max-width': 7,
      },
      paint: { 'text-color': '#fdfbff', 'text-halo-color': HALO, 'text-halo-width': 1.8, 'text-halo-blur': 0, 'text-opacity': ['interpolate', ['linear'], ['zoom'], 12.3, 0, 12.5, 1, 15.9, 1, 16.1, 0] },
    },
    {
      id: 'label-county', type: 'symbol', source: 'places', maxzoom: 14.4,
      filter: kind('county'),
      layout: {
        'text-field': name,
        'text-font': ['Barlow Condensed Bold'],
        'text-transform': 'uppercase',
        'text-size': ['interpolate', ['linear'], ['zoom'], 10, 11.8, 12, 17.7, 14, 26],
        'text-letter-spacing': sp(0.03),
        'text-max-width': 12,
        'text-allow-overlap': true,
      },
      paint: { 'text-color': '#f3f0fd', 'text-halo-color': HALO, 'text-halo-width': 1.8, 'text-halo-blur': 0, 'text-opacity': fadeOut(13.7, 14.4) },
    },
    {
      id: 'label-state', type: 'symbol', source: 'places', maxzoom: 13,
      filter: kind('state'),
      layout: {
        'text-field': name,
        'text-font': ['Barlow Condensed Bold'],
        'text-transform': 'uppercase',
        'text-size': ['interpolate', ['linear'], ['zoom'], 10, 20.1, 12, 35.4, 13, 47.2],
        'text-letter-spacing': sp(0.3),
        'text-allow-overlap': true,
      },
      paint: { 'text-color': '#fdfbff', 'text-halo-color': HALO, 'text-halo-width': 1.8, 'text-halo-blur': 0, 'text-opacity': fadeOut(12.4, 13) },
    },
  ];

  return {
    version: 8,
    name: 'Leonida',
    glyphs,
    sources: { ingame: { type: 'raster', tiles: [tilesUrl], tileSize: TILE_SIZE, minzoom: 9, maxzoom: 18, bounds: [-0.1758, -0.1758, 0.1758, 0.1758], attribution: 'Map: GTA VI Map Tiles (CC BY 4.0) — map.gtadb.org · Map art © Rockstar Games' }, ...src('places'), ...src('poi'), ...src('landmarks', 'id'), ...src('roads-named'), ...src('poi-area', 'id'), ...src('selection') },
    layers,
    light: { anchor: 'viewport', color: '#ffffff', intensity: 0.32, position: [1.3, 210, 35] },
  };
}
