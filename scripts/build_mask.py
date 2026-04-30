#!/usr/bin/env python3
"""
Build data/nyc_mask.json — a single GeoJSON Polygon whose outer ring is
(nearly) the whole world and whose holes are the 5 NYC borough shapes.

Rendered as a semi-transparent fill layer in Mapbox, this dims everything
outside NYC while keeping the boroughs visually "punched out."
"""
from __future__ import annotations

import json
import ssl
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "data" / "nyc_mask.json"

# NYC borough boundaries (clipped to water). Sourced from dwillis/nyc-maps
# which mirrors NYC DCP / NYC Open Data boundary files.
URL = "https://raw.githubusercontent.com/dwillis/nyc-maps/master/boroughs.geojson"

# Rect that covers the whole map viewport without antimeridian weirdness.
# Mapbox is happy with [-180, -85] to [180, 85].
WORLD_RING = [
    [-180.0, -85.0],
    [180.0, -85.0],
    [180.0, 85.0],
    [-180.0, 85.0],
    [-180.0, -85.0],
]


def try_ssl_context():
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        try:
            ctx = ssl.create_default_context()
            urllib.request.urlopen("https://data.cityofnewyork.us/", context=ctx, timeout=5).read(1)
            return ctx
        except Exception:
            return ssl._create_unverified_context()


def douglas_peucker(points: list[list[float]], tolerance: float) -> list[list[float]]:
    """Simplify a polygon ring using Douglas-Peucker, preserving closure."""
    if len(points) <= 3:
        return points

    def perpendicular_distance(pt, a, b):
        # Euclidean distance from pt to segment a-b
        x, y = pt
        x1, y1 = a
        x2, y2 = b
        dx = x2 - x1
        dy = y2 - y1
        if dx == 0 and dy == 0:
            return ((x - x1) ** 2 + (y - y1) ** 2) ** 0.5
        t = max(0, min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)))
        px = x1 + t * dx
        py = y1 + t * dy
        return ((x - px) ** 2 + (y - py) ** 2) ** 0.5

    def dp(pts, eps):
        if len(pts) <= 2:
            return pts
        dmax = 0
        idx = 0
        for i in range(1, len(pts) - 1):
            d = perpendicular_distance(pts[i], pts[0], pts[-1])
            if d > dmax:
                dmax = d
                idx = i
        if dmax > eps:
            left = dp(pts[: idx + 1], eps)
            right = dp(pts[idx:], eps)
            return left[:-1] + right
        return [pts[0], pts[-1]]

    simplified = dp(points, tolerance)
    # Ensure ring closure
    if simplified[0] != simplified[-1]:
        simplified.append(simplified[0])
    return simplified


def extract_rings(features: list[dict]) -> list[list[list[float]]]:
    """From the borough boundaries feature collection, extract every outer
    polygon ring (one per island / borough piece). Inner rings (holes inside
    boroughs — rare in this dataset) are dropped."""
    rings = []
    for feat in features:
        geom = feat.get("geometry") or {}
        gtype = geom.get("type")
        coords = geom.get("coordinates") or []
        if gtype == "Polygon":
            if coords:
                rings.append(coords[0])
        elif gtype == "MultiPolygon":
            for poly in coords:
                if poly:
                    rings.append(poly[0])
    return rings


def main():
    ctx = try_ssl_context()
    print(f"fetching {URL}")
    req = urllib.request.Request(URL, headers={"User-Agent": "PaintedCity/1.0"})
    raw = urllib.request.urlopen(req, context=ctx, timeout=30).read()
    data = json.loads(raw)
    features = data.get("features", [])
    print(f"  got {len(features)} borough features")

    rings = extract_rings(features)
    print(f"  extracted {len(rings)} polygon rings")

    # Simplify each ring. Tolerance in degrees — 0.0001 ≈ 11m at NYC's latitude
    # which is well below Mapbox's screen resolution at our max zoom.
    tol = 0.0002
    simplified = []
    total_before = 0
    total_after = 0
    for r in rings:
        total_before += len(r)
        s = douglas_peucker(r, tol)
        # Skip degenerate rings (tiny slivers)
        if len(s) >= 4:
            simplified.append(s)
            total_after += len(s)
    print(f"  simplified vertices: {total_before} -> {total_after} ({100*total_after/max(1,total_before):.1f}%)")

    # Mapbox Polygon with holes: [outer, hole1, hole2, ...]
    mask_polygon = [WORLD_RING] + simplified

    mask_feature = {
        "type": "Feature",
        "properties": {"kind": "nyc_mask"},
        "geometry": {
            "type": "Polygon",
            "coordinates": mask_polygon,
        },
    }
    fc = {"type": "FeatureCollection", "features": [mask_feature]}

    OUT.write_text(json.dumps(fc, separators=(",", ":")))
    print(f"\nwrote {OUT}  ({OUT.stat().st_size/1024:.1f} KB)")


if __name__ == "__main__":
    sys.exit(main())
