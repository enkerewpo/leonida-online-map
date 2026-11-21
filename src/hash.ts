// Shareable URLs: #map=zoom/lat/lng/bearing/pitch&poi=id
export interface View { zoom: number; lat: number; lng: number; bearing: number; pitch: number }

export function readHash(): { view: View | null; poi: string | null } {
  const raw = location.hash.replace(/^#/, '');
  const params = new URLSearchParams(raw.includes('=') ? raw : `map=${raw}`);
  const parts = (params.get('map') ?? '').split('/').map(Number);
  const ok = parts.length >= 3 && parts.slice(0, 3).every(Number.isFinite);
  const view = ok ? { zoom: parts[0], lat: parts[1], lng: parts[2], bearing: parts[3] || 0, pitch: parts[4] || 0 } : null;
  const poi = params.get('poi');
  return { view, poi: poi && /^[a-z0-9-]+$/i.test(poi) ? poi : null };
}

export function writeHash(v: View & { poi: string | null }): void {
  let s = `map=${v.zoom.toFixed(2)}/${v.lat.toFixed(5)}/${v.lng.toFixed(5)}`;
  const b = Math.round(v.bearing), p = Math.round(v.pitch);
  if (b || p) s += `/${b}/${p}`;
  if (v.poi) s += `&poi=${encodeURIComponent(v.poi)}`;
  history.replaceState(history.state, '', `#${s}`);
}
