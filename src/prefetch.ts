// Vector tiles from one PMTiles archive, with look-ahead: while the map moves, tiles in the direction of travel are
// fetched before they come into view, and when it stops, a ring of tiles around the view. Fetched tiles are kept in
// a small in-memory cache that the map's own requests read first.
import * as maplibregl from 'maplibre-gl';
import type { Map as MLMap } from 'maplibre-gl';
import { PMTiles, Protocol } from 'pmtiles';

const MAX_CACHE = 900;
const cache = new Map<string, ArrayBuffer>();
const pending = new Set<string>();
let archive: PMTiles | null = null;
let minZ = 8, maxZ = 16;

function remember(key: string, data: ArrayBuffer): void {
  cache.delete(key);
  cache.set(key, data);
  if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value as string);
}

/** Registers the pmtiles:// protocol for `url` (absolute https URL of the archive). */
export function registerPmtiles(url: string): void {
  const protocol = new Protocol();
  archive = new PMTiles(url);
  protocol.add(archive);
  void archive.getHeader().then((h) => { minZ = h.minZoom; maxZ = h.maxZoom; }).catch(() => undefined);
  const tile = protocol.tile as unknown as (p: maplibregl.RequestParameters, a: AbortController) => Promise<{ data: unknown }>;
  maplibregl.addProtocol('pmtiles', async (params, abort): Promise<{ data: any }> => {
    const m = params.url.match(/\/(\d+)\/(\d+)\/(\d+)$/);
    if (params.type === 'json' || !m) return tile(params, abort);
    const key = `${m[1]}/${m[2]}/${m[3]}`;
    const hit = cache.get(key);
    if (hit) { remember(key, hit); return { data: hit.slice(0) }; }
    const res = await tile(params, abort);
    if (res.data instanceof ArrayBuffer) remember(key, res.data.slice(0));
    return res;
  });
}

const lon2x = (lng: number, z: number) => Math.floor(((lng + 180) / 360) * 2 ** z);
const lat2y = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};

function prefetchBox(w: number, s: number, e: number, n: number, z: number): void {
  if (!archive) return;
  const x0 = lon2x(w, z), x1 = lon2x(e, z), y0 = lat2y(n, z), y1 = lat2y(s, z);
  if ((x1 - x0 + 1) * (y1 - y0 + 1) > 80) return;
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      const key = `${z}/${x}/${y}`;
      if (cache.has(key) || pending.has(key) || pending.size > 12) continue;
      pending.add(key);
      archive.getZxy(z, x, y)
        .then((r) => { if (r?.data) remember(key, r.data); })
        .catch(() => undefined)
        .finally(() => pending.delete(key));
    }
  }
}

/** Starts look-ahead prefetching for a map whose vector source reads the registered archive (512 px tiles). */
export function startPrefetch(map: MLMap): void {
  let last = { t: performance.now(), c: map.getCenter() };
  let timer = 0;
  const tileZoom = () => Math.max(minZ, Math.min(maxZ, Math.floor(map.getZoom())));
  const ahead = () => {
    timer = 0;
    const now = performance.now(), c = map.getCenter();
    const dt = Math.max(16, now - last.t);
    const vx = (c.lng - last.c.lng) / dt, vy = (c.lat - last.c.lat) / dt;
    last = { t: now, c };
    const b = map.getBounds();
    // Where the view will be in ~0.7 s, plus a margin of half a screen in the direction of travel.
    const k = 700, w = b.getEast() - b.getWest(), h = b.getNorth() - b.getSouth();
    const dx = vx * k + Math.sign(vx) * w * 0.5, dy = vy * k + Math.sign(vy) * h * 0.5;
    prefetchBox(b.getWest() + Math.min(0, dx), b.getSouth() + Math.min(0, dy), b.getEast() + Math.max(0, dx), b.getNorth() + Math.max(0, dy), tileZoom());
  };
  map.on('move', () => { if (!timer) timer = window.setTimeout(ahead, 120); });
  map.on('movestart', () => { last = { t: performance.now(), c: map.getCenter() }; });
  map.on('idle', () => {
    const b = map.getBounds(), w = b.getEast() - b.getWest(), h = b.getNorth() - b.getSouth();
    // A ring of half a screen around the view, at this zoom and the next one in.
    prefetchBox(b.getWest() - w / 2, b.getSouth() - h / 2, b.getEast() + w / 2, b.getNorth() + h / 2, tileZoom());
    const z1 = Math.min(maxZ, tileZoom() + 1);
    if (z1 !== tileZoom()) prefetchBox(b.getWest(), b.getSouth(), b.getEast(), b.getNorth(), z1);
  });
}
