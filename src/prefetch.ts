// Look-ahead for the in-game map tiles: while the map moves, tiles in the direction of travel are fetched before
// they come into view, and when it stops, a ring of tiles around the view and the next zoom in. Fetching warms the
// browser's HTTP cache, so the map's own requests for them are instant.
import type { Map as MLMap } from 'maplibre-gl';

const MIN_Z = 9, MAX_Z = 18;
const done = new Set<string>();
const pending = new Set<string>();

const lon2x = (lng: number, z: number) => Math.floor(((lng + 180) / 360) * 2 ** z);
const lat2y = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};

/** Starts prefetching for `template` (…/{z}/{x}/{y}.jpg) drawn with tiles of `tileSize` CSS px. */
export function startPrefetch(map: MLMap, template: string, tileSize: number): void {
  const tileZoom = () => Math.max(MIN_Z, Math.min(MAX_Z, Math.round(map.getZoom() + Math.log2(512 / tileSize))));
  const box = (w: number, s: number, e: number, n: number, z: number) => {
    const x0 = lon2x(w, z), x1 = lon2x(e, z), y0 = lat2y(n, z), y1 = lat2y(s, z);
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > 120) return;
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        const key = `${z}/${x}/${y}`;
        if (done.has(key) || pending.has(key) || pending.size > 16) continue;
        pending.add(key);
        fetch(template.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y)), { priority: 'low' } as RequestInit)
          .then((r) => (r.ok ? r.blob() : null))
          .catch(() => undefined)
          .finally(() => { pending.delete(key); done.add(key); });
      }
    }
  };
  let last = { t: performance.now(), c: map.getCenter() };
  let timer = 0;
  const ahead = () => {
    timer = 0;
    const now = performance.now(), c = map.getCenter();
    const dt = Math.max(16, now - last.t);
    const vx = (c.lng - last.c.lng) / dt, vy = (c.lat - last.c.lat) / dt;
    last = { t: now, c };
    const b = map.getBounds();
    // Where the view will be in ~0.7 s, plus half a screen in the direction of travel.
    const k = 700, w = b.getEast() - b.getWest(), h = b.getNorth() - b.getSouth();
    const dx = vx * k + Math.sign(vx) * w * 0.5, dy = vy * k + Math.sign(vy) * h * 0.5;
    box(b.getWest() + Math.min(0, dx), b.getSouth() + Math.min(0, dy), b.getEast() + Math.max(0, dx), b.getNorth() + Math.max(0, dy), tileZoom());
  };
  map.on('move', () => { if (!timer) timer = window.setTimeout(ahead, 120); });
  map.on('movestart', () => { last = { t: performance.now(), c: map.getCenter() }; });
  map.on('idle', () => {
    const b = map.getBounds(), w = b.getEast() - b.getWest(), h = b.getNorth() - b.getSouth();
    const z = tileZoom();
    box(b.getWest() - w / 2, b.getSouth() - h / 2, b.getEast() + w / 2, b.getNorth() + h / 2, z);
    if (z < MAX_Z) box(b.getWest(), b.getSouth(), b.getEast(), b.getNorth(), z + 1);
  });
}
