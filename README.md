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

## Credits

Built by MLow · 2026 · for GIS at NYU
