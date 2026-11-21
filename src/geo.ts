// Leonida's coordinate frame, mirrored from tools/geo.py.
// Data is lon/lat with the state placed on the equator around 0,0, where degrees are close to square.
// One pixel of the official reference map is 1609.344 / 600 m (the poster's scale bar: 600 px = 1 mile).

export const M_PER_PX = 1609.344 / 600;
export const M_PER_DEG = 111319.49;
export const REF_W = 5378;
export const REF_H = 7504;

const K = M_PER_PX / M_PER_DEG;

export function pxToLngLat(x: number, y: number): [number, number] {
  return [(x - REF_W / 2) * K, -(y - REF_H / 2) * K];
}

export function lngLatToPx(lng: number, lat: number): [number, number] {
  return [lng / K + REF_W / 2, -lat / K + REF_H / 2];
}

export type BBox = [number, number, number, number];

/** Rough extent of the state, used before land.geojson has loaded. */
export const ROUGH_BOUNDS: BBox = [-0.065, -0.091, 0.065, 0.091];

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
