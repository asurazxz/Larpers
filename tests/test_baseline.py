"""Regression against the approved greedy network, plus scenario semantics."""

from collections import Counter

import pytest

from solver.audit import audit
from solver.contract import Scenario
from solver.inputs import load_inputs
from test_audit import tiny_case


@pytest.fixture(scope="module")
def real_inputs(tmp_path_factory):
    # Fresh raw-data preparation also exercises cold starts without processed files.
    from data import prepare
    original = prepare.PROCESSED
    prepare.PROCESSED = tmp_path_factory.mktemp("baseline-inputs")
    try:
        prepare.prepare()
        return load_inputs(prepare.PROCESSED)
    finally:
        prepare.PROCESSED = original


def run_baseline(scenario, inputs):
    from solver.baseline import baseline
    return baseline(scenario, inputs=inputs)


def test_default_regression(real_inputs):
    scenario = Scenario()
    result = run_baseline(scenario, real_inputs)
    assert result.status == "heuristic"
    assert result.bound is None and result.gap is None
    depots = [f for f in result.facilities if f.type == "depot"]
    refineries = [(f.site_id, f.size) for f in result.facilities if f.type == "refinery"]
    assert len(depots) == 26
    assert refineries == [("KAL_SUP_45", "large")]
    assert result.capex_usd / 1e6 == pytest.approx(879.8, abs=.05)
    assert result.logistics_annual_usd / 1e6 == pytest.approx(577.7, abs=.05)
    assert result.total_horizon_usd / 1e6 == pytest.approx(1457.5, abs=.05)
    supply_flows = [f for f in result.flows if f.leg == "supply_depot"]
    assert Counter(f.from_id for f in supply_flows) == Counter({s: 1 for s in real_inputs.sites.site_id})
    assert max(f.hav_km for f in supply_flows) <= 300/1.4
    report = audit(scenario, result, inputs=real_inputs)
    assert report.passed, report.failures
    assert result.validation.passed


def test_sixteen_percent_adds_small_near_bpn(real_inputs):
    scenario = Scenario(**{"yield": .16})
    result = run_baseline(scenario, real_inputs)
    assert [(f.site_id, f.size) for f in result.facilities if f.type == "refinery"] == [("KAL_SUP_45", "large"), ("KAL_SUP_77", "small")]
    assert audit(scenario, result, inputs=real_inputs).passed
    assert sum(f.kt for f in result.flows if f.leg == "refinery_airport") == pytest.approx(1088)


@pytest.mark.parametrize("policy", ["all", "optional"])
def test_unreachable_site_in_leftover_branch(policy):
    inputs, _, _ = tiny_case()
    inputs.sites.loc[1, ["is_candidate", "is_onshore"]] = False
    inputs.is_candidate[1] = False
    inputs.hav_km[0, 1] = inputs.hav_km[1, 0] = 215
    scenario = Scenario(collection_policy=policy, demand_kt={"BPN": 8.37, "PNK": 4.755, "TRK": 1.125, "PKN": .75})
    result = run_baseline(scenario, inputs)
    if policy == "all":
        assert result.status == "infeasible"
        assert result.primal is None
    else:
        assert result.status == "heuristic"
        assert [(s.site_id, s.kt) for s in result.stranded] == [("KAL_SUP_02", 20)]
        assert audit(scenario, result, inputs=inputs).passed


def test_fractional_haul_boundary_is_not_rounded_to_214():
    inputs, scenario, _ = tiny_case()
    inputs.hav_km[0, 1] = inputs.hav_km[1, 0] = 214.2
    result = run_baseline(scenario, inputs)
    assert result.status == "heuristic"
    assert len([f for f in result.facilities if f.type == "depot"]) == 1
    assert any(f.hav_km == 214.2 for f in result.flows if f.leg == "supply_depot")
    assert audit(scenario, result, inputs=inputs).passed


def test_excluded_facility_keeps_its_biomass():
    inputs, _, _ = tiny_case()
    scenario = Scenario(excluded_ids=["KAL_SUP_01"])
    result = run_baseline(scenario, inputs)
    assert result.status == "heuristic"
    assert all(f.site_id != "KAL_SUP_01" for f in result.facilities)
    assert sum(f.kt for f in result.flows if f.leg == "supply_depot") == pytest.approx(120)
    assert audit(scenario, result, inputs=inputs).passed


def test_no_remaining_facility_site_is_infeasible():
    inputs, _, _ = tiny_case()
    result = run_baseline(Scenario(excluded_ids=["KAL_SUP_01", "KAL_SUP_02"]), inputs)
    assert result.status == "infeasible"


def test_custom_demand_creates_surplus_and_shortfall_is_infeasible():
    inputs, _, _ = tiny_case()
    scenario = Scenario(demand_kt={"BPN": 10, "PNK": 0, "TRK": 0, "PKN": 0})
    result = run_baseline(scenario, inputs)
    assert sum(s.kt for s in result.surplus) == pytest.approx(8)
    assert all(f.kt > 0 for f in result.flows)
    assert audit(scenario, result, inputs=inputs).passed
    shortfall = run_baseline(Scenario(demand_kt={"BPN": 19, "PNK": 0, "TRK": 0, "PKN": 0}), inputs)
    assert shortfall.status == "infeasible"


@pytest.mark.parametrize("basis", ["biomass_input", "saf_output"])
def test_retention_capacity_basis_road_factor_and_horizon(real_inputs, basis):
    scenario = Scenario(depot_retention=.8, road_factor=2.3, horizon_years=5, capacity_basis=basis)
    result = run_baseline(scenario, real_inputs)
    assert result.status == "heuristic"
    assert sum(f.kt for f in result.flows if f.leg == "depot_refinery") == pytest.approx(5440)
    assert sum(f.kt for f in result.flows if f.leg == "refinery_airport") == pytest.approx(816)
    assert result.total_horizon_usd == pytest.approx(result.capex_usd + 5*result.logistics_annual_usd)
    assert all(f.road_factor == 2.3 for f in result.flows)
    report = audit(scenario, result, inputs=real_inputs)
    assert report.passed, report.failures
    if basis == "biomass_input":
        # Five large + one small is cheaper than six large at 5,440 kt.
        assert Counter(f.size for f in result.facilities if f.type == "refinery") == {"large": 5, "small": 1}


def test_baseline_is_deterministic(real_inputs):
    scenario = Scenario(**{"yield": .16})
    first = run_baseline(scenario, real_inputs)
    second = run_baseline(scenario, real_inputs)
    assert first.run_id != second.run_id
    assert first.scenario_hash == second.scenario_hash
    assert first.primal == pytest.approx(second.primal, abs=.01)
    assert [f.model_dump() for f in first.flows] == [f.model_dump() for f in second.flows]
