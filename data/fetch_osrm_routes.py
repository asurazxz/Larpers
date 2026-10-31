"""Fetch OSRM route geometries for the map. Online, one-off; data/prepare.py never runs this.

Writes data/reference/osrm_routes.json: per node pair, OSRM road distance, a simplified polyline6 and the
snap distance at each end. Display only: costs use the 84x84 OSRM table (osrm_table_84.json) or the road factor.

Pairs: every flow in web/data/bundle.json, every shortlisted refinery to PNK/PKN/BPN, and every onshore depot
to a shortlisted refinery, so live solves usually hit too. One route per unordered pair; the map reverses it.
TRK legs are skipped: Tarakan is an island and its last leg is a barge, drawn straight.

OSRM_URL defaults to the public demo server (car profile, at most 1 request per second). The output file is
also the cache: a rerun skips pairs already fetched.

    python data/fetch_osrm_routes.py [--dry-run]
"""

import argparse
import json
import os
import ssl
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from solver.candidates import SHORTLIST  # noqa: E402
from solver.inputs import load_inputs  # noqa: E402

OUT = ROOT / "data" / "reference" / "osrm_routes.json"
BUNDLE = ROOT / "web" / "data" / "bundle.json"
OSRM_URL = os.environ.get("OSRM_URL", "https://router.project-osrm.org").rstrip("/")
USER_AGENT = "larpers-saf-kalimantan/1.0 (Autonomous SG 2026 hackathon; one-off route fetch)"
MIN_INTERVAL_S = 1.0
try:  # python.org builds on macOS ship without a CA bundle
    import certifi
    SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    SSL_CONTEXT = ssl.create_default_context()
ISLAND = "TRK"


def pair_key(a, b):
    return f"{a}|{b}" if a < b else f"{b}|{a}"


def wanted_pairs(inputs):
    """Pairs in fetch order: stored-run flows first, so a cut-short fetch still covers what the map shows."""
    pairs = []
    bundle = json.loads(BUNDLE.read_text(encoding="utf-8"))
    for run in bundle["runs"].values():
        for flow in (run.get("solution") or {}).get("flows", []):
            pairs.append((flow["from"], flow["to"]))
    refineries = list(SHORTLIST)
    for r in refineries:
        for apt in ("PNK", "PKN", "BPN"):
            pairs.append((r, apt))
    onshore = list(inputs.sites.loc[inputs.sites["is_candidate"], "site_id"])
    for d in onshore:
        for r in refineries:
            pairs.append((d, r))
    unique = {}
    for a, b in pairs:
        if a == b or ISLAND in (a, b):
            continue
        unique.setdefault(pair_key(a, b), tuple(sorted((a, b))))
    return unique


def fetch(a_lonlat, b_lonlat):
    coords = f"{a_lonlat[0]:.6f},{a_lonlat[1]:.6f};{b_lonlat[0]:.6f},{b_lonlat[1]:.6f}"
    url = f"{OSRM_URL}/route/v1/driving/{coords}?overview=simplified&geometries=polyline6"
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=30, context=SSL_CONTEXT) as response:
        body = json.loads(response.read())
    if body.get("code") != "Ok":
        raise RuntimeError(f"OSRM {body.get('code')}: {body.get('message')}")
    route = body["routes"][0]
    return {
        "distance_m": route["distance"],
        "polyline6": route["geometry"],
        "snap_from_m": body["waypoints"][0]["distance"],
        "snap_to_m": body["waypoints"][1]["distance"],
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="count pairs and exit")
    args = parser.parse_args()

    inputs = load_inputs()
    lonlat = {}
    for row in inputs.sites.itertuples():
        lonlat[row.site_id] = (row.lon, row.lat)
    for row in inputs.airports.itertuples():
        lonlat[row.iata] = (row.lon, row.lat)

    pairs = wanted_pairs(inputs)
    out = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {"routes": {}}
    todo = [k for k in pairs if k not in out["routes"]]
    print(f"{len(pairs)} pairs, {len(pairs) - len(todo)} cached, {len(todo)} to fetch, ~{len(todo) * MIN_INTERVAL_S / 60:.0f} min")
    if args.dry_run or not todo:
        return

    out.update({"profile": "car", "osrm_url": OSRM_URL})
    failed = []
    last = 0.0
    for i, key in enumerate(todo, 1):
        a, b = pairs[key]
        time.sleep(max(0.0, MIN_INTERVAL_S - (time.monotonic() - last)))
        last = time.monotonic()
        try:
            out["routes"][key] = fetch(lonlat[a], lonlat[b])
        except Exception as error:  # keep going; a rerun retries the gaps
            failed.append(key)
            print(f"  {key}: {error}", file=sys.stderr)
        if i % 50 == 0 or i == len(todo):
            out["fetched_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
            out["routes"] = dict(sorted(out["routes"].items()))
            OUT.write_text(json.dumps(out, indent=1) + "\n", encoding="utf-8")
            print(f"  {i}/{len(todo)} saved")
    print(f"done: {len(out['routes'])} routes, {len(failed)} failed")


if __name__ == "__main__":
    main()
