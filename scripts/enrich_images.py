#!/usr/bin/env python3
"""
Enrich artworks.json with image URLs from Wikipedia / Wikimedia Commons.

Strategy per artwork (only for ones without image_url):
  1. Search Wikipedia for "<title> <artist> <borough>"
  2. If a page hit, fetch pageimages -> thumbnail URL (usually 640px)
  3. Fallback: search Commons File: namespace with same query, grab first hit

Runs with a thread pool for speed. Wikimedia APIs are generous with rate
limits when requests include a User-Agent.
"""
from __future__ import annotations

import json
import os
import ssl
import sys
import time
import urllib.parse
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

# Build an SSL context — prefer certifi, fall back to system, then unverified.
try:
    import certifi
    SSL_CTX = ssl.create_default_context(cafile=certifi.where())
except Exception:
    try:
        SSL_CTX = ssl.create_default_context()
        # Dry-run: some Python installs lack CA bundle — try a quick ping
        test = urlopen(Request("https://en.wikipedia.org/", headers={"User-Agent": "test"}),
                       timeout=5, context=SSL_CTX)
        test.read(1)
    except Exception:
        SSL_CTX = ssl._create_unverified_context()

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "public" / "data" / "artworks.json"

UA = "PaintedCity/1.0 (https://0xmlow.github.io/NYC-public-art/; 0xmlow@users.noreply.github.com)"

WIKI_API = "https://en.wikipedia.org/w/api.php"
COMMONS_API = "https://commons.wikimedia.org/w/api.php"
FLICKR_API = "https://api.flickr.com/services/rest/"
FLICKR_KEY = os.environ.get("FLICKR_API_KEY", "").strip()
FLICKR_LICENSES = "4,5,6,7,9,10"  # CC-BY, CC-BY-SA, CC-BY-ND, no-restrictions, CC0, PDM


def http_json(url: str, params: dict, timeout: float = 15.0, retries: int = 3) -> dict | None:
    import random
    qs = urllib.parse.urlencode(params)
    full = f"{url}?{qs}"
    last = None
    for attempt in range(retries):
        req = Request(full, headers={"User-Agent": UA, "Accept": "application/json"})
        try:
            with urlopen(req, timeout=timeout, context=SSL_CTX) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except HTTPError as e:
            last = e
            if e.code in (429, 500, 502, 503, 504):
                time.sleep(1.5 * (attempt + 1) + random.random())
                continue
            return None
        except (URLError, TimeoutError, json.JSONDecodeError) as e:
            last = e
            time.sleep(0.8 * (attempt + 1) + random.random() * 0.5)
            continue
    return None


def build_query(art: dict) -> str:
    parts = [art.get("title", "")]
    if art.get("artist"):
        parts.append(art["artist"])
    if art.get("borough"):
        parts.append(art["borough"])
    q = " ".join(p for p in parts if p).strip()
    # Strip quotes and parens that confuse full-text search
    for ch in ['"', "'", "(", ")", "[", "]"]:
        q = q.replace(ch, " ")
    return " ".join(q.split())


def build_query_loose(art: dict) -> str:
    """Looser query: just title + borough + NYC (drop artist)."""
    parts = [art.get("title", "")]
    if art.get("borough"):
        parts.append(art["borough"])
    parts.append("New York City")
    q = " ".join(p for p in parts if p).strip()
    for ch in ['"', "'", "(", ")", "[", "]"]:
        q = q.replace(ch, " ")
    return " ".join(q.split())


def wikipedia_image(query: str) -> str | None:
    # Single combined call: search -> pageimages via generator
    data = http_json(
        WIKI_API,
        {
            "action": "query",
            "format": "json",
            "generator": "search",
            "gsrsearch": query,
            "gsrlimit": "1",
            "prop": "pageimages",
            "piprop": "thumbnail",
            "pithumbsize": "640",
            "pilicense": "any",
            "redirects": "1",
        },
    )
    if not data:
        return None
    pages = (data.get("query") or {}).get("pages") or {}
    for _, page in pages.items():
        thumb = (page.get("thumbnail") or {}).get("source")
        if thumb:
            return thumb
    return None


def commons_image(query: str) -> str | None:
    # Search File: namespace
    data = http_json(
        COMMONS_API,
        {
            "action": "query",
            "format": "json",
            "list": "search",
            "srsearch": query,
            "srnamespace": "6",
            "srlimit": "1",
        },
    )
    if not data:
        return None
    hits = ((data.get("query") or {}).get("search") or [])
    if not hits:
        return None
    title = hits[0].get("title", "")
    if not title.startswith("File:"):
        return None
    # Lowercase-extension filter — skip svg/pdf/ogv/webm
    lower = title.lower()
    if not any(lower.endswith(ext) for ext in (".jpg", ".jpeg", ".png", ".tif", ".tiff", ".gif", ".webp")):
        return None
    # Build a 640px thumb URL via Special:FilePath
    filename = title[len("File:"):]
    url = f"https://commons.wikimedia.org/wiki/Special:FilePath/{urllib.parse.quote(filename)}?width=640"
    return url


# Words too generic to count as distinctive when validating that an
# image actually depicts the right subject.
_STOPWORDS = {
    "the", "and", "for", "with", "from", "fountain", "memorial", "plaque",
    "bench", "tablet", "bust", "sign", "signage", "mural", "statue",
    "monument", "sculpture", "inscription", "park", "avenue", "street",
    "place", "square", "building", "house", "wall", "panel", "relief",
    "this", "that", "their", "unknown", "artist", "york", "city", "new",
    "public", "art", "works", "work", "drinking",
}


def _title_tokens(s: str) -> set[str]:
    out = set()
    for ch in s.lower():
        pass
    cleaned = "".join(c if c.isalnum() else " " for c in s.lower())
    for w in cleaned.split():
        if len(w) >= 4 and w not in _STOPWORDS:
            out.add(w)
    return out


def _validates(url: str, title: str) -> bool:
    """A Wikimedia image filename is named after its subject. If the
    artwork's title shares no distinctive token with the filename,
    the match is almost certainly junk (e.g. 'Drinking Fountain' →
    aerial photo of Central Park)."""
    tokens = _title_tokens(title)
    if not tokens:
        return True  # nothing distinctive to check; let it through
    leaf = urllib.parse.unquote(url.split("?", 1)[0]).rsplit("/", 1)[-1].lower()
    if leaf.startswith(("640px-", "960px-", "1024px-")):
        leaf = leaf.split("-", 1)[1]
    return any(t in leaf for t in tokens)


def commons_geo_image(lat: float, lon: float, radius_m: int = 250) -> list[tuple[str, str]]:
    """Wikimedia Commons geosearch — finds files whose embedded geotag
    is within radius_m of (lat, lon). Returns [(url, filename), ...]
    sorted by Commons' default (distance ascending)."""
    data = http_json(
        COMMONS_API,
        {
            "action": "query",
            "format": "json",
            "list": "geosearch",
            "gscoord": f"{lat}|{lon}",
            "gsradius": str(radius_m),
            "gslimit": "20",
            "gsnamespace": "6",  # File: namespace
        },
    )
    out: list[tuple[str, str]] = []
    if not data:
        return out
    for h in (data.get("query") or {}).get("geosearch", []):
        title = h.get("title", "")
        if not title.startswith("File:"):
            continue
        lower = title.lower()
        if not any(lower.endswith(e) for e in (".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff")):
            continue
        filename = title[len("File:"):]
        url = (
            "https://commons.wikimedia.org/wiki/Special:FilePath/"
            + urllib.parse.quote(filename) + "?width=640"
        )
        out.append((url, filename))
    return out


def flickr_geo_image(art: dict) -> str | None:
    """Flickr photos.search restricted to CC-licensed photos within
    a small geographic window of the artwork. Requires FLICKR_API_KEY
    in the environment."""
    if not FLICKR_KEY:
        return None
    lat, lon = art.get("lat"), art.get("lon")
    if lat is None or lon is None:
        return None
    data = http_json(
        FLICKR_API,
        {
            "method": "flickr.photos.search",
            "api_key": FLICKR_KEY,
            "lat": str(lat),
            "lon": str(lon),
            "radius": "0.3",       # km
            "radius_units": "km",
            "text": art.get("title", "")[:80],
            "license": FLICKR_LICENSES,
            "content_type": "1",   # photos only
            "media": "photos",
            "sort": "relevance",
            "per_page": "5",
            "format": "json",
            "nojsoncallback": "1",
            "extras": "url_l,url_z,url_m,license,owner_name",
        },
    )
    if not data:
        return None
    photos = ((data.get("photos") or {}).get("photo") or [])
    title_tokens = _title_tokens(art.get("title", ""))
    for p in photos:
        photo_title = (p.get("title") or "").lower()
        # Validate: photo's own title should share a distinctive token.
        if not title_tokens or any(t in photo_title for t in title_tokens):
            return p.get("url_l") or p.get("url_z") or p.get("url_m")
    return None


def find_image(art: dict) -> tuple[str, str | None]:
    aid = art["id"]
    title = art.get("title", "")
    # Pass 1: strict text query (title + artist + borough)
    query = build_query(art)
    if len(query) >= 4:
        for fetcher in (wikipedia_image, commons_image):
            url = fetcher(query)
            if url and _validates(url, title):
                return aid, url
    # Pass 2: loose text query (drop artist, add NYC)
    query2 = build_query_loose(art)
    if query2 != query and len(query2) >= 4:
        for fetcher in (wikipedia_image, commons_image):
            url = fetcher(query2)
            if url and _validates(url, title):
                return aid, url
    # Pass 3: Commons geosearch — geotagged Commons files within ~250m
    lat, lon = art.get("lat"), art.get("lon")
    if lat is not None and lon is not None:
        for url, filename in commons_geo_image(lat, lon, 250):
            if _validates(url, title):
                return aid, url
    # Pass 4 (optional): Flickr CC search — needs FLICKR_API_KEY env var
    if FLICKR_KEY:
        url = flickr_geo_image(art)
        if url:
            return aid, url
    return aid, None


def main():
    if not DATA.exists():
        print("missing:", DATA, file=sys.stderr)
        sys.exit(1)

    artworks = json.loads(DATA.read_text())
    needing = [a for a in artworks if not a.get("image_url")]
    print(f"total={len(artworks)}  already_have_image={len(artworks) - len(needing)}  to_fetch={len(needing)}")

    by_id = {a["id"]: a for a in artworks}
    got = 0
    miss = 0
    start = time.time()

    with ThreadPoolExecutor(max_workers=4) as ex:
        futures = {ex.submit(find_image, a): a["id"] for a in needing}
        for i, fut in enumerate(as_completed(futures), 1):
            aid, url = fut.result()
            if url:
                by_id[aid]["image_url"] = url
                got += 1
            else:
                miss += 1
            if i % 50 == 0 or i == len(needing):
                dt = time.time() - start
                rate = i / dt if dt else 0
                print(f"  [{i}/{len(needing)}]  hits={got}  miss={miss}  ({rate:.1f}/s)")

    DATA.write_text(json.dumps(artworks, indent=1, ensure_ascii=False))
    print(f"\nwrote {DATA}")
    print(f"hit rate: {got}/{len(needing)} = {100*got/max(1,len(needing)):.1f}%")


if __name__ == "__main__":
    main()
