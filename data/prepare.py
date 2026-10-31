"""Validate data/raw and write data/processed/ for the solver.

Run from the repo root: python data/prepare.py
Offline only: reads data/raw/ and data/reference/, never calls OSRM.
"""

import hashlib
import json
import shutil
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

import numpy as np
import pandas as pd
from global_land_mask import globe

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
REFERENCE = ROOT / "data" / "reference"
PROCESSED = ROOT / "data" / "processed"

SITES_CSV = RAW / "kalimantan_80_locations_6800kt_full_range.csv"
AIRPORTS_DAT = RAW / "airports.dat"
# Organisers' 12:45 update: official demand and parameters, which outrank our assumptions.
AIRPORTS_CSV = RAW / "challenge3_airports_4.csv"
PARAMETERS_XLSX = RAW / "challenge3_parameters.xlsx"
OSRM_JSON = REFERENCE / "osrm_table_84.json"
PROTOTYPE_OSRM = ROOT / "prototype" / "osrm_table_84.json"

EARTH_RADIUS_KM = 6371.0088
TOTAL_KT = 6800.0
N_SITES = 80
IATA = ["PNK", "PKN", "BPN", "TRK"]
OFFICIAL_DEMAND_KT = 300.0
OFFICIAL_YIELD = 0.20
OFFICIAL_ROAD_FACTOR = 1.3
CAPEX_YEARS = 20
FIXED_OPEX_RATE = 0.05
# Earlier production-derived split, kept as demand_share because the solver uses it when a scenario
# leaves demand_kt null. The official demand is the separate demand_kt column (300 kt each).
EARLIER_DEMAND_SHARE = {"BPN": 0.558, "PNK": 0.317, "TRK": 0.075, "PKN": 0.050}
XLSX_NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
LAT_RANGE = (-5.0, 8.0)
LON_RANGE = (108.0, 120.0)
# Sites that plot in the sea off Ketapang (GLOBE 1 km mask, docs/proposals/geospatial-data.md).
SEA_SITES = {f"KAL_SUP_{n:02d}" for n in (3, 22, 31, 32, 37, 43, 50, 58, 62, 69, 80)}

AIRPORT_COLUMNS = [
    "airport_id", "name", "city", "country", "iata", "icao", "lat", "lon",
    "altitude_ft", "utc_offset", "dst", "tz", "type", "source",
]


class DataError(ValueError):
    """Raw data failed validation."""


def read_airports_dat(path=AIRPORTS_DAT):
    return pd.read_csv(
        path,
        header=None,
        names=AIRPORT_COLUMNS,
        dtype=str,
        keep_default_na=False,
        na_values=["\\N"],
    )


def load_sites(path=SITES_CSV):
    df = pd.read_csv(path, dtype={"location_id": str})
    if len(df) != N_SITES:
        raise DataError(f"expected {N_SITES} sites, got {len(df)}")
    if not df["location_id"].is_unique:
        raise DataError("site ids are not unique")
    if round(df["production_kilotons"].sum(), 6) != TOTAL_KT:
        raise DataError(f"total supply {df['production_kilotons'].sum()} kt, expected {TOTAL_KT}")
    if not np.allclose(df["production_kilotons"] * 1000, df["production_tonnes"]):
        raise DataError("production_kilotons x 1000 != production_tonnes")
    if df[["latitude", "longitude"]].isna().any().any():
        raise DataError("site coordinates missing")
    sites = pd.DataFrame({
        "site_id": df["location_id"],
        "province": df["province"],
        "district": df["district"],
        "label": df["location_id"] + " " + df["district"],
        "kt": df["production_kilotons"].astype(float),
        "tonnes": df["production_tonnes"].astype(float),
        "lat": df["latitude"].astype(float).round(4),
        "lon": df["longitude"].astype(float).round(4),
    })
    sites["is_onshore"] = [bool(globe.is_land(la, lo)) for la, lo in zip(sites["lat"], sites["lon"])]
    sea = set(sites.loc[~sites["is_onshore"], "site_id"])
    if sea != SEA_SITES:
        raise DataError(
            f"land mask disagrees with the 11 known sea sites: "
            f"extra {sorted(sea - SEA_SITES)}, missing {sorted(SEA_SITES - sea)}"
        )
    sites["is_candidate"] = sites["is_onshore"]
    sites["data_flag"] = np.where(sites["is_onshore"], "ok", "offshore")
    return sites


def load_official_demand(path=AIRPORTS_CSV):
    """Official SAF demand per airport (kt/yr), from the organisers' 12:45 update."""
    df = pd.read_csv(path, dtype={"iata": str, "icao": str}, keep_default_na=False)
    if sorted(df["iata"]) != sorted(IATA):
        raise DataError(f"official airports file lists {sorted(df['iata'])}, expected {sorted(IATA)}")
    demand = dict(zip(df["iata"], df["saf_demand_kt_per_year"].astype(float)))
    if any(v != OFFICIAL_DEMAND_KT for v in demand.values()):
        raise DataError(f"official demand changed: {demand}")
    coords = {r.iata: (float(r.latitude), float(r.longitude)) for r in df.itertuples()}
    return demand, coords


def load_airports(path=AIRPORTS_DAT, official_path=AIRPORTS_CSV):
    raw = read_airports_dat(path)
    rows = []
    for code in IATA:
        match = raw[raw["iata"] == code]
        if len(match) != 1:
            raise DataError(f"expected one airport with IATA {code}, got {len(match)}")
        rows.append(match.iloc[0])
    airports = pd.DataFrame({
        "iata": [r["iata"] for r in rows],
        "name": [r["name"] for r in rows],
        "city": [r["city"] for r in rows],
        "lat": [round(float(r["lat"]), 4) for r in rows],
        "lon": [round(float(r["lon"]), 4) for r in rows],
    })
    demand, coords = load_official_demand(official_path)
    for r in airports.itertuples():
        lat, lon = coords[r.iata]
        if abs(lat - r.lat) > 1e-4 or abs(lon - r.lon) > 1e-4:
            raise DataError(f"{r.iata} coordinates differ between airports.dat and the official file")
    airports["demand_kt"] = airports["iata"].map(demand)
    airports["demand_share"] = airports["iata"].map(EARLIER_DEMAND_SHARE)
    inside = airports["lat"].between(*LAT_RANGE) & airports["lon"].between(*LON_RANGE)
    if not inside.all():
        raise DataError(f"airports outside Kalimantan: {list(airports.loc[~inside, 'iata'])}")
    return airports


def read_xlsx(path):
    """Sheets as lists of rows of strings. Standard library only: openpyxl is not a dependency."""
    with zipfile.ZipFile(path) as z:
        shared = []
        if "xl/sharedStrings.xml" in z.namelist():
            for si in ET.fromstring(z.read("xl/sharedStrings.xml")).iter(f"{XLSX_NS}si"):
                shared.append("".join(t.text or "" for t in si.iter(f"{XLSX_NS}t")))
        sheets = [s.get("name") for s in ET.fromstring(z.read("xl/workbook.xml")).iter(f"{XLSX_NS}sheet")]
        out = {}
        for i, name in enumerate(sheets, 1):
            rows = []
            for row in ET.fromstring(z.read(f"xl/worksheets/sheet{i}.xml")).iter(f"{XLSX_NS}row"):
                vals = []
                for c in row.iter(f"{XLSX_NS}c"):
                    v = c.find(f"{XLSX_NS}v")
                    if c.get("t") == "s" and v is not None:
                        vals.append(shared[int(v.text)])
                    elif c.get("t") == "inlineStr":
                        vals.append("".join(t.text or "" for t in c.iter(f"{XLSX_NS}t")))
                    else:
                        vals.append(v.text if v is not None else "")
                rows.append(vals)
            out[name] = rows
    return out


def _table(rows, header_first):
    """Rows after the header row whose first cell is header_first, as dicts."""
    start = next(i for i, r in enumerate(rows) if r and r[0] == header_first)
    header = rows[start]
    return [dict(zip(header, r)) for r in rows[start + 1:] if r and r[0]]


def load_parameters(path=PARAMETERS_XLSX):
    """Official cost table, transport rates and assumptions from the organisers' workbook."""
    book = read_xlsx(path)
    facilities = [
        {
            "facility": r["facility"].lower(),
            "size": r["size"].lower(),
            "capex_usd": float(r["capex_usd"]),
            "capacity_kt_biomass_in": float(r["capacity_kt_biomass_in_per_year"]),
            "fixed_opex_usd_per_year": float(r["fixed_opex_usd_per_year"]),
            "variable_opex_usd_per_t_in": float(r["variable_opex_usd_per_tonne_in"]),
            "annualised_capex_usd_per_year": float(r["annualised_capex_usd_per_year"]),
        }
        for r in _table(book["facilities"], "facility")
    ]
    legs = {"Farm to depot": "supply_depot", "Depot to refinery": "depot_refinery",
            "Refinery to airport": "refinery_airport"}
    transport = [
        {
            "leg": legs[r["leg"]],
            "cargo": r["cargo"],
            "usd_per_t_km": float(r["cost_usd_per_tonne_km"]),
            "small_truck_t": float(r["small_truck_t"]),
            "large_truck_t": float(r["large_truck_t"]),
        }
        for r in _table(book["transport"], "leg")
    ]
    assumptions = {r["parameter"]: r["value"] for r in _table(book["assumptions"], "parameter")}

    expected_capex = {("depot", "small"): 2.25e6, ("depot", "large"): 4.5e6,
                      ("refinery", "small"): 480e6, ("refinery", "large"): 765e6}
    got = {(f["facility"], f["size"]): f["capex_usd"] for f in facilities}
    if got != expected_capex:
        raise DataError(f"official CapEx differs from the Airbus PDF: {got}")
    for f in facilities:
        if abs(f["annualised_capex_usd_per_year"] - f["capex_usd"] / CAPEX_YEARS) > 0.01:
            raise DataError(f"annualised CapEx is not CapEx/{CAPEX_YEARS} for {f['facility']} {f['size']}")
        if abs(f["fixed_opex_usd_per_year"] - FIXED_OPEX_RATE * f["capex_usd"]) > 0.01:
            raise DataError(f"fixed OpEx is not {FIXED_OPEX_RATE:.0%} of CapEx for {f['facility']} {f['size']}")
    rates = {t["leg"]: t["usd_per_t_km"] for t in transport}
    if rates != {"supply_depot": 0.10, "depot_refinery": 0.12, "refinery_airport": 0.08}:
        raise DataError(f"official transport rates differ from the Airbus PDF: {rates}")
    return {
        "source": "data/raw/challenge3_parameters.xlsx (organisers' update, 31 Oct 2026 12:45)",
        "yield": OFFICIAL_YIELD,
        "road_factor": OFFICIAL_ROAD_FACTOR,
        "depot_retention": 1.0,
        "capex_years": CAPEX_YEARS,
        "fixed_opex_rate": FIXED_OPEX_RATE,
        "capacity_basis": "biomass_input",
        "collection_policy": "optional",
        "demand_kt": {code: OFFICIAL_DEMAND_KT for code in IATA},
        "facilities": facilities,
        "transport": transport,
        "assumptions": assumptions,
    }


def haversine_matrix(lat, lon):
    lat = np.radians(np.asarray(lat, dtype=float))
    lon = np.radians(np.asarray(lon, dtype=float))
    dlat = lat[:, None] - lat[None, :]
    dlon = lon[:, None] - lon[None, :]
    h = np.sin(dlat / 2) ** 2 + np.cos(lat[:, None]) * np.cos(lat[None, :]) * np.sin(dlon / 2) ** 2
    return 2 * EARTH_RADIUS_KM * np.arcsin(np.sqrt(np.clip(h, 0.0, 1.0)))


def copy_reference():
    REFERENCE.mkdir(parents=True, exist_ok=True)
    if not OSRM_JSON.exists():
        shutil.copyfile(PROTOTYPE_OSRM, OSRM_JSON)
    credit = REFERENCE / "CREDIT.txt"
    if not credit.exists():
        credit.write_text("© OpenStreetMap contributors\n", encoding="utf-8")


def road_matrix(osrm, node_ids, offshore):
    """OSRM metres to km, plus the snap distance at each offshore end."""
    table = osrm["osrm"]
    if table.get("code") != "Ok":
        raise DataError(f"OSRM table code {table.get('code')}")
    dist = np.array(table["distances"], dtype=float)
    n = len(node_ids)
    if dist.shape != (n, n) or np.isnan(dist).any():
        raise DataError(f"OSRM distances shape {dist.shape} or missing values")
    snap = np.array([s["distance"] for s in table["sources"]], dtype=float) / 1000
    road = dist / 1000
    off = np.asarray(offshore, dtype=bool)
    road = road + np.where(off, snap, 0.0)[:, None] + np.where(off, snap, 0.0)[None, :]
    np.fill_diagonal(road, 0.0)
    return road


def sha256_file(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def sha256_array(arr):
    arr = np.ascontiguousarray(arr)
    h = hashlib.sha256()
    h.update(str(arr.dtype).encode())
    h.update(str(arr.shape).encode())
    h.update(arr.tobytes())
    return h.hexdigest()


def prepare():
    copy_reference()
    sites = load_sites()
    airports = load_airports()
    parameters = load_parameters()

    osrm = json.loads(OSRM_JSON.read_text(encoding="utf-8"))
    node_ids = np.array(list(sites["site_id"]) + list(airports["iata"]), dtype=str)
    if list(node_ids) != list(osrm["ids"]):
        raise DataError("node_ids do not match OSRM ids")

    lat = np.concatenate([sites["lat"].to_numpy(), airports["lat"].to_numpy()])
    lon = np.concatenate([sites["lon"].to_numpy(), airports["lon"].to_numpy()])
    hav_km = haversine_matrix(lat, lon).round(2)
    offshore = np.concatenate([~sites["is_onshore"].to_numpy(), np.zeros(len(airports), dtype=bool)])
    road_km = road_matrix(osrm, node_ids, offshore)

    PROCESSED.mkdir(parents=True, exist_ok=True)
    np.savez(PROCESSED / "distances.npz", node_ids=node_ids, hav_km=hav_km, road_km=road_km)
    sites.to_parquet(PROCESSED / "sites.parquet", index=False)
    airports.to_parquet(PROCESSED / "airports.parquet", index=False)
    (PROCESSED / "parameters.json").write_text(json.dumps(parameters, indent=2) + "\n", encoding="utf-8")

    raw_hashes = {
        str(p.relative_to(ROOT).as_posix()): sha256_file(p)
        for p in (SITES_CSV, AIRPORTS_DAT, AIRPORTS_CSV, PARAMETERS_XLSX, OSRM_JSON)
    }
    array_hashes = {
        "node_ids": sha256_array(node_ids),
        "hav_km": sha256_array(hav_km),
        "road_km": sha256_array(road_km),
    }
    combined = hashlib.sha256()
    for key in sorted(raw_hashes):
        combined.update(f"{key}={raw_hashes[key]}\n".encode())
    for key in sorted(array_hashes):
        combined.update(f"{key}={array_hashes[key]}\n".encode())
    hashes = {"raw": raw_hashes, "arrays": array_hashes, "data_hash": combined.hexdigest()}
    (PROCESSED / "hashes.json").write_text(json.dumps(hashes, indent=2) + "\n", encoding="utf-8")

    print(f"sites: {len(sites)} ({int(sites['is_candidate'].sum())} candidates), "
          f"{sites['kt'].sum():.2f} kt")
    print(f"airports: {', '.join(f'{a} {d:g} kt' for a, d in zip(airports['iata'], airports['demand_kt']))}")
    print(f"official: yield {parameters['yield']}, road factor {parameters['road_factor']}, "
          f"capacity {parameters['capacity_basis']}, collection {parameters['collection_policy']}")
    print(f"data_hash: {hashes['data_hash']}")
    return hashes


if __name__ == "__main__":
    prepare()
