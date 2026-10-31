"""Fetch Borneo's main roads from OpenStreetMap for the map's offline road layer. Online, one-off.

Overpass API, no key. Keeps motorway, trunk, primary and secondary ways, simplifies each (Douglas-Peucker) and
writes data/reference/osm_roads.json as encoded polylines (1e5) by class. Display only: costs never read it.
The raw Overpass response is about 50 MB, so only the simplified file is committed.

    python data/fetch_osm_roads.py [--raw saved_overpass.json]
"""

import argparse
import json
import ssl
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "reference" / "osm_roads.json"
OVERPASS = "https://overpass-api.de/api/interpreter"
USER_AGENT = "larpers-saf-kalimantan/1.0 (Autonomous SG 2026 hackathon; one-off road fetch)"
BBOX = (-4.5, 108.5, 4.6, 119.4)  # south, west, north, east: the map's Kalimantan bounds
CLASSES = ("motorway", "trunk", "primary", "secondary")
# Degrees. Secondary roads are drawn thin and only matter at a glance, so they take a coarser tolerance.
TOLERANCE = {"motorway": 0.002, "trunk": 0.002, "primary": 0.002, "secondary": 0.004}
QUERY = (f'[out:json][timeout:170];way["highway"~"^({"|".join(CLASSES)})$"]'
         f"({','.join(map(str, BBOX))});out geom qt;")

try:  # python.org builds on macOS ship without a CA bundle
    import certifi
    SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    SSL_CONTEXT = ssl.create_default_context()


def simplify(points, tol):
    """Douglas-Peucker on (lat, lon) in degrees."""
    if len(points) < 3:
        return points
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        s, e = stack.pop()
        (ay, ax), (by, bx) = points[s], points[e]
        dx, dy = bx - ax, by - ay
        length = (dx * dx + dy * dy) ** 0.5 or 1e-12
        worst, at = -1.0, -1
        for k in range(s + 1, e):
            py, px = points[k]
            d = abs(dy * px - dx * py + bx * ay - by * ax) / length
            if d > worst:
                worst, at = d, k
        if worst > tol:
            keep[at] = True
            stack += [(s, at), (at, e)]
    return [p for p, k in zip(points, keep) if k]


def encode(points):
    """Google encoded polyline at 1e5."""
    out, prev = [], (0, 0)
    for lat, lon in points:
        cur = (round(lat * 1e5), round(lon * 1e5))
        for v in (cur[0] - prev[0], cur[1] - prev[1]):
            v = ~(v << 1) if v < 0 else v << 1
            while v >= 0x20:
                out.append(chr((0x20 | (v & 0x1F)) + 63))
                v >>= 5
            out.append(chr(v + 63))
        prev = cur
    return "".join(out)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--raw", help="use a saved Overpass response instead of fetching")
    args = parser.parse_args()
    if args.raw:
        raw = json.loads(Path(args.raw).read_text(encoding="utf-8"))
    else:
        body = urllib.parse.urlencode({"data": QUERY}).encode()
        request = urllib.request.Request(OVERPASS, data=body, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(request, timeout=200, context=SSL_CONTEXT) as response:
            raw = json.loads(response.read())

    roads = {c: [] for c in CLASSES}
    points = 0
    for way in raw["elements"]:
        cls = way.get("tags", {}).get("highway")
        if way.get("type") != "way" or cls not in roads or len(way.get("geometry", [])) < 2:
            continue
        line = simplify([(g["lat"], g["lon"]) for g in way["geometry"]], TOLERANCE[cls])
        roads[cls].append(encode(line))
        points += len(line)
    out = {
        "source": "OpenStreetMap via Overpass API, (c) OpenStreetMap contributors, ODbL",
        "osm_base": raw.get("osm3s", {}).get("timestamp_osm_base"),
        "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "bbox": BBOX,
        "tolerance_deg": TOLERANCE,
        "roads": roads,
    }
    text = json.dumps(out, separators=(",", ":")) + "\n"
    OUT.write_text(text, encoding="utf-8")
    counts = ", ".join(f"{c} {len(v)}" for c, v in roads.items())
    print(f"{OUT.relative_to(ROOT)}: {counts}; {points} points, {len(text) / 1024:.0f} KB", file=sys.stderr)


if __name__ == "__main__":
    main()
