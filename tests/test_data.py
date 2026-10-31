import importlib.util
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parent.parent
_spec = importlib.util.spec_from_file_location("prepare", ROOT / "data" / "prepare.py")
prepare = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(prepare)

SEA = {f"KAL_SUP_{n:02d}" for n in (3, 22, 31, 32, 37, 43, 50, 58, 62, 69, 80)}


@pytest.fixture(scope="module")
def sites():
    return prepare.load_sites()


@pytest.fixture(scope="module")
def airports():
    return prepare.load_airports()


def _hav(lat1, lon1, lat2, lon2):
    return prepare.haversine_matrix([lat1, lat2], [lon1, lon2])[0, 1]


def test_eighty_unique_sites(sites):
    assert len(sites) == 80
    assert sites["site_id"].is_unique


def test_total_6800_kt(sites):
    assert round(sites["kt"].sum(), 6) == 6800.0


def test_kt_times_1000_is_tonnes(sites):
    assert np.allclose(sites["kt"] * 1000, sites["tonnes"])


def test_four_airports_inside_kalimantan(airports):
    assert sorted(airports["iata"]) == ["BPN", "PKN", "PNK", "TRK"]
    assert airports["lat"].between(-5, 8).all()
    assert airports["lon"].between(108, 120).all()
    assert "BTJ" not in set(airports["iata"])


def test_demand_shares_sum_to_one(airports):
    assert airports["demand_share"].sum() == pytest.approx(1.0)


def test_official_demand_300_kt_per_airport(airports):
    assert dict(zip(airports["iata"], airports["demand_kt"])) == {a: 300.0 for a in ["PNK", "PKN", "BPN", "TRK"]}
    assert airports["demand_kt"].sum() == 1200.0


def test_official_parameters():
    p = prepare.load_parameters()
    assert (p["yield"], p["road_factor"], p["capex_years"], p["fixed_opex_rate"]) == (0.20, 1.3, 20, 0.05)
    assert p["capacity_basis"] == "biomass_input"
    assert p["collection_policy"] == "optional"
    by = {(f["facility"], f["size"]): f for f in p["facilities"]}
    assert by[("refinery", "large")]["capacity_kt_biomass_in"] == 1087.0
    assert by[("refinery", "small")]["variable_opex_usd_per_t_in"] == 60.0
    assert by[("refinery", "large")]["variable_opex_usd_per_t_in"] == 55.0
    assert by[("depot", "small")]["variable_opex_usd_per_t_in"] == 5.0
    assert by[("depot", "large")]["variable_opex_usd_per_t_in"] == 4.0
    assert by[("refinery", "large")]["annualised_capex_usd_per_year"] == 765e6 / 20
    rates = {t["leg"]: t["usd_per_t_km"] for t in p["transport"]}
    assert rates == {"supply_depot": 0.10, "depot_refinery": 0.12, "refinery_airport": 0.08}
    # 1,200 kt SAF at 20% needs 6,000 kt biomass, within the 6,800 kt supply.
    assert sum(p["demand_kt"].values()) / p["yield"] == pytest.approx(6000.0)


def test_exactly_69_onshore(sites):
    assert int(sites["is_onshore"].sum()) == 69
    assert (sites["is_candidate"] == sites["is_onshore"]).all()


def test_sea_sites_are_the_known_eleven(sites):
    sea = set(sites.loc[~sites["is_onshore"], "site_id"])
    assert sea == SEA
    assert (sites.loc[sites["site_id"].isin(SEA), "data_flag"] == "offshore").all()
    assert (sites.loc[~sites["site_id"].isin(SEA), "data_flag"] == "ok").all()


def test_north_kalimantan_distances(sites, airports):
    w = sites["kt"]
    c_lat = (sites["lat"] * w).sum() / w.sum()
    c_lon = (sites["lon"] * w).sum() / w.sum()
    trk = airports.set_index("iata").loc["TRK"]
    expected = {"KAL_SUP_18": (681, 88), "KAL_SUP_70": (706, 57)}
    by_id = sites.set_index("site_id")
    for site_id, (to_centroid, to_trk) in expected.items():
        s = by_id.loc[site_id]
        assert round(_hav(s["lat"], s["lon"], c_lat, c_lon)) == to_centroid
        assert round(_hav(s["lat"], s["lon"], trk["lat"], trk["lon"])) == to_trk


def test_north_kalimantan_far_from_other_sites(sites):
    hav = prepare.haversine_matrix(sites["lat"], sites["lon"])
    ids = list(sites["site_id"])
    north = [ids.index("KAL_SUP_18"), ids.index("KAL_SUP_70")]
    others = [i for i in range(len(ids)) if i not in north]
    assert round(hav[np.ix_(north, others)].min()) >= 304


def test_iskandar_name_filter_fails():
    raw = prepare.read_airports_dat()
    hits = raw[raw["name"].str.contains("Iskandar", case=False)]
    assert set(hits["iata"]) == {"BTJ", "PKN"}


def test_airports_dat_reads_null_as_nan():
    raw = prepare.read_airports_dat()
    assert raw["iata"].map(type).eq(str).sum() + raw["iata"].isna().sum() == len(raw)
    assert not (raw["iata"] == "\\N").any()


def test_bad_total_rejected(tmp_path):
    df = pd.read_csv(prepare.SITES_CSV)
    df.loc[0, "production_kilotons"] += 1
    df.loc[0, "production_tonnes"] += 1000
    bad = tmp_path / "sites.csv"
    df.to_csv(bad, index=False)
    with pytest.raises(prepare.DataError):
        prepare.load_sites(bad)


def test_duplicate_id_rejected(tmp_path):
    df = pd.read_csv(prepare.SITES_CSV)
    df.loc[1, "location_id"] = df.loc[0, "location_id"]
    bad = tmp_path / "sites.csv"
    df.to_csv(bad, index=False)
    with pytest.raises(prepare.DataError):
        prepare.load_sites(bad)


def test_processed_inputs_load():
    from solver.inputs import load_inputs

    if not (prepare.PROCESSED / "hashes.json").exists():
        prepare.prepare()
    i = load_inputs()
    assert i.is_candidate.sum() == 69
    assert i.road_km.shape == (84, 84)
    assert i.hav_km.shape == (84, 84)
    assert list(i.node_ids[-4:]) == ["PNK", "PKN", "BPN", "TRK"]
    assert len(i.data_hash) == 64
    assert i.parameters["yield"] == 0.20


def test_load_inputs_names_prepare_when_missing(tmp_path):
    from solver.inputs import load_inputs

    with pytest.raises(FileNotFoundError, match="data/prepare.py"):
        load_inputs(tmp_path)
