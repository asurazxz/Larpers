"""Backend settings the organisers did not fix. Defaults must reproduce the base case exactly."""
import hashlib
import json

import pytest

from solver.audit import audit
from solver.baseline import baseline
from solver.contract import HAUL_HAV_KM, Scenario
from solver.model import build_problem, precheck, resolve, worker_plan
from test_model import A, B, C, RATE, demand, line, official, tiny


def rows(solution, kind):
    return [f for f in solution.facilities if f.type == kind]


def test_defaults_keep_the_base_case():
    scenario = Scenario()
    assert scenario.haul_limit_km == HAUL_HAV_KM
    assert scenario.refinery_candidates is None
    assert scenario.depot_candidates is None


def test_default_scenarios_keep_their_hash_so_stored_runs_stay_valid():
    payload = Scenario().model_dump(mode="json", by_alias=True)
    for field in ("haul_limit_km", "refinery_candidates", "depot_candidates"):
        payload.pop(field)
    blob = json.dumps(payload, sort_keys=True, separators=(",", ":"), allow_nan=False)
    assert Scenario().scenario_hash() == hashlib.sha256(blob.encode()).hexdigest()


@pytest.mark.parametrize("change", [{"haul_limit_km": 300.0}, {"refinery_candidates": ["BPN"]},
                                    {"depot_candidates": ["KAL_SUP_01"]}])
def test_a_changed_setting_changes_the_hash(change):
    assert Scenario(**change).scenario_hash() != Scenario().scenario_hash()


def test_haul_limit_decides_which_arcs_exist():
    inputs = line([60.0, 60.0], spacing=100.0)
    near = build_problem(official(haul_limit_km=50.0), inputs, [B], RATE)
    far = build_problem(official(haul_limit_km=150.0), inputs, [B], RATE)
    assert (A, B) not in near.supply_km
    assert (A, B) in far.supply_km


def test_tight_haul_limit_is_refused_with_the_limit_in_the_reason():
    scenario = official(demand_kt=demand(BPN=8.0), collection_policy="all", haul_limit_km=50.0, excluded_ids=[A])
    reason = precheck(scenario, line([60.0, 60.0], spacing=100.0), candidates=[B])
    assert "50.0 km" in reason


def test_longer_haul_limit_solves_and_passes_the_audit():
    inputs = line([60.0, 60.0], spacing=300.0)
    scenario = official(demand_kt=demand(BPN=20.0), haul_limit_km=400.0, excluded_ids=[A])
    solution = resolve(scenario, inputs=inputs, candidates=[B])
    assert solution.status == "optimal"
    assert audit(scenario, solution, inputs=inputs).passed


def test_audit_applies_the_scenario_haul_limit():
    inputs = line([60.0, 60.0], spacing=300.0)
    wide = official(demand_kt=demand(BPN=20.0), haul_limit_km=400.0, excluded_ids=[A])
    solution = resolve(wide, inputs=inputs, candidates=[B])
    report = audit(wide.model_copy(update={"haul_limit_km": 100.0}), solution, inputs=inputs)
    assert any(f.startswith("haul_limit:") for f in report.failures)


def test_refinery_candidates_limit_where_refineries_open():
    inputs = line([120.0, 80.0, 90.0])
    scenario = official(demand_kt=demand(BPN=20.0), refinery_candidates=[C])
    solution = resolve(scenario, inputs=inputs)
    assert solution.n_candidates == 1
    assert [f.site_id for f in rows(solution, "refinery")] == [C]
    assert audit(scenario, solution, inputs=inputs).passed


def test_depot_candidates_limit_where_depots_open():
    inputs = line([120.0, 80.0, 90.0])
    scenario = official(demand_kt=demand(BPN=20.0), depot_candidates=[B], refinery_candidates=[A, B, C])
    solution = resolve(scenario, inputs=inputs)
    assert {f.site_id for f in rows(solution, "depot")} == {B}
    assert audit(scenario, solution, inputs=inputs).passed


def test_audit_rejects_a_facility_outside_the_candidate_lists():
    inputs = line([120.0, 80.0, 90.0])
    open_scenario = official(demand_kt=demand(BPN=20.0), refinery_candidates=[A, B, C])
    solution = resolve(open_scenario, inputs=inputs)
    built = rows(solution, "refinery")[0].site_id
    other = next(site for site in (A, B, C) if site != built)
    narrowed = open_scenario.model_copy(update={"refinery_candidates": [other]})
    assert any(f.startswith("facility_selection:") for f in audit(narrowed, solution, inputs=inputs).failures)


@pytest.mark.parametrize("field", ["refinery_candidates", "depot_candidates"])
def test_ineligible_site_is_refused_rather_than_dropped(field):
    inputs = tiny([100.0, 100.0], candidate=[True, False])
    reason = precheck(official(demand_kt=demand(BPN=8.0), **{field: [A, B]}), inputs)
    assert "Not eligible" in reason
    assert B in reason


def test_tarakan_stays_refused_as_a_refinery_site():
    reason = precheck(official(demand_kt=demand(BPN=8.0), refinery_candidates=["TRK"]), tiny([100.0]))
    assert "TRK" in reason


def test_baseline_follows_the_settings_and_passes_the_audit():
    inputs = line([120.0, 80.0, 90.0])
    scenario = official(demand_kt=demand(BPN=20.0), depot_candidates=[B, C], refinery_candidates=[C], haul_limit_km=150.0)
    solution = baseline(scenario, inputs=inputs)
    assert {f.site_id for f in rows(solution, "depot")} <= {B, C}
    assert {f.site_id for f in rows(solution, "refinery")} == {C}
    assert audit(scenario, solution, inputs=inputs).passed


def test_time_limit_can_exceed_the_old_90_second_cap(monkeypatch):
    seen = {}

    def capture(p, budget_s, grace_s=2.0):
        seen["budget"] = budget_s
        return []

    monkeypatch.setattr("solver.model.run_portfolio", capture)
    resolve(official(demand_kt=demand(BPN=8.0), time_limit_s=200), inputs=tiny([100.0]), candidates=[A])
    assert seen["budget"] > 150


@pytest.mark.parametrize("cores, plan", [(15, (5, 7)), (8, (4, 2)), (2, (1, 2)), (1, (1, 2))])
def test_worker_plan_fits_the_machine(cores, plan):
    assert worker_plan(cores) == plan
