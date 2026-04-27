# Painted City

> A narrative cartography of New York City's public art.

**Live site:** https://0xmlow.github.io/NYC-public-art/
**Repository:** https://github.com/0xmlow/NYC-public-art

Built for *Advanced GIS: Interactive Web Mapping and Spatial Data Visualization* (NYU, SP26).

---

## Why this exists

Most New Yorkers walk past dozens of public artworks every day without ever knowing what they are, who made them, or why they're there. The information exists — it's scattered across NYC Parks plaques, the DOT Art Program archive, Wikipedia articles, neighborhood blogs, and word-of-mouth lore — but it's never been *spatial*. There's no map.

**Painted City is the field guide.** Every monument, mural, fountain, sculpture, and installation in the five boroughs, geolocated, color-coded, searchable, and click-to-explore. From Keith Haring's 1986 *Crack is Wack* on a Harlem handball court, to the 19th-century bronzes of Central Park, to the rotating murals of the Bushwick Collective and the Bowery — the whole city becomes one navigable exhibition.

## What it does

- **1,436 geolocated artworks** rendered as Blossom-icon pins, color-coded by type (Sculpture / Mural / Installation / Plaque / Fountain / Relief / Other)
- **Native Mapbox clustering** so the dataset stays performant — at low zoom you see borough-level aggregates with counts; zoom in and they break apart into individual works
- **3D building extrusions** for spatial context at street level
- **NYC spotlight mask** dims everything outside the five boroughs
- **Full-text search** across title / artist / location / borough / type / year
- **Three-axis filtering** by borough · type · era (chips in the sidebar)
- **Detail panel** with image, artist statement, materials, dimensions, sponsor, source link
- **Cinematic intro** — a multi-stage `flyTo` from the harbor to Manhattan that reveals the cluster overlay
- **"Surprise me" mode** for serendipitous discovery, biased toward curated picks
- **Auto-tour demo mode** — append `?demo=1` to the URL for a 50-second walkthrough of every feature
- **Keyboard shortcuts** — `/` focuses search, `r` for surprise, `Esc` closes detail or aborts the demo

## Data sources

The dataset is a merge of three streams:

| Source | Records | Notes |
|---|---|---|
| [NYC Parks Monuments](https://data.cityofnewyork.us/Recreation/NYC-Parks-Monuments/6rrm-vxj9) | ~933 | Coordinate system: NY State Plane (EPSG:2263) → reprojected to WGS84 (EPSG:4326) via `pyproj` |
| [NYC DOT Art Program](https://data.cityofnewyork.us/Transportation/DOT-Art-Program/3r2x-bnmj) | ~490 | Already in lat/lon; mostly contemporary murals and street installations |
| Curated editorial picks | 13 | Hand-written entries for the most iconic works (Charging Bull, Vessel, Alamo, etc.) with full artist statements + verified Wikimedia images |

After dedupe and an automatic Wikipedia/Wikimedia image-enrichment pass, **1,226 of 1,436 entries (85%)** carry a thumbnail image in the detail panel. The remainder gracefully fall back to a colored placeholder.

A snapshot of the merged data is also published as a spreadsheet at `data/painted_city_dataset.xlsx` for inspection or hand-off.

## Stack

- **[Mapbox GL JS v3.8](https://docs.mapbox.com/mapbox-gl-js/api/)** — base map (`mapbox/dark-v11`), GeoJSON sources, clustering, symbol/fill/circle/fill-extrusion layers, expression-based data-driven styling, camera control
- **Vanilla HTML / CSS / JS** — no build step, no framework. Three files (`index.html`, `style.css`, `script.js`) wired together with a single `<script>` tag.
- **Python data pipeline** (`scripts/`):
  - `build_dataset.py` — load CSVs, reproject coordinates with `pyproj`, normalize fields, dedupe, write `artworks.json` + `painted_city_dataset.xlsx` (via `openpyxl`)
  - `enrich_images.py` — multi-threaded Wikipedia + Wikimedia Commons API client that finds a thumbnail for every artwork (two-pass strict→loose query strategy)
  - `build_mask.py` — fetch borough boundaries, simplify with Douglas–Peucker, emit a "world-minus-NYC" GeoJSON polygon
- **GitHub Actions** for a weekly automated dataset refresh (`.github/workflows/update-data.yml`)
- **GitHub Issue Forms** for community submissions (`.github/ISSUE_TEMPLATE/submit-artwork.yml`)

## GIS techniques used

This project demonstrates the core Mapbox-GL-JS competencies from the assignment rubric:

| Technique | Where in the code |
|---|---|
| **GeoJSON loaded as a `geojson` source** | `script.js → buildMapLayers()` (artworks) and `addNycMask()` (mask) |
| **Clustering via source options** | `cluster: true, clusterRadius: 42, clusterMaxZoom: 14` |
| **Multiple layers reading one source** | `clusters` (circle), `cluster-count` (symbol), `points` (symbol) all bound to `artworks` |
| **Filter expressions** | `['has', 'point_count']` vs `['!', ['has', 'point_count']]` to split clustered vs. individual rendering |
| **Step expressions** | `['step', ['get','point_count'], …]` drives cluster size + color tiers |
| **Case expressions** | `['case', ['==', ['get','curated'], 1], a, b]` makes curated picks 1.5× larger and full-opacity |
| **Interpolate / zoom-driven** | `['interpolate', ['linear'], ['zoom'], …]` scales pin size and dims the mask as the user zooms in |
| **Get expression for icon-image** | `'icon-image': ['get', 'iconName']` — every feature carries its own icon name in properties |
| **Polygon with holes** | `nyc_mask.json` is one Polygon: outer ring = world bbox, inner rings = each NYC borough |
| **3D extrusions** | `fill-extrusion` layer reading the Mapbox Streets `building` source-layer |
| **Camera animation** | `flyTo({center, zoom, pitch, bearing, duration})` for the intro and pin-click transitions |
| **Cluster expansion zoom** | `getClusterExpansionZoom()` on cluster click to drill in |

## Repository structure

```
.
├── index.html                       # DOM scaffold — map div + UI overlays
├── style.css                        # Dark theme, sidebar, panels, animations
├── script.js                        # Mapbox + UI logic (all interactivity)
├── README.md                        # this file
├── data/
│   ├── artworks.json                # the GeoJSON-friendly artwork dataset (1,436 records, 1.2 MB)
│   ├── nyc_mask.json                # polygon-with-holes for the NYC spotlight effect
│   ├── painted_city_dataset.xlsx    # same dataset as a styled spreadsheet
│   ├── community_additions.json     # merge point for reviewed community submissions
│   ├── nyc_parks_monuments.csv      # raw NYC Open Data
│   └── nyc_dot_art.csv              # raw NYC Open Data
├── icons/
│   └── blossom-01.svg … 07.svg      # 7 Blossom-brand category icons
├── scripts/
│   ├── build_dataset.py             # CSV → JSON + XLSX merge pipeline
│   ├── build_mask.py                # borough boundary fetch + simplify
│   └── enrich_images.py             # Wikipedia / Commons thumbnail lookup
└── .github/
    ├── workflows/update-data.yml    # weekly cron refresh
    └── ISSUE_TEMPLATE/submit-artwork.yml   # community submission form
```

## Run locally

```bash
git clone git@github.com:0xmlow/NYC-public-art.git
cd NYC-public-art
python3 -m http.server 8765
# open http://localhost:8765
```

The site is fully static — no API server, no build step. Just an HTTP server pointing at the project root.

## Rebuild the dataset

```bash
python3 -m pip install pyproj openpyxl certifi
python3 scripts/build_dataset.py     # rebuild artworks.json + xlsx from raw CSVs
python3 scripts/build_mask.py        # rebuild data/nyc_mask.json
python3 scripts/enrich_images.py     # add Wikipedia/Commons thumbnails
```

## Contributing — keep the map fresh

### Channel 1: Weekly automated refresh

`.github/workflows/update-data.yml` runs every **Monday 07:00 UTC**:
1. Re-pulls the latest NYC Parks Monuments + DOT Art datasets
2. Reruns `build_dataset.py` + `build_mask.py` + `enrich_images.py`
3. Auto-commits the regenerated files (only if anything actually changed)

You can also kick it off manually: **Actions → "Refresh artworks dataset" → Run workflow**.

### Channel 2: Community submissions via Issues

Open an issue using the **🎨 Submit an artwork** template:
**https://github.com/0xmlow/NYC-public-art/issues/new?template=submit-artwork.yml**

The form captures title, artist, year, borough, type, address, lat/lon, description, artist statement, image URL, and source link. After review, a maintainer adds the entry to `data/community_additions.json`; the next rebuild merges it into the live map.

## Credits

- **Built by** MLow · 2026
- **Data:** NYC Department of Parks & Recreation · NYC DOT Art Program
- **Imagery:** Wikipedia · Wikimedia Commons (CC-licensed thumbnails)
- **Icons:** Blossom Brand assets
- **Course:** *Advanced GIS: Interactive Web Mapping and Spatial Data Visualization* — NYU Tandon, SP26

## License

Code is provided as-is for academic review. Image thumbnails are hot-linked from Wikipedia / Wikimedia and remain under their original licenses.
