"""Refinery candidate shortlists. Constants at import; numpy and solver inputs load only inside functions.

SHORTLIST is frozen for the organisers' official parameters: yield 0.20, road factor 1.3, optional collection,
biomass-intake capacity, 300 kt demand at each of the four airports, annualised cost with size-dependent variable OpEx.

Method. The union of:
- production-weighted k-means over all 80 supply points, k=12 and k=20, seed 20261031, each centre snapped to its
  nearest member of the 69 onshore sites plus PNK, PKN, BPN;
- every refinery site in an incumbent from the earlier runs on the 28-candidate prototype list, for mixes 6L, 5L+2S,
  4L+4S, 7L, 3L+6S, 6L+1S and the mix-free model, all under these parameters;
- the six sites of a slightly cheaper plan found by a vetter: KAL_SUP_41, 71, 65, 46, 44, 24;
- PNK, PKN, BPN.
That union has 33 sites and did not prove within 85 s on 7 threads, so it was trimmed. Every incumbent site and the
three airports were kept. Of the 14 k-means-only sites, only KAL_SUP_59 was kept, as the only South Kalimantan site on
the list. The other 13 are in TRIMMED: six sit within 22 km of a kept site, seven are 40 to 62 km from one. They were
dropped for solve time and are not proven worse.

Disclosure. This list contains incumbents of the scenario it is measured on, and the k-means half ignores road factor,
so it is not a neutral sample. "Optimal among N candidates" is a claim about these N sites only, not about the 72
eligible sites. TRK is excluded because Tarakan is an island that trucks cannot reach. Sea sites are never eligible.

Measured on these 20 at road factor 1.3 with the depots open to all 69 onshore sites, 7 threads, 85 s limit: 6L proved
at $894.46M, gap 0, 42.6 s; 5L+2S proved at $908.93M, gap 0, 30.2 s. Root LP bounds put the other 55 capacity-feasible
mixes of up to 14 refineries above $894.46M, the closest at $922.14M.
"""
from __future__ import annotations

PROTOTYPE_SHORTLIST = tuple(
    f"KAL_SUP_{n}"
    for n in ("02", "06", "07", "13", "15", "16", "24", "25", "28", "33", "35", "38", "41", "42", "44", "45", "48",
              "49", "51", "54", "59", "64", "70", "71", "77")
) + ("PNK", "PKN", "BPN", "TRK")

SHORTLIST = tuple(
    f"KAL_SUP_{n}"
    for n in ("13", "16", "24", "25", "28", "38", "41", "44", "46", "48", "49", "51", "54", "59", "65", "70", "71")
) + ("PNK", "PKN", "BPN")

TRIMMED = tuple(
    f"KAL_SUP_{n}" for n in ("01", "09", "21", "27", "29", "40", "42", "52", "53", "55", "67", "72", "79")
)

SEED = 20261031
KS = (12, 20)
RESTARTS = 64
MAX_ITERATIONS = 200
EXCLUDED_AIRPORTS = ("TRK",)


def _project(lat, lon, reference_lat: float):
    """Equirectangular km about a reference latitude."""
    import math

    import numpy as np

    lat, lon = np.asarray(lat, float), np.asarray(lon, float)
    return 6371.0088 * np.column_stack((np.radians(lon) * math.cos(math.radians(reference_lat)), np.radians(lat)))


def _squared_km(points, centres):
    return ((points[:, None] - centres[None]) ** 2).sum(axis=2)


def weighted_kmeans(points, weight, k: int, seed: int = SEED):
    """Lloyd's algorithm from weighted k-means++ starts. Returns the centres of the lowest-inertia restart."""
    import math

    import numpy as np

    rng = np.random.default_rng(seed)
    best_inertia, best_centres = math.inf, None
    for _ in range(RESTARTS):
        centres = points[[rng.choice(len(points), p=weight / weight.sum())]]
        while len(centres) < k:
            pull = weight * _squared_km(points, centres).min(axis=1)
            centres = np.vstack((centres, points[rng.choice(len(points), p=pull / pull.sum())]))
        for _ in range(MAX_ITERATIONS):
            nearest = _squared_km(points, centres).argmin(axis=1)
            moved = centres.copy()
            for c in range(k):
                members = nearest == c
                if members.any():
                    moved[c] = np.average(points[members], axis=0, weights=weight[members])
            if np.array_equal(moved, centres):
                break
            centres = moved
        inertia = float((weight * _squared_km(points, centres).min(axis=1)).sum())
        if inertia < best_inertia:
            best_inertia, best_centres = inertia, centres
    return best_centres


def _kmeans_picks(inputs, pool: list[str], k: int) -> list[str]:
    """Cluster all 80 supply points, sea sites included, and snap each centre to its nearest member of `pool`."""
    import numpy as np

    sites, airports = inputs.sites, inputs.airports
    weight = sites.kt.to_numpy(float)
    lat = dict(zip(sites.site_id, sites.lat)) | dict(zip(airports.iata, airports.lat))
    lon = dict(zip(sites.site_id, sites.lon)) | dict(zip(airports.iata, airports.lon))
    reference_lat = float(np.average(sites.lat, weights=weight))
    centres = weighted_kmeans(_project(sites.lat, sites.lon, reference_lat), weight, k)
    pool_xy = _project([lat[n] for n in pool], [lon[n] for n in pool], reference_lat)
    return list(dict.fromkeys(pool[i] for i in _squared_km(centres, pool_xy).argmin(axis=1)))


def rebuild() -> dict[int, list[str]]:
    """Repeat the k-means half of the method and check each pick is in SHORTLIST or TRIMMED. Runs no MILP."""
    from solver.inputs import load_inputs

    inputs = load_inputs()
    pool = inputs.sites.site_id[inputs.sites.is_candidate].tolist()
    pool += [a for a in inputs.airports.iata.tolist() if a not in EXCLUDED_AIRPORTS]
    picks = {k: _kmeans_picks(inputs, pool, k) for k in KS}
    for k, chosen in picks.items():
        unknown = sorted(set(chosen) - set(SHORTLIST) - set(TRIMMED))
        print(f"k={k}: {len(chosen)} distinct: {' '.join(chosen)}; outside SHORTLIST and TRIMMED: {unknown}")
    return picks


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="Print the frozen refinery candidate list.")
    parser.add_argument("--rebuild", action="store_true", help="repeat the k-means step, no MILP")
    if parser.parse_args().rebuild:
        rebuild()
        return

    from solver.inputs import load_inputs

    inputs = load_inputs()
    sea = sorted(set(SHORTLIST) & set(inputs.sites.site_id[~inputs.sites.is_candidate]))
    airports = [a for a in inputs.airports.iata.tolist() if a in SHORTLIST]
    print(f"N         {len(SHORTLIST)}")
    print(f"ids       {' '.join(SHORTLIST)}")
    print(f"sea sites {len(sea)} {' '.join(sea)}".rstrip())
    print(f"airports  {len(airports)} {' '.join(airports)}")


if __name__ == "__main__":
    main()
