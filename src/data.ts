// Loads data/*.geojson (copied next to the app at build time) and prepares it for the map and the panel.
import { circleRing } from './geo';

export type FC = GeoJSON.FeatureCollection<GeoJSON.Geometry | null, Record<string, any>>;
export type Feature = FC['features'][number];

export const LAYERS = ['land', 'landuse', 'buildings', 'roads', 'places', 'poi'] as const;
export type LayerName = typeof LAYERS[number];

const url = (name: string) => `${import.meta.env.BASE_URL}data/${name}.geojson`;

export function fetchLayer(name: LayerName): Promise<FC> {
  return fetch(url(name)).then((r) => {
    if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
    return r.json() as Promise<FC>;
  });
}

/** Only pinned finds go on the map; all of them are listed in the panel. */
export function pinned(fc: FC): FC {
  return { type: 'FeatureCollection', features: fc.features.filter((f) => f.geometry) };
}

/** A translucent circle for each find that is only known to within `radius_m`. */
export function searchAreas(fc: FC): FC {
  const features: Feature[] = [];
  for (const f of fc.features) {
    const r = Number(f.properties?.radius_m);
    if (f.geometry?.type !== 'Point' || !(r > 0)) continue;
    features.push({
      type: 'Feature',
      properties: { id: f.properties!.id, category: f.properties!.category },
      geometry: { type: 'Polygon', coordinates: [circleRing(f.geometry.coordinates as [number, number], r)] },
    });
  }
  return { type: 'FeatureCollection', features };
}
