"""Independent, hand-calculated networks and deliberately corrupted copies."""

import ast
import math
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from solver.contract import AuditReport, Facility, Flow, Solution
from legacy_scenario import LegacyScenario as Scenario
from solver.inputs import Inputs


def tiny_case():
    sites = pd.DataFrame([
        dict(site_id="KAL_SUP_01", label="One", kt=100., lat=0., lon=0., is_candidate=True, is_onshore=True),
        dict(site_id="KAL_SUP_02", label="Two", kt=20., lat=0., lon=.1, is_candidate=True, is_onshore=True),
        dict(site_id="KAL_SUP_03", label="Sea", kt=0., lat=0., lon=.2, is_candidate=False, is_onshore=False),
    ])
    airports = pd.DataFrame([dict(iata=a, name=a, lat=0., lon=0., demand_share=share) for a, share in (("BPN", .558), ("PNK", .317), ("TRK", .075), ("PKN", .05))])
    ids = np.array(list(sites.site_id) + list(airports.iata))
    dist = np.zeros((7, 7))
    dist[0, 1] = dist[1, 0] = 10
    inputs = Inputs(sites, airports, ids, dist, dist.copy(), np.array([True, True, False]), "tiny-data")
    scenario = Scenario()
    facility_rows = [
        dict(site_id="KAL_SUP_01", label="One", type="depot", size="small", lat=0, lon=0, capacity_kt=150, capacity_basis="biomass_in", throughput_kt=120, utilisation=.8, capex_usd=2_250_000),
        dict(site_id="KAL_SUP_01", label="One", type="refinery", size="large", lat=0, lon=0, capacity_kt=1087, capacity_basis="saf_out", throughput_kt=18, utilisation=18/1087, capex_usd=765_000_000),
    ]
    flow_rows = []
    legs = [("supply_depot", "KAL_SUP_01", "KAL_SUP_01", 100, 0, .1, 9), ("supply_depot", "KAL_SUP_02", "KAL_SUP_01", 20, 10, .1, 9), ("depot_refinery", "KAL_SUP_01", "KAL_SUP_01", 120, 0, .12, 30)]
    legs += [("refinery_airport", "KAL_SUP_01", a, amount, 0, .08, 32) for a, amount in (("BPN", 10.044), ("PNK", 5.706), ("TRK", 1.35), ("PKN", .9))]
    for leg, source, dest, kt, hav, rate, truck in legs:
        flow_rows.append(Flow(leg=leg, commodity="saf" if leg == "refinery_airport" else "biomass", from_id=source, to=dest, from_lat=0, from_lon=.1 if source == "KAL_SUP_02" else 0, to_lat=0, to_lon=0, from_label=source, to_label=dest, kt=kt, hav_km=hav, road_factor=1.9, km=hav*1.9, rate_usd_per_t_km=rate, cost_usd=kt*1000*rate*hav*1.9, truck_t=truck, trips=math.ceil(kt*1000/truck)))
    solution = Solution(run_id="tiny", source="live", data_hash="tiny-data", scenario_hash=scenario.scenario_hash(), status="heuristic", primal=767_288_000, bound=None, gap=None, n_candidates=2, solve_seconds=0, facilities=[Facility(**row) for row in facility_rows], flows=flow_rows, stranded=[], surplus=[], capex_usd=767_250_000, logistics_annual_usd=38_000, total_horizon_usd=767_288_000, validation=AuditReport())
    return inputs, scenario, solution


def run_audit(scenario, solution, inputs):
    from solver.audit import audit
    return audit(scenario, solution, inputs=inputs)


def test_valid_network_including_colocated_arcs():
    inputs, scenario, solution = tiny_case()
    report = run_audit(scenario, solution, inputs)
    assert report.passed, report.failures
    assert report.failures == []
    assert report.max_residuals["depot_balance"] <= 1e-6


@pytest.mark.parametrize("target,field,value,family", [
    ("flow", "kt", -1., "flow_nonnegative"),
    ("flow", "kt", 0., "flow_positive"),
    ("flow", "from_id", "UNKNOWN", "identifiers"),
    ("flow", "kt", 101., "supply"),
    ("flow", "kt", 99., "collection"),
    ("flow", "rate_usd_per_t_km", .15, "rate"),
    ("flow", "cost_usd", 1., "cost"),
    ("flow", "km", 1., "distance"),
    ("flow", "hav_km", 1., "distance"),
    ("flow", "road_factor", 1.4, "distance"),
    ("flow", "truck_t", 30, "flow_metadata"),
    ("flow", "trips", 1, "flow_metadata"),
    ("flow", "commodity", "saf", "flow_metadata"),
    ("flow", "from_lat", 1., "flow_metadata"),
    ("flow", "kt", float("nan"), "flow_nonnegative"),
    ("facility", "capacity_kt", 1., "capacity"),
    ("facility", "capex_usd", 1., "capex"),
    ("facility", "capacity_basis", "saf_out", "capacity"),
    ("facility", "site_id", "KAL_SUP_03", "facility_selection"),
    ("facility", "throughput_kt", 119., "throughput"),
    ("facility", "utilisation", .5, "throughput"),
    ("solution", "capex_usd", 0., "totals"),
    ("solution", "logistics_annual_usd", 0., "totals"),
    ("solution", "total_horizon_usd", 0., "totals"),
    ("solution", "primal", 0., "totals"),
    ("solution", "scenario_hash", "wrong", "scenario_hash"),
    ("solution", "data_hash", "wrong", "data_hash"),
])
def test_corruption_is_rejected(target, field, value, family):
    inputs, scenario, solution = tiny_case()
    if target == "flow":
        solution.flows[0] = solution.flows[0].model_copy(update={field: value})
    elif target == "facility":
        solution.facilities[0] = solution.facilities[0].model_copy(update={field: value})
    else:
        solution = solution.model_copy(update={field: value})
    report = run_audit(scenario, solution, inputs)
    assert not report.passed
    assert any(failure.startswith(family + ":") for failure in report.failures), report.failures


@pytest.mark.parametrize("index,family", [(2, "depot_balance"), (3, "refinery_yield"), (3, "demand")])
def test_mass_balance_corruption(index, family):
    inputs, scenario, solution = tiny_case()
    solution.flows[index].kt -= 1
    report = run_audit(scenario, solution, inputs)
    assert any(f.startswith(family + ":") for f in report.failures)


def test_capacity_checks_real_size_not_claimed_capacity():
    inputs, scenario, solution = tiny_case()
    inputs.sites.loc[0, "kt"] = 200
    solution.flows[0].kt = 200
    report = run_audit(scenario, solution, inputs)
    assert any(f.startswith("capacity:") for f in report.failures)


def test_one_size_per_facility_type():
    inputs, scenario, solution = tiny_case()
    solution.facilities.append(solution.facilities[0].model_copy())
    assert any(f.startswith("facility_selection:") for f in run_audit(scenario, solution, inputs).failures)


def test_excluded_facility_and_supply_haul_limit():
    inputs, _, solution = tiny_case()
    scenario = Scenario(excluded_ids=["KAL_SUP_01"])
    inputs.hav_km[0, 1] = inputs.hav_km[1, 0] = 215
    report = run_audit(scenario, solution, inputs)
    assert any(f.startswith("facility_selection:") for f in report.failures)
    assert any(f.startswith("haul_limit:") for f in report.failures)


def test_unopened_flow_endpoint():
    inputs, scenario, solution = tiny_case()
    solution.flows[0].to = "KAL_SUP_02"
    assert any(f.startswith("facility_selection:") for f in run_audit(scenario, solution, inputs).failures)


def test_stranded_and_surplus_must_reconcile():
    inputs, scenario, solution = tiny_case()
    from solver.contract import Stranded, Surplus
    solution.stranded = [Stranded(site_id="KAL_SUP_02", label="Two", lat=0, lon=.1, kt=1, reason="test")]
    solution.surplus = [Surplus(site_id="KAL_SUP_01", kt=1)]
    report = run_audit(scenario, solution, inputs)
    assert any(f.startswith("stranded:") for f in report.failures)
    assert any(f.startswith("refinery_yield:") for f in report.failures)


def update_flow_amount(flow, amount):
    flow.kt = amount
    flow.cost_usd = amount * 1000 * flow.rate_usd_per_t_km * flow.km
    flow.trips = math.ceil(amount * 1000 / flow.truck_t)


def test_retention_and_biomass_capacity_basis():
    inputs, _, solution = tiny_case()
    scenario = Scenario(depot_retention=.5, capacity_basis="biomass_input")
    solution.scenario_hash = scenario.scenario_hash()
    update_flow_amount(solution.flows[2], 60)
    for flow in solution.flows[3:]:
        update_flow_amount(flow, flow.kt / 2)
    refinery = solution.facilities[1]
    refinery.capacity_basis = "biomass_in"
    refinery.throughput_kt = 60
    refinery.utilisation = 60/1087
    report = run_audit(scenario, solution, inputs)
    assert report.passed, report.failures
    refinery.capacity_basis = "saf_out"
    assert not run_audit(scenario, solution, inputs).passed


def test_surplus_is_feasible_under_all_collection():
    from solver.contract import Surplus
    inputs, _, solution = tiny_case()
    scenario = Scenario(demand_kt={"BPN": 5.022, "PNK": 2.853, "TRK": .675, "PKN": .45})
    solution.scenario_hash = scenario.scenario_hash()
    for flow in solution.flows[3:]:
        update_flow_amount(flow, flow.kt / 2)
    solution.surplus = [Surplus(site_id="KAL_SUP_01", kt=9)]
    report = run_audit(scenario, solution, inputs)
    assert report.passed, report.failures


def test_optional_collection_records_uncollected_biomass():
    from solver.contract import Stranded
    inputs, _, solution = tiny_case()
    scenario = Scenario(collection_policy="optional", demand_kt={"BPN": 9.207, "PNK": 5.2305, "TRK": 1.2375, "PKN": .825})
    solution.scenario_hash = scenario.scenario_hash()
    update_flow_amount(solution.flows[0], 90)
    update_flow_amount(solution.flows[2], 110)
    for flow, amount in zip(solution.flows[3:], [9.207, 5.2305, 1.2375, .825]):
        update_flow_amount(flow, amount)
    solution.facilities[0].throughput_kt = 110
    solution.facilities[0].utilisation = 110/150
    solution.facilities[1].throughput_kt = 16.5
    solution.facilities[1].utilisation = 16.5/1087
    solution.stranded = [Stranded(site_id="KAL_SUP_01", label="One", lat=0, lon=0, kt=10, reason="Not collected")]
    report = run_audit(scenario, solution, inputs)
    assert report.passed, report.failures
    solution.stranded = []
    assert not run_audit(scenario, solution, inputs).passed


def test_numerical_tolerances():
    inputs, scenario, solution = tiny_case()
    solution.flows[0].kt += 5e-7
    solution.flows[0].cost_usd += .005
    assert run_audit(scenario, solution, inputs).passed
    solution.flows[0].kt += 2e-6
    assert not run_audit(scenario, solution, inputs).passed


def test_refinery_may_be_at_an_airport():
    inputs, scenario, solution = tiny_case()
    solution.facilities[1].site_id = "BPN"
    solution.flows[2].to = "BPN"
    for flow in solution.flows[3:]:
        flow.from_id = "BPN"
    report = run_audit(scenario, solution, inputs)
    assert report.passed, report.failures


@pytest.mark.parametrize("basis", ["saf_output", "biomass_input"])
def test_refinery_capacity_rejects_excess_on_selected_basis(basis):
    inputs, _, solution = tiny_case()
    scenario = Scenario(capacity_basis=basis)
    solution.scenario_hash = scenario.scenario_hash()
    refinery = solution.facilities[1]
    refinery.size = "small"
    refinery.capacity_kt = 500
    refinery.capex_usd = 480_000_000
    refinery.capacity_basis = "saf_out" if basis == "saf_output" else "biomass_in"
    if basis == "saf_output":
        solution.flows[3].kt = 501
    else:
        solution.flows[2].kt = 501
    report = run_audit(scenario, solution, inputs)
    assert any(f.startswith("capacity:") for f in report.failures)


def test_audit_does_not_import_optimizer():
    path = Path(__file__).resolve().parents[1] / "solver" / "audit.py"
    tree = ast.parse(path.read_text())
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            assert all(alias.name not in {"solver.model", "pulp"} and not alias.name.startswith(("pulp.", "solver.model.")) for alias in node.names)
        if isinstance(node, ast.ImportFrom):
            assert node.module not in {"solver.model", "pulp", "model"}
            assert not (node.module in {"solver", None} and any(alias.name == "model" for alias in node.names))
