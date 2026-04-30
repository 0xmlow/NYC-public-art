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


def find_image(art: dict) -> tuple[str, str | None]:
    aid = art["id"]
    # Pass 1: strict (title + artist + borough)
    query = build_query(art)
    if len(query) >= 4:
        url = wikipedia_image(query)
        if url:
            return aid, url
        url = commons_image(query)
        if url:
            return aid, url
    # Pass 2: loose (title + borough + NYC, no artist)
    query2 = build_query_loose(art)
    if query2 != query and len(query2) >= 4:
        url = wikipedia_image(query2)
        if url:
            return aid, url
        url = commons_image(query2)
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
