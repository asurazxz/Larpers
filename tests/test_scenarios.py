import json
import subprocess
import sys
from pathlib import Path
from types import SimpleNamespace

import pandas as pd
import pytest

from solver import scenarios, sensitivity
from solver.scenarios import BASE, RunSpec, Runner, run_all, tier_specs

ROOT = Path(__file__).resolve().parent.parent


def fake_inputs(data_hash="h1", parameters=None):
    sites = pd.DataFrame({
        "site_id": ["S1", "S2", "S3", "S4", "S5"],
        "district": ["Ketapang", "Ketapang", "Kutai Kartanegara", "Paser", "Ketapang"],
        "kt": [100.0, 100.0, 100.0, 100.0, 100.0],
        "is_candidate": [True, True, True, True, False],
    })
    airports = pd.DataFrame({"iata": ["PNK", "PKN", "BPN", "TRK"], "demand_kt": [300.0] * 4, "demand_share": [0.25] * 4})
    return SimpleNamespace(sites=sites, airports=airports, data_hash=data_hash, parameters=parameters)


def fake_solution(status="optimal", refineries=(("S3", "large"),), depots=(("S1", 300.0), ("S2", 200.0))):
    facilities = [{"site_id": s, "type": "refinery", "size": size, "throughput_kt": 0.0} for s, size in refineries]
    facilities += [{"site_id": s, "type": "depot", "size": "large", "throughput_kt": t} for s, t in depots]
    return {"status": status, "gap": 0.0, "solve_seconds": 1.0, "scenario_hash": "x",
            "facilities": facilities, "flows": []}


def make_runner(tmp_path, resolve_fn=None, audit_fn=None, inputs=None, calls=None):
    calls = [] if calls is None else calls

    def resolve(scenario):
        calls.append(("resolve", scenario))
        return resolve_fn(scenario) if resolve_fn else fake_solution()

    def baseline(scenario):
        calls.append(("baseline", scenario))
        return fake_solution(status="heuristic")

    def audit(scenario, solution):
        return audit_fn(scenario, solution) if audit_fn else {"passed": True, "max_residuals": {}, "failures": []}

    return Runner(out=tmp_path / "bundle.json", inputs=inputs or fake_inputs(), resolve_fn=resolve,
                  baseline_fn=baseline, audit_fn=audit, scenario_fn=dict, clock=lambda: "t", log=lambda *a: None)


def test_tier_order_and_removals_follow_base(tmp_path):
    runner = make_runner(tmp_path)
    run_all(runner, stress=False)
    slugs = [slug for _, _, slug, _ in runner.table]
    tiers = [tier for tier, _, _, _ in runner.table]
    assert slugs[:3] == ["base", "baseline", "earlier_assumptions"]
    assert "no_refinery_S3" in slugs
    assert tiers == sorted(tiers, key=scenarios.TIERS.index)
    assert slugs.index("no_depot_S1") < slugs.index("saf_output")
    assert slugs[-1] == "saf_output"


def test_time_cut_drops_last_tier_only(tmp_path):
    runner = make_runner(tmp_path)
    run_all(runner, tiers=("T1", "T2"), stress=False)
    tiers = {tier for tier, _, _, _ in runner.table}
    assert tiers == {"T1", "T2"}
    assert "saf_output" not in runner.bundle["runs"]


def test_t2_grid_and_district_lost(tmp_path):
    specs = tier_specs("T2", fake_solution(), fake_inputs().sites)
    slugs = [s.slug for s in specs]
    assert sum(s.family == "sensitivity" for s in specs) == 15
    assert "sweep_y2000_rf13" in slugs
    lost = {s.slug: s.overrides["excluded_ids"] for s in specs if s.family == "district_lost"}
    assert lost == {"district_lost_ketapang": ["S1", "S2"], "district_lost_kutai_kartanegara": ["S3"]}
    assert slugs[-1] == "collect_all"


def test_top_depots_split_between_t2_and_t3():
    depots = tuple((f"D{n:02d}", float(100 - n)) for n in range(12))
    base = fake_solution(depots=depots)
    t2 = [s.slug for s in tier_specs("T2", base, fake_inputs().sites) if s.slug.startswith("no_depot")]
    t3 = [s.slug for s in tier_specs("T3", base, fake_inputs().sites) if s.slug.startswith("no_depot")]
    assert t2 == [f"no_depot_D{n:02d}" for n in range(10)]
    assert t3 == ["no_depot_D10", "no_depot_D11"]


def test_failed_audit_is_not_written(tmp_path):
    def audit(scenario, solution):
        ok = scenario.get("yield") != 0.15
        return {"passed": ok, "max_residuals": {}, "failures": [] if ok else ["cost"]}

    runner = make_runner(tmp_path, audit_fn=audit)
    run_all(runner, tiers=("T1",), stress=False)
    stored = json.loads((tmp_path / "bundle.json").read_text())
    assert "earlier_assumptions" not in stored["runs"]
    assert ("T1", "our_assumptions", "earlier_assumptions", "audit_failed") in runner.table
    assert stored["runs"]["base"]["solution"]["validation"]["passed"] is True


def test_infeasible_is_stored(tmp_path):
    runner = make_runner(tmp_path, resolve_fn=lambda s: fake_solution(status="infeasible", refineries=(), depots=()))
    run_all(runner, tiers=("T1",), stress=False)
    stored = json.loads((tmp_path / "bundle.json").read_text())
    assert stored["runs"]["base"]["status"] == "infeasible"
    assert not any(slug.startswith("no_refinery") for slug in stored["runs"])


def test_entry_fields_and_stored_label(tmp_path):
    runner = make_runner(tmp_path)
    runner.run(RunSpec("h5", "horizon", "T1", {"horizon_years": 5}))
    entry = json.loads((tmp_path / "bundle.json").read_text())["runs"]["h5"]
    for key in ("slug", "family", "status", "solved_at", "data_hash", "precomputed"):
        assert key in entry
    assert entry["precomputed"] is True
    assert entry["solution"]["source"] == "stored"
    assert entry["scenario"] == {"horizon_years": 5}


def test_resume_skips_matching_hash_and_reruns_stale(tmp_path):
    calls = []
    run_all(make_runner(tmp_path, calls=calls), tiers=("T1",), stress=False)
    first = len(calls)
    assert first > 0

    calls.clear()
    run_all(make_runner(tmp_path, calls=calls), tiers=("T1",), stress=False)
    assert calls == []

    calls.clear()
    run_all(make_runner(tmp_path, calls=calls, inputs=fake_inputs("h2")), tiers=("T1",), stress=False)
    assert len(calls) == first


def test_stress_counts_and_infeasible_case(tmp_path):
    def resolve(scenario):
        demand = scenario.get("demand_kt") or {}
        if sum(demand.values()) > 3000:
            return {"status": "infeasible", "gap": None, "solve_seconds": 0.2, "facilities": [], "flows": []}
        return {**fake_solution(), "gap": 0.01, "solve_seconds": 3.0}

    runner = make_runner(tmp_path, resolve_fn=resolve)
    summary = runner.stress()
    assert summary["n_random"] == 20
    assert summary["solved"] == 20
    assert summary["worst_solve_seconds"] == 3.0
    assert summary["worst_gap"] == 0.01
    assert summary["infeasible_case_detected"] is True
    assert json.loads((tmp_path / "bundle.json").read_text())["stress"]["solved"] == 20


def test_stress_scenarios_are_seeded():
    args = (2026, ["S1", "S2", "S3", "S4"], {"BPN": 300.0, "PNK": 300.0})
    assert scenarios.stress_scenarios(*args) == scenarios.stress_scenarios(*args)
    assert len(scenarios.stress_scenarios(*args)) == 21


def test_bands():
    assert sensitivity.band(4, 4) == "all"
    assert sensitivity.band(2, 4) == "most"
    assert sensitivity.band(3, 4) == "most"
    assert sensitivity.band(1, 4) == "some"


def test_robustness_regime_first_then_district():
    def entry(slug, refineries, status="optimal"):
        return {"slug": slug, "status": status, "solution": fake_solution(refineries=refineries)}

    entries = [
        entry("a", (("S1", "large"),)),
        entry("b", (("S1", "large"),)),
        entry("c", (("S2", "large"),)),
        entry("d", (("S3", "large"), ("S4", "small"))),
        entry("e", (("S1", "large"),), status="infeasible"),
    ]
    district_of = {"S1": "Ketapang", "S2": "Ketapang", "S3": "Kutai Kartanegara", "S4": "Paser"}
    rob = sensitivity.robustness(entries, district_of)
    assert rob["precomputed"] is True
    assert rob["runs_considered"] == 4
    first, second = rob["regimes"]
    assert (first["regime"], first["n"]) == ("1L", 3)
    assert first["districts"] == [{"district": "Ketapang", "k": 3, "n": 3, "band": "all", "sites": ["S1", "S2"]}]
    assert second["regime"] == "1L+1S"
    assert {d["district"]: d["band"] for d in second["districts"]} == {"Kutai Kartanegara": "all", "Paser": "all"}


def test_robustness_most_and_some_bands():
    def entry(slug, site):
        return {"slug": slug, "status": "optimal", "solution": fake_solution(refineries=((site, "large"),))}

    entries = [entry("a", "S1"), entry("b", "S1"), entry("c", "S3"), entry("d", "S4")]
    district_of = {"S1": "Ketapang", "S3": "Kutai Kartanegara", "S4": "Paser"}
    bands = {d["district"]: d["band"] for d in sensitivity.robustness(entries, district_of)["regimes"][0]["districts"]}
    assert bands == {"Ketapang": "most", "Kutai Kartanegara": "some", "Paser": "some"}


def test_bulungan_cost_attributes_onward_share():
    flows = [
        {"leg": "supply_depot", "from": "KAL_SUP_18", "to": "D", "kt": 50.0, "cost_usd": 10.0},
        {"leg": "supply_depot", "from": "X", "to": "D", "kt": 50.0, "cost_usd": 99.0},
        {"leg": "depot_refinery", "from": "D", "to": "R", "kt": 100.0, "cost_usd": 40.0},
    ]
    b = sensitivity.bulungan_cost({"flows": flows})
    assert b["kt"] == 50.0
    assert b["logistics_annual_usd"] == pytest.approx(30.0)


def test_stub_refuses_output_under_web(tmp_path):
    result = subprocess.run(
        [sys.executable, "-m", "solver.scenarios", "--stub", "--out", str(ROOT / "web" / "data" / "stub.json")],
        cwd=ROOT, capture_output=True, text=True,
    )
    assert result.returncode != 0
    assert "outside web/" in result.stderr


OFFICIAL = {"yield": 0.20, "road_factor": 1.3, "depot_retention": 1.0, "collection_policy": "optional",
            "capacity_basis": "biomass_input", "demand_kt": {a: 300.0 for a in ("PNK", "PKN", "BPN", "TRK")}}


def test_official_base_is_merged_into_every_run(tmp_path):
    runner = make_runner(tmp_path, inputs=fake_inputs(parameters=OFFICIAL))
    run_all(runner, tiers=("T1",), stress=False)
    runs = runner.bundle["runs"]
    assert runs["base"]["scenario"] == scenarios.official_base(OFFICIAL)
    assert runs["base"]["base"] == "official_12_45"
    earlier = runs["earlier_assumptions"]["scenario"]
    assert (earlier["yield"], earlier["road_factor"], earlier["collection_policy"]) == (0.15, 1.9, "all")
    assert runs["no_refinery_S3"]["scenario"]["yield"] == 0.20
    assert runs["no_refinery_S3"]["scenario"]["excluded_ids"] == ["S3"]


def test_stress_runs_on_official_base(tmp_path):
    seen = []

    def resolve(scenario):
        seen.append(scenario)
        return fake_solution()

    runner = make_runner(tmp_path, resolve_fn=resolve, inputs=fake_inputs(parameters=OFFICIAL))
    runner.stress()
    assert len(seen) == 21
    assert all(s["depot_retention"] == 1.0 for s in seen)
    assert seen[-1]["demand_kt"] == {a: 1000.0 for a in ("PNK", "PKN", "BPN", "TRK")}
