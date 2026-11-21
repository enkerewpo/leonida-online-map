# Contributing to the Leonida Online Map

Thanks for helping. This page describes what goes in each data file and how the map decides what to show at
each zoom. The allowed values live in [`src/schema.json`](src/schema.json); `npm run validate` checks every file
against it, and CI runs the same check on each pull request.

## Ground rules

- **Every change needs a checkable source.** A screenshot you took in the game, your own in-game observation,
  or official Rockstar material (the published map, trailers, the Rockstar website). Say which in the pull
  request. Finds in `poi.geojson` carry the link in their `source` property.
- **No leaked or extracted game files**, no datamined coordinates, no ripped icons, textures or fonts.
- **No story spoilers.** Mission names, plot locations and endings stay out. If something only unlocks later,
  use the `later` flag and keep the text vague.
- Keep pull requests small and on one topic; it makes review quick.

## Coordinates

All files are GeoJSON `FeatureCollection`s in longitude/latitude (WGS84 axis order: `[lon, lat]`). Leonida sits
on the equator around 0, 0, roughly lon −0.065…0.065 and lat −0.091…0.091. One degree is 111 319.49 m in both
directions; one pixel of the official map is 1609.344 / 600 m. `tools/geo.py` converts official-map pixels to
coordinates. Real-world coordinates are rejected by the validator.

Polygons follow the usual GeoJSON rules: the first ring is the outline, any further rings are holes, every ring
is closed (last position equals the first).

## Layers and properties

### `land.geojson`
`Polygon` or `MultiPolygon`. Everything that is not land is sea.

| Property | Required | Values |
| --- | --- | --- |
| `class` | yes | `land` |

Lakes are holes in the land polygons.

### `landuse.geojson`
`Polygon` or `MultiPolygon`, drawn on top of the land.

| Property | Required | Values |
| --- | --- | --- |
| `class` | yes | `urban`, `industrial`, `beach`, `swamp`, `park`, `forest`, `grass`, `golf`, `farmland`, `airport`, `runway`, `water` |

### `buildings.geojson`
`Polygon` or `MultiPolygon`.

| Property | Required | Values |
| --- | --- | --- |
| `class` | yes | `building` |
| `height` | no | metres, used by the 3D view. Without it the app guesses a modest height from the footprint. |

### `roads.geojson`
`LineString` or `MultiLineString`, drawn along the centre of the road. Split lines at junctions.

| Property | Required | Values |
| --- | --- | --- |
| `class` | yes | `motorway`, `trunk`, `primary`, `secondary`, `street`, `service`, `track`, `path`, `rail`, `ferry` |
| `name` | no | street name, shown along the line when zoomed in |
| `ref` | no | route number such as `97` or `1A`, shown in a shield |
| `name:zh-Hans`, `name:zh-Hant` | no | Chinese names |

### `places.geojson`
`Point`, placed where the label should sit.

| Property | Required | Values |
| --- | --- | --- |
| `name` | yes | English name as printed in the game |
| `kind` | yes | `state`, `county`, `city`, `town`, `district`, `island`, `water`, `airport`, `landmark` |
| `name:zh-Hans`, `name:zh-Hant` | no | Chinese names, only where Rockstar has published them or the game shows them |
| `rank` | no | 0 = most important; used to decide which label wins when two collide |
| `source` | no | where the name comes from |

### `poi.geojson` (finds)
`Point`, or `null` geometry when the spot is not pinned yet. Unpinned finds are listed in the panel with
"Location not pinned yet" and are not drawn on the map.

| Property | Required | Values |
| --- | --- | --- |
| `id` | yes | unique lowercase slug, e.g. `turbo-ruiner`. Used in share links, so do not rename it lightly. |
| `category` | yes | `vehicle`, `weapon`, `easter-egg`, `shop`, `gas`, `pay-n-spray`, `clothes`, `barber`, `tattoo`, `food`, `safehouse`, `landmark`, `activity`, `collectible` |
| `name` | yes | English name |
| `name:zh-Hans`, `name:zh-Hant` | no | Chinese names |
| `area:en` (and `:zh-Hans`, `:zh-Hant`) | recommended | short area name shown under the name in lists |
| `where:en` (and translations) | required when unpinned | how to find it |
| `note:en` (and translations) | no | anything else worth knowing |
| `flags` | no | any of `day`, `night`, `alarm`, `tracker`, `random`, `later` |
| `radius_m` | no | when the spot is only known roughly: radius of the search area in metres, drawn as a circle |
| `source` | yes | `http(s)` link to where this can be checked |

Localised text uses the key form `field:lang` with `lang` one of `en`, `zh-Hans`, `zh-Hant` (case matters).
The app falls back to the plain field, then English.

### Adding a category, class or kind

1. Add the value to `src/schema.json`.
2. For a POI category, add an entry to `src/categories.ts`: a badge colour, a glyph drawn on a 24×24 grid in
   white, and names in the three languages. Draw your own glyph; do not copy game icons.
3. For a land use or road class, give it a colour or width in `src/style.ts` (otherwise it gets the default).

## What shows at each zoom

The map follows the game's pause map: far out you see the state and its counties, and detail appears as you
zoom in. At the default view (the whole state on screen) the zoom is about 11.

| Zoom | Appears |
| --- | --- |
| 10+ | land, land use, motorways, county names, the state name (until ~12.4), sea names |
| 11.7+ | city names |
| 11.9+ | primary roads |
| 12.3+ | town names |
| 12.9+ | find icons (and their search-area circles from 12.5) |
| 13+ | district, island and airport names |
| 13.2+ | streets |
| 13.8 | county names fade out |
| 14+ | buildings (3D when the map is tilted) |
| 14.6+ | landmark names |
| 14.8+ | find names |
| 15+ | street names and road casings |

Place labels sit where the name should be read, not on the exact point of interest; county and city labels in
the middle of the area they name.

## Checking your change

```sh
npm install
npm run validate
npm run dev
```

Open the dev server, find your change on the map, and attach a screenshot to the pull request.
If you have a copy of the official map saved as `reference/leonida.png` (it is not in the repository),
`python3 tools/overlay.py` draws the data over it for a side-by-side check.
