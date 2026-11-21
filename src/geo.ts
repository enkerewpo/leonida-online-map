// Leonida's coordinate frame, mirrored from tools/geo.py: GTADB in-game map tiles, level L served as zoom L + 12.
// Game metres (x east, y north) map to the map's lon/lat by gameToLngLat. The web-mercator scale differs from game
// metres by a constant factor (GAME_SCALE), which the scale bar corrects for.

const WORLD_Z12 = 256 * 4096;
const SHIFT = 2046 * 256;

export function gameToLngLat(x: number, y: number): [number, number] {
  const px = SHIFT + (x + 16384) / 32, py = SHIFT + (16384 - y) / 32;
  return [px / WORLD_Z12 * 360 - 180, Math.atan(Math.sinh(Math.PI * (1 - 2 * py / WORLD_Z12))) * 180 / Math.PI];
}

/** Map metres (web mercator at the equator) per game metre: 32 game m per pixel at zoom 12. */
export const GAME_SCALE = (40075016.686 / WORLD_Z12) / 32;
export const M_PER_DEG = 111319.49 / GAME_SCALE;

export type BBox = [number, number, number, number];

/** Extent of Leonida's land in the tile frame (see tools/geo.py). */
export const ROUGH_BOUNDS: BBox = [-0.103, -0.0852, 0.0243, 0.1017];

export function metresToDeg(m: number): number {
  return m / M_PER_DEG;
}

/** A polygon ring approximating a circle of `radius` metres. Fine near the equator, which is where we live. */
export function circleRing(center: [number, number], radius: number, steps = 64): [number, number][] {
  const r = metresToDeg(radius);
  const ring: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    ring.push([center[0] + r * Math.cos(a), center[1] + r * Math.sin(a)]);
  }
  return ring;
}

/** Bounding box of any GeoJSON object's coordinates. */
export function bboxOf(geojson: { features: { geometry: GeoJSON.Geometry | null }[] }): BBox | null {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  const walk = (c: unknown): void => {
    if (!Array.isArray(c)) return;
    if (typeof c[0] === 'number') {
      const [x, y] = c as number[];
      if (x < w) w = x; if (x > e) e = x;
      if (y < s) s = y; if (y > n) n = y;
      return;
    }
    for (const k of c) walk(k);
  };
  for (const f of geojson.features) if (f.geometry && 'coordinates' in f.geometry) walk(f.geometry.coordinates);
  return Number.isFinite(w) ? [w, s, e, n] : null;
}

export function padBBox(b: BBox, frac: number): BBox {
  const dx = (b[2] - b[0]) * frac, dy = (b[3] - b[1]) * frac;
  return [b[0] - dx, b[1] - dy, b[2] + dx, b[3] + dy];
}

/** Planar area of a polygon in square metres (outer ring minus holes). */
export function polygonAreaM2(rings: number[][][]): number {
  let total = 0;
  rings.forEach((ring, i) => {
    let a = 0;
    for (let j = 0, k = ring.length - 1; j < ring.length; k = j++) a += (ring[k][0] + ring[j][0]) * (ring[k][1] - ring[j][1]);
    a = Math.abs(a / 2) * M_PER_DEG * M_PER_DEG;
    total += i === 0 ? a : -a;
  });
  return Math.max(total, 0);
}
