# Painted City

A narrative cartography of New York City's public art — an interactive field guide to **1,436 current and historical public artworks** across all five boroughs, built with Mapbox GL JS.

**Live site:** https://0xmlow.github.io/NYC-public-art/

## What it is

From Keith Haring's 1986 *Crack is Wack* handball court in Harlem, to the 19th-century bronzes of Central Park, to the rotating murals of Bushwick and the Bowery — the city itself is the gallery. This map is the field guide.

- 1,436 geolocated artworks merged from NYC Parks Monuments, NYC DOT Art Program, and a curated editorial layer
- Mapbox native clustering, 3D buildings, filter chips (borough / type / era), full-text search, surprise-me, detailed side panel with images and artist statements where available
- All data also available as a spreadsheet: `data/painted_city_dataset.xlsx`

## Stack

- **Mapbox GL JS v3.8** (dark-v11 style, clustered GeoJSON source, 3D extrusions)
- Vanilla HTML / CSS / JS — no build step
- Python data pipeline (`scripts/build_dataset.py`) using `pyproj` + `openpyxl`

## Data sources

- [NYC Parks Monuments](https://data.cityofnewyork.us/Recreation/NYC-Parks-Monuments/6rrm-vxj9)
- [NYC DOT Art Program](https://data.cityofnewyork.us/Transportation/DOT-Art-Program/3r2x-bnmj)
- Curated editorial picks (Wikimedia Commons imagery)

## Run locally

```bash
python3 -m http.server 8765
# open http://localhost:8765
```

## Rebuild the dataset

```bash
pip install pyproj openpyxl requests
python3 scripts/build_dataset.py
```

## Keeping the dataset fresh

Two channels feed new artwork into the map:

### 1. Weekly automated refresh from NYC Open Data

A GitHub Actions workflow (`.github/workflows/update-data.yml`) runs every **Monday at 07:00 UTC**:
1. Re-pulls the latest NYC Parks Monuments + DOT Art datasets
2. Rebuilds the coordinate transform + merge (`scripts/build_dataset.py`)
3. Rebuilds the NYC borough mask (`scripts/build_mask.py`)
4. Enriches new entries with Wikipedia / Commons thumbnails (`scripts/enrich_images.py`)
5. Commits and pushes if anything changed — the live site updates automatically

You can also trigger it manually from the **Actions** tab → *Refresh artworks dataset* → *Run workflow*.

### 2. Community submissions via Issues

Spotted a mural we're missing? An installation that just went up? Open an issue using the **🎨 Submit an artwork** template:
- https://github.com/0xmlow/NYC-public-art/issues/new?template=submit-artwork.yml

The form captures title, artist, coordinates, photo link, and description. A maintainer reviews the submission, adds it to `data/community_additions.json`, and the next rebuild (manual or scheduled) merges it into the live map.

The schema of `community_additions.json` matches curated entries — an array of objects with `title`, `artist`, `year`, `borough`, `type`, `location`, `lon`, `lat`, `description`, and optionally `image_url`, `artist_statement`, `source_link`.

## Credits

Built by MLow · 2026 · for GIS at NYU
