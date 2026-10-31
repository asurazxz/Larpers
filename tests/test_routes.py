"""OSRM route geometry for the map: display only, fetched once into data/reference/ and built into web/data/."""
import json
from pathlib import Path

import pytest

from solver.contract import NODE_IDS

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data" / "reference" / "osrm_routes.json"
WEB = ROOT / "web" / "data" / "routes.json"
LAT, LON = (-5.0, 7.5), (108.0, 120.0)  # Borneo: northern routes may cross Sabah or Brunei


@pytest.fixture(scope="module")
def source():
    return json.loads(SOURCE.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def web():
    return json.loads(WEB.read_text(encoding="utf-8"))


def test_source_records_its_profile_and_server(source):
    assert source["profile"] == "car"
    assert source["osrm_url"].startswith("http")
    assert source["routes"]


def test_keys_are_ordered_node_pairs_and_never_touch_tarakan(source, web):
    for key in [*source["routes"], *web]:
        a, b = key.split("|")
        assert a in NODE_IDS and b in NODE_IDS
        assert a < b
        assert "TRK" not in (a, b)


def test_web_routes_are_the_source_routes(source, web):
    assert set(web) == set(source["routes"])


def test_every_point_is_in_borneo(web):
    for key, points in web.items():
        assert len(points) >= 2, key
        for lat, lon in points:
            assert LAT[0] <= lat <= LAT[1] and LON[0] <= lon <= LON[1], key


def test_source_distances_match_the_reference_table(source):
    table = json.loads((ROOT / "data" / "reference" / "osrm_table_84.json").read_text(encoding="utf-8"))
    at = {node: i for i, node in enumerate(table["ids"])}
    distances = table["osrm"]["distances"]
    for key, route in source["routes"].items():
        a, b = key.split("|")
        assert route["distance_m"] == pytest.approx(distances[at[a]][at[b]], rel=0.05, abs=500), key
