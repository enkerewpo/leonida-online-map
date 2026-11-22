# Contributing to the Leonida Online Map

中文版：[docs/handbook.zh-Hans.md](docs/handbook.zh-Hans.md)

The base map is the in-game map itself (GTADB's tiles). Everything on top of it — place names, landmarks, road
names, finds — lives in plain GeoJSON files in [`data/`](data). Anyone can fix or add something with a pull
request; CI checks the files and the site redeploys when a change is merged.

## Three ways to help

1. **Report it (no setup).** Open the map, right-click (long-press on a phone) where something is missing or
   wrong, choose **Add or fix here**. It opens a GitHub issue with the coordinates filled in; write what is there
   and how you know. Or use the [issue forms](../../issues/new/choose) directly.
2. **Edit in the browser.** Open a file in `data/` on GitHub, press the pencil, change it, *Propose changes*.
   Good for typos, translations and moving a point a little.
3. **Edit on a map.** For new points and road lines, use QGIS or geojson.io with our tiles as the background
   (below), then open a pull request.

## Ground rules

- **Every change needs a checkable source**: a screenshot you took in the game, your own in-game observation, or
  official Rockstar material (the published map, trailers, rockstargames.com). Say which in the pull request.
  Finds and landmarks carry a `source` link.
- **No leaked or extracted game files**, no datamined coordinates, no ripped icons, textures or fonts.
- **No story spoilers.** Mission names, plot locations and endings stay out. If something only unlocks later,
  use the `later` flag and keep the text vague.
- **Translations**: Chinese names Rockstar or the game's own localisation uses win. Our own translations are
  welcome until an official one is known; mark them as described in [Translations](#translations).
- Keep pull requests small and on one topic.

## Drawing on our tiles

The site serves the in-game map as standard XYZ tiles:

```
https://enkerewpo.github.io/leonida-online-map/tiles/day/{z}/{x}/{y}.jpg     (512 px tiles, zoom 9–17)
```

- **QGIS**: *Browser → XYZ Tiles → New Connection*, paste the URL, max zoom 17, tile resolution 512. Add it, then open a file from
  `data/` (drag it in), *Toggle Editing*, draw, *Save Layer Edits*. Keep the layer in EPSG:4326 when saving.
- **geojson.io**: *Meta → Add map layer* with the URL above; draw; *Save → GeoJSON*; paste the features into the
  right file.

Coordinates are ordinary lon/lat (`[lon, lat]`). Leonida sits on the equator around 0, 0 (roughly
lon −0.11…0.03, lat −0.09…0.11); real-world coordinates are rejected. `tools/geo.py` converts game coordinates
(metres) to map coordinates.

## Files

All files are GeoJSON `FeatureCollection`s. Allowed values are in [`src/schema.json`](src/schema.json);
`npm run validate` checks everything (CI runs it on every pull request).

### `places.geojson` — region and place names
`Point`, where the label should sit.

| Property | Required | Values |
| --- | --- | --- |
| `name` | yes | English name as printed in the game |
| `kind` | yes | `state`, `county`, `city`, `town`, `district`, `island`, `water`, `airport`, `landmark` |
| `name:zh-Hans`, `name:zh-Hant` | no | Chinese names |
| `rank` | no | 0 = most important; decides which label wins when two collide |
| `source` | no | where the name comes from |

Big names show when zoomed out and fade as you zoom in; small ones appear only when zoomed in.

### `landmarks.geojson` — named buildings and places
`Point`. Seeded from GTADB's landmark list (CC BY 4.0).

| Property | Required | Values |
| --- | --- | --- |
| `id` | yes | unique id (GTADB's `L123`, or a lowercase slug for new ones) |
| `name` | yes | English name |
| `category` | yes | see `src/schema.json` (e.g. `gas`, `guns`, `club`, `food`, `shop`, `hotel`, `police`, `hospital`, `transit`, `landmark`…) |
| `minzoom` | yes | zoom from which it is shown (12–20). Big landmarks ~14.5, shops ~16.5, small things 17+ |
| `area` | no | district / neighbourhood |
| `enterable` | no | `true` if you can go inside |
| `name:zh-Hans`, `name:zh-Hant` | no | Chinese names |
| `source` | yes | `http(s)` link |

### `roads-named.geojson` — road and highway names
`LineString` along the road (the line itself is not drawn; it carries the label).

| Property | Required | Values |
| --- | --- | --- |
| `class` | yes | `motorway`, `primary`, `street` |
| `ref` | no | route number, e.g. `I-97`, `US 35`, `SR 183`, `CR 62` (shown in a shield) |
| `name` | no | street name, e.g. `Dolphin Dr` (shown along the line) |
| `name:zh-Hans`, `name:zh-Hant` | no | Chinese names |
| `source` | no | where it comes from |

Street names along a road: draw one line along the street (a few points are enough) and give it a `name`.

### `poi.geojson` — finds
`Point`, or `null` geometry when the spot is not pinned yet (listed, not drawn).

| Property | Required | Values |
| --- | --- | --- |
| `id` | yes | unique lowercase slug, e.g. `turbo-ruiner` (used in share links) |
| `category` | yes | `vehicle`, `weapon`, `easter-egg`, `hideout`, `freebie`, `hidden-item`, `nightclub`, `shop`, `gas`, … (see `src/schema.json`) |
| `name` | yes | English name |
| `area:en`, `where:en`, `note:en` (+ `:zh-Hans`, `:zh-Hant`) | `where` required when unpinned | short texts |
| `flags` | no | any of `day`, `night`, `alarm`, `tracker`, `random`, `later` |
| `radius_m` | no | search-area radius in metres when only roughly known |
| `source` | yes | `http(s)` link |

Localised text uses `field:lang` with `lang` one of `en`, `zh-Hans`, `zh-Hant` (case matters). The app falls back
to the plain field, then English.

## Translations

Chinese names go in `name:zh-Hans` and `name:zh-Hant`. The working glossary is
[`tools/i18n/zh-Hans.json`](tools/i18n/zh-Hans.json) with a status per name: `official` (Rockstar or the game),
`series` (established in earlier GTA games), `community` (ours), `keep` (left in Latin script). To correct a
name, change it there with a source, and run `python3 tools/apply_i18n.py`, which writes both Chinese fields
(Traditional is converted with OpenCC and can be overridden in `tools/i18n/zh-Hant.json`).

## Adding a category

1. Add the value to `src/schema.json`.
2. Add an entry to `src/categories.ts`: badge colour, a glyph drawn by you on a 24×24 grid in white, names in the
   three languages. Do not copy game icons.

## Running it locally

```sh
npm ci
git clone --depth 1 --filter=blob:none --sparse https://github.com/rolux/gtadb.org /tmp/gtadb
git -C /tmp/gtadb sparse-checkout set maps/tiles/6/day
npm run tiles -- /tmp/gtadb/maps/tiles/6/day     # lays out the in-game tiles in public/tiles/day
npm run validate
npm run dev
```
