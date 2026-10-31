"""Load the processed data that data/prepare.py writes.

Reads data/processed/ only. No circuity is applied here: road_km is OSRM
road distance, hav_km is straight-line. The solver applies any road factor.
"""

import json
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import pandas as pd

PROCESSED = Path(__file__).resolve().parent.parent / "data" / "processed"
REQUIRED = ("distances.npz", "sites.parquet", "airports.parquet", "parameters.json", "hashes.json")


@dataclass(frozen=True)
class Inputs:
    sites: pd.DataFrame      # site_id, province, district, label, kt, tonnes, lat, lon, is_onshore, is_candidate, data_flag
    airports: pd.DataFrame   # iata, name, city, lat, lon, demand_kt (official 300), demand_share (earlier split)
    node_ids: np.ndarray     # 80 site ids then PNK, PKN, BPN, TRK
    hav_km: np.ndarray       # (84, 84) straight-line km
    road_km: np.ndarray      # (84, 84) OSRM road km, offshore snap included; reference only
    is_candidate: np.ndarray  # (80,) bool, onshore sites only
    data_hash: str
    # Official 12:45 parameters: yield, road_factor, demand_kt, facilities (capex, capacity, fixed and
    # variable OpEx), transport rates, capex_years, fixed_opex_rate. See data/prepare.py load_parameters.
    parameters: dict = field(default_factory=dict)

    def index(self, node_id):
        return int(np.flatnonzero(self.node_ids == node_id)[0])


def load_inputs(processed_dir=PROCESSED) -> Inputs:
    processed_dir = Path(processed_dir)
    missing = [name for name in REQUIRED if not (processed_dir / name).exists()]
    if missing:
        raise FileNotFoundError(
            f"missing {', '.join(missing)} in {processed_dir}; run python data/prepare.py first"
        )
    with np.load(processed_dir / "distances.npz", allow_pickle=False) as npz:
        node_ids = npz["node_ids"]
        hav_km = npz["hav_km"]
        road_km = npz["road_km"]
    sites = pd.read_parquet(processed_dir / "sites.parquet")
    airports = pd.read_parquet(processed_dir / "airports.parquet")
    hashes = json.loads((processed_dir / "hashes.json").read_text(encoding="utf-8"))
    parameters = json.loads((processed_dir / "parameters.json").read_text(encoding="utf-8"))

    expected = list(sites["site_id"]) + list(airports["iata"])
    if list(node_ids) != expected:
        raise ValueError("node_ids do not match sites then airports; rerun python data/prepare.py")

    for arr in (node_ids, hav_km, road_km):
        arr.setflags(write=False)
    is_candidate = sites["is_candidate"].to_numpy(dtype=bool)
    is_candidate.setflags(write=False)
    return Inputs(
        sites=sites,
        airports=airports,
        node_ids=node_ids,
        hav_km=hav_km,
        road_km=road_km,
        is_candidate=is_candidate,
        data_hash=hashes["data_hash"],
        parameters=parameters,
    )
