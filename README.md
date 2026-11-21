# Leonida Online Map

An unofficial, community-maintained vector map of the state of Leonida from Grand Theft Auto VI.

**Live map:** https://enkerewpo.github.io/leonida-online-map/

![Screenshot of the map](docs/screenshot.png)

The map is drawn in the browser with [MapLibre GL JS](https://maplibre.org/) from plain GeoJSON files, so it
zooms, rotates and tilts like any web map, and every line on it can be edited in a text editor or a GIS tool.
It shows the coastline, land use, roads, buildings and place names, plus a list of community-found vehicles,
weapons and easter eggs. The interface is in English, Simplified Chinese and Traditional Chinese.

There are no ads, no analytics and no tracking. Story spoilers are not accepted.

## How the data is made

The base map is the in-game map itself: GTADB's tiles, "GTA VI Map Tiles (CC BY 4.0) — https://map.gtadb.org",
served level by level like any map app (CI fetches them from [rolux/gtadb.org](https://github.com/rolux/gtadb.org)
at build time; they are not stored in this repository). On top of it the site draws what lives in `data/`:
region and place names (read off [Rockstar's official map](https://www.rockstargames.com/VI/media)), named
landmarks ("GTA VI Landmarks Data (CC BY 4.0) — https://map.gtadb.org"), highway numbers and road names, and
community finds, each shown from the zoom where it fits. All of it is plain GeoJSON that anyone can fix or extend
with a pull request — see [CONTRIBUTING.md](CONTRIBUTING.md) · [社区手册（中文）](docs/handbook.zh-Hans.md).

Coordinates are longitude/latitude with the state placed on the equator around 0, 0, where degrees are
close to square. One pixel of the official map is 1609.344 / 600 m (the poster's scale bar is 600 px to a
mile). `tools/geo.py` and `src/geo.ts` convert between the two.

| File | What it holds |
| --- | --- |
| `data/land.geojson` | land polygons; lakes are holes, everything else is sea |
| `data/landuse.geojson` | urban ground, beach, swamp, parks and so on |
| `data/buildings.geojson` | building footprints, with an optional `height` |
| `data/roads.geojson` | road centrelines by class, with optional `name` and `ref` |
| `data/places.geojson` | labels: state, counties, cities, towns, districts, islands, water, landmarks |
| `data/poi.geojson` | finds: vehicles, weapons, easter eggs and more, each with a source link |

The full property schema is in [CONTRIBUTING.md](CONTRIBUTING.md).

## Contributing

Corrections and additions are welcome, small ones included.

1. Edit the GeoJSON in `data/`. [QGIS](https://qgis.org/) and [geojson.io](https://geojson.io/) both work;
   so does a text editor for names and notes.
2. Run `npm run validate` and fix anything it reports.
3. Open a pull request saying what you changed and how you know.

Every change needs a source someone else can check: a screenshot you took in the game, your own in-game
observation, or official Rockstar material. Leaked builds, datamined or extracted game files and story spoilers
are not accepted, and neither are copied images or icons from the game.

If you would rather not edit files, open an issue with a map link (the address bar keeps the current view and
selection) and a screenshot.

## Running it locally

Needs Node.js 22 or newer.

```sh
npm install
npm run dev        # http://localhost:5173/leonida-online-map/
npm run validate   # check data/*.geojson
npm run build      # static site in dist/
npm run preview    # serve dist/
```

The app reads `data/` directly during development, and the build copies it into `dist/data/`.

## Legal

Unofficial fan project. Not affiliated with or endorsed by Rockstar Games or Take-Two Interactive. Grand Theft
Auto and related marks are trademarks of Take-Two Interactive.

The map geometry is traced from Rockstar's officially released Leonida map, © Rockstar Games. It is used for
non-commercial fan purposes and will be removed on request. The site contains no game files, no extracted game
assets, no ads and no donation links. The icons are our own drawings and the fonts are open-source.

## Licences

- Code: MIT, see [LICENSE](LICENSE).
- Map data in `data/`: CC BY-NC-SA 4.0, see [data/LICENSE](data/LICENSE). This covers contributors' work only
  and grants no rights in Rockstar's material.
- Fonts (Jost, Inter, Noto Sans SC, Noto Sans TC): SIL Open Font License 1.1, see [fonts/](fonts/).
- MapLibre GL JS: BSD-3-Clause.
