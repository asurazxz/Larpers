"""Assumption sweeps and robustness bands over stored runs.

Run from the repo root: python -m solver.sensitivity
Prints selection frequency from web/data/bundle.json. Run python -m solver.scenarios first.
"""

import argparse
import json
from collections import defaultdict
from pathlib import Path

# Around the official 0.20 yield ("15-25% for biomass-to-jet routes") and 1.3 road factor,
# up to the 1.9 we measured on OSRM.
YIELDS = (0.15, 0.175, 0.20, 0.225, 0.25)
ROAD_FACTORS = (1.3, 1.6, 1.9)
LOST_DISTRICTS = ("Ketapang", "Kutai Kartanegara")
BULUNGAN = ("KAL_SUP_18", "KAL_SUP_70")
SOLVED = ("optimal", "best_found", "heuristic")


def as_dict(obj):
    """A pydantic model or a plain dict, as JSON-ready dict by alias."""
    if obj is None or isinstance(obj, dict):
        return obj
    return obj.model_dump(mode="json", by_alias=True)


def sweep_slug(y, road_factor):
    return f"sweep_y{round(y * 1e4):04d}_rf{round(road_factor * 10):02d}"


def grid_overrides():
    """Yield x road factor grid, in run order."""
    return [
        (sweep_slug(y, rf), {"yield": y, "road_factor": rf})
        for y in YIELDS
        for rf in ROAD_FACTORS
    ]


def _slugify(text):
    return "_".join(text.lower().split())


def district_lost_overrides(sites):
    """Exclude every candidate site in the district. Depots go too: no refinery-only field exists."""
    out = []
    for district in LOST_DISTRICTS:
        ids = sorted(sites.loc[(sites["district"] == district) & sites["is_candidate"], "site_id"])
        out.append((f"district_lost_{_slugify(district)}", {"excluded_ids": ids}))
    return out


def facilities_of(solution, kind):
    return [f for f in as_dict(solution).get("facilities", []) if f.get("type") == kind]


def depots_by_throughput(solution):
    depots = facilities_of(solution, "depot")
    return [f["site_id"] for f in sorted(depots, key=lambda f: (-f.get("throughput_kt", 0.0), f["site_id"]))]


def regime(solution):
    """Refinery size mix, e.g. '1L', '1L+1S', '3S'."""
    sizes = [f.get("size", "") for f in facilities_of(solution, "refinery")]
    n_large = sum(1 for s in sizes if s.lower().startswith("l"))
    n_small = sum(1 for s in sizes if s.lower().startswith("s"))
    parts = [f"{n}{tag}" for n, tag in ((n_large, "L"), (n_small, "S")) if n]
    return "+".join(parts) or "none"


def band(k, n):
    if n and k == n:
        return "all"
    if n and k >= n / 2:
        return "most"
    return "some"


def robustness(entries, district_of):
    """Regime first, then refineries k of n by district within each regime.

    entries: bundle run entries ({slug, status, solution}); district_of: site id -> district.
    """
    by_regime = defaultdict(list)
    for entry in entries:
        if entry.get("status") not in SOLVED:
            continue
        by_regime[regime(entry["solution"])].append(entry)

    regimes = []
    for name, group in sorted(by_regime.items(), key=lambda kv: (-len(kv[1]), kv[0])):
        n = len(group)
        hits = defaultdict(set)
        sites = defaultdict(set)
        for entry in group:
            for f in facilities_of(entry["solution"], "refinery"):
                district = district_of.get(f["site_id"], f["site_id"])
                hits[district].add(entry["slug"])
                sites[district].add(f["site_id"])
        districts = [
            {"district": d, "k": len(slugs), "n": n, "band": band(len(slugs), n), "sites": sorted(sites[d])}
            for d, slugs in sorted(hits.items(), key=lambda kv: (-len(kv[1]), kv[0]))
        ]
        regimes.append({"regime": name, "n": n, "slugs": sorted(e["slug"] for e in group), "districts": districts})
    return {
        "precomputed": True,
        "label": "Precomputed from stored sensitivity runs",
        "runs_considered": sum(r["n"] for r in regimes),
        "regimes": regimes,
    }


def bulungan_cost(solution, sites=BULUNGAN):
    """Annual logistics attributable to the Bulungan sites in one solution.

    Supply legs from the sites, plus each depot's onward haul in proportion to
    the share of its inflow that came from them. SAF legs are not attributed.
    """
    flows = as_dict(solution).get("flows", [])
    supply = [f for f in flows if f.get("leg") == "supply_depot"]
    inflow = defaultdict(float)
    from_sites = defaultdict(float)
    for f in supply:
        inflow[f["to"]] += f["kt"]
        if f["from"] in sites:
            from_sites[f["to"]] += f["kt"]
    supply_usd = sum(f["cost_usd"] for f in supply if f["from"] in sites)
    onward_usd = sum(
        f["cost_usd"] * from_sites[f["from"]] / inflow[f["from"]]
        for f in flows
        if f.get("leg") == "depot_refinery" and inflow.get(f["from"])
    )
    kt = sum(from_sites.values())
    total = supply_usd + onward_usd
    return {
        "sites": list(sites),
        "kt": kt,
        "supply_depot_usd": supply_usd,
        "depot_refinery_usd": onward_usd,
        "logistics_annual_usd": total,
        "usd_per_t": total / (kt * 1000) if kt else None,
        "label": "Attributed share of the base run's annual logistics",
    }


def main():
    parser = argparse.ArgumentParser(description="Print selection frequency from stored runs.")
    parser.add_argument("--bundle", default=str(Path("web") / "data" / "bundle.json"))
    args = parser.parse_args()
    path = Path(args.bundle)
    if not path.exists():
        raise SystemExit(f"{path} not found; run python -m solver.scenarios first")
    bundle = json.loads(path.read_text(encoding="utf-8"))
    rob = bundle.get("robustness")
    if not rob:
        raise SystemExit("bundle has no robustness section; run python -m solver.scenarios")
    print(f"{rob['label']}: {rob['runs_considered']} runs")
    for r in rob["regimes"]:
        print(f"\n{r['regime']}  ({r['n']} runs)")
        for d in r["districts"]:
            print(f"  {d['district']:<24} {d['k']:>2} of {d['n']:<2}  {d['band']:<5} {', '.join(d['sites'])}")
    if b := bundle.get("bulungan"):
        print(f"\nBulungan (base run): {b['kt']:.2f} kt, ${b['logistics_annual_usd'] / 1e6:,.2f}M/yr")


if __name__ == "__main__":
    main()
