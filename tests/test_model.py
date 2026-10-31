"""Known-answer tests for the annualised MILP. Tiny instances are injected; one slow test uses the real sites."""
import math
from types import SimpleNamespace

import numpy as np
import pandas as pd
import pytest

from solver.contract import Scenario
from solver.model import (
    precheck,ANNUAL_FIXED_SHARE, DEPOT_VAR_USD_T, HAUL_HAV_KM, RATE, REFINERY_VAR_USD_T, build_problem,
                          enumerate_mixes, mix_floor, portfolio_row, resolve, solve_mix)

AIRPORTS = ("PNK", "PKN", "BPN", "TRK")
A, B, C, D = (f"KAL_SUP_{n:02d}" for n in range(1, 5))
SHARES = {"PNK": 0.317, "PKN": 0.05, "BPN": 0.558, "TRK": 0.075}
ZERO = (0, 0, 0)


def tiny(kt, *, km=None, candidate=None):
    """Sites A, B, ... plus the four airports. `km` is a full (n+4)² haversine matrix; default all co-located."""
    ids = [f"KAL_SUP_{n + 1:02d}" for n in range(len(kt))]
    n = len(ids) + 4
    hav = np.zeros((n, n)) if km is None else np.array(km, dtype=float)
    flags = np.ones(len(ids), bool) if candidate is None else np.array(candidate, bool)
    sites = pd.DataFrame({"site_id": ids, "province": "P", "district": "D", "label": ids, "kt": kt,
                          "tonnes": [v * 1000 for v in kt], "lat": 0.0, "lon": 0.0, "is_onshore": flags,
                          "is_candidate": flags, "data_flag": "ok"})
    airports = pd.DataFrame({"iata": AIRPORTS, "name": AIRPORTS, "city": AIRPORTS, "lat": 0.0, "lon": 0.0,
                             "demand_share": [SHARES[a] for a in AIRPORTS]})
    return SimpleNamespace(sites=sites, airports=airports, node_ids=np.array(ids + list(AIRPORTS)), hav_km=hav,
                           road_km=hav * 1.9, is_candidate=flags, data_hash="tiny")


def line(kt, spacing=50.0):
    """Sites spaced along a line with every airport at the last site, so freight is nonzero and checkable."""
    n = len(kt)
    pos = [spacing * i for i in range(n)] + [spacing * (n - 1)] * 4
    return tiny(kt, km=[[abs(a - b) for b in pos] for a in pos])


def demand(**kw):
    return {a: kw.get(a, 0.0) for a in AIRPORTS}


def spread(total):
    return {a: total / 4 for a in AIRPORTS}


def official(**overrides):
    """The organisers' 12:45 case: yield 0.20, road factor 1.3, optional collection, biomass basis, 300 kt each."""
    fields = {"yield_fraction": 0.20, "road_factor": 1.3, "collection_policy": "optional",
              "capacity_basis": "biomass_input", "demand_kt": {a: 300.0 for a in AIRPORTS}}
    return Scenario(**{**fields, **overrides})


def by_leg(solution, leg):
    return [f for f in solution.model_dump(by_alias=True)["flows"] if f["leg"] == leg]


def sized(solution, kind):
    return sorted((f["site_id"], f["size"]) for f in solution.model_dump()["facilities"] if f["type"] == kind)


def three_leg():
    """A (60 kt) at km 0, B (40 kt) at km 10, PNK and PKN at km 110, BPN and TRK at km 140. Only B can hold a depot."""
    pos = [0.0, 10.0, 110.0, 110.0, 140.0, 140.0]
    return tiny([60.0, 40.0], km=[[abs(a - b) for b in pos] for a in pos], candidate=[False, True])


# Worked by hand for three_leg() with refinery candidate PNK, 5 kt to each airport, yield 0.20, road factor 1.3.
# 20 kt of SAF needs 100 kt of biomass, so both sites are collected in full, through one depot at B.
#   Small depot beats large: 0.225M + 5 x 100k = 0.725M against 0.45M + 4 x 100k = 0.85M.
#   Annual fixed    0.10 x (2.25M + 480M)                           = 48,225,000
#   Depot OpEx      5 x 100,000 t                                   =    500,000
#   Refinery OpEx   60 x 100,000 t                                  =  6,000,000
#   Leg 1 A->B      60,000 t x 0.10 x (10 km x 1.3)                 =     78,000
#   Leg 2 B->PNK    100,000 t x 0.12 x (100 km x 1.3)               =  1,560,000
#   Leg 3 PNK->BPN and PNK->TRK, each 5,000 t x 0.08 x (30 km x 1.3) = 15,600, so 31,200
#   PNK->PNK and PNK->PKN are 0 km.
KNOWN_NON_FREIGHT = 54_725_000.0
KNOWN_FREIGHT = 1_669_200.0
KNOWN_CAPEX = 482_250_000.0


def known(rates=RATE, **overrides):
    return resolve(official(demand_kt=spread(20.0), **overrides), inputs=three_leg(), candidates=["PNK"], rates=rates)


def test_cost_constants_match_the_organisers_update():
    assert ANNUAL_FIXED_SHARE == pytest.approx(1 / 20 + 0.05)
    assert DEPOT_VAR_USD_T == {"S": 5, "L": 4}
    assert REFINERY_VAR_USD_T == {"S": 60, "L": 55}


def test_zero_freight_microcase_costs_fixed_charge_plus_variable_opex():
    # 0.10 x 482.25M + 60 x 100k t + 5 x 100k t
    sol = resolve(official(demand_kt=spread(20.0)), inputs=tiny([100.0]), candidates=[A], rates=ZERO)
    assert sol.status == "optimal"
    assert sol.total_horizon_usd == pytest.approx(54.725e6, abs=0.01)
    assert sol.primal == pytest.approx(54.725e6, abs=0.01)
    assert sol.capex_usd == pytest.approx(KNOWN_CAPEX, abs=0.01)
    assert sol.logistics_annual_usd == pytest.approx(0, abs=0.01)


def test_known_answer_with_freight_on_all_three_legs():
    sol = known()
    assert sol.status == "optimal"
    assert sized(sol, "depot") == [(B, "small")]
    assert sized(sol, "refinery") == [("PNK", "small")]
    assert sol.total_horizon_usd == pytest.approx(KNOWN_NON_FREIGHT + KNOWN_FREIGHT, abs=0.01)
    assert sol.primal == pytest.approx(sol.total_horizon_usd, abs=0.01)
    assert sol.capex_usd == pytest.approx(KNOWN_CAPEX, abs=0.01)
    assert sol.logistics_annual_usd == pytest.approx(KNOWN_FREIGHT, abs=0.01)


def test_large_depot_is_charged_four_dollars_not_five():
    # One 300 kt site can only fill one large depot.
    # 0.10 x (4.5M + 480M) = 48.45M, depot 4 x 300k = 1.2M, refinery 60 x 300k = 18M. At $5 this would be 67.95M.
    sol = resolve(official(demand_kt=spread(60.0)), inputs=tiny([300.0]), candidates=[A], rates=ZERO)
    assert sized(sol, "depot") == [(A, "large")]
    assert sol.total_horizon_usd == pytest.approx(67.65e6, abs=0.01)


def test_large_refinery_is_charged_55_dollars_not_60():
    # 600 kt of biomass exceeds a small refinery's 500 kt, and only A is a candidate.
    # 0.10 x (9M + 765M) = 77.4M, depots 4 x 600k = 2.4M, refinery 55 x 600k = 33M. At $60 this would be 115.8M.
    sol = resolve(official(demand_kt=spread(120.0)), inputs=tiny([300.0, 300.0]), candidates=[A], rates=ZERO)
    assert sized(sol, "refinery") == [(A, "large")]
    assert sol.total_horizon_usd == pytest.approx(112.8e6, abs=0.01)


def test_mixed_depot_sizes_are_each_charged_their_own_rate():
    # 400 kt needs large + small: 300 kt at $4 and 100 kt at $5, fixed 0.10 x 6.75M, small refinery 48M + 60 x 400k.
    # 0.675M + 1.2M + 0.5M + 48M + 24M = 74.375M.
    sol = resolve(official(demand_kt=spread(80.0)), inputs=tiny([300.0, 100.0]), candidates=[A], rates=ZERO)
    assert sorted(size for _, size in sized(sol, "depot")) == ["large", "small"]
    assert sol.total_horizon_usd == pytest.approx(74.375e6, abs=0.01)


def test_a_mix_with_both_sizes_runs_the_cheaper_refinery_first():
    # Mix (1, 1) must open both. All 600 kt goes to the large unit at $55.
    # 0.10 x (9M + 1,245M) = 125.4M, depots 2.4M, refinery 33M.
    p = build_problem(official(demand_kt=spread(120.0)), tiny([300.0, 300.0]), [A, B], ZERO)
    result = solve_mix(p, 1, 1, 10)
    assert result["state"] == "proven"
    assert result["primal"] == pytest.approx(160.8e6, abs=0.01)


def test_pinned_facilities_are_charged_at_the_pinned_size():
    # A large depot pinned on a 100 kt site: 0.10 x (4.5M + 480M) + 4 x 100k + 60 x 100k = 54.85M.
    p = build_problem(official(demand_kt=spread(20.0)), tiny([100.0]), [A], ZERO)
    result = solve_mix(p, 0, 1, 10, fixed={"depots": {(A, "L")}, "refineries": {(A, "S")}})
    assert result["depots"] == [(A, "L")]
    assert result["primal"] == pytest.approx(54.85e6, abs=0.01)


def test_solve_mix_returns_the_documented_keys():
    p = build_problem(official(demand_kt=spread(20.0)), tiny([100.0]), [A], ZERO)
    result = solve_mix(p, 0, 1, 10)
    assert {"state", "primal", "bound", "gap", "depots", "refineries", "x", "f", "g", "e"} <= set(result)
    assert (result["state"], result["gap"]) == ("proven", 0.0)
    assert result["bound"] == pytest.approx(result["primal"], abs=0.01)


def test_demand_none_means_300_kt_at_each_airport():
    p = build_problem(official(demand_kt=None), tiny([100.0]), [A], RATE)
    assert p.demand == {a: 300.0 for a in AIRPORTS}


def test_every_airport_receives_its_demand():
    want = demand(BPN=8.0, PNK=4.0, TRK=2.0, PKN=1.0)
    sol = resolve(official(demand_kt=want), inputs=line([60.0, 60.0, 60.0]), candidates=[A, B, C])
    got = {a: sum(f["kt"] for f in by_leg(sol, "refinery_airport") if f["to"] == a) for a in AIRPORTS}
    assert sol.status == "optimal"
    assert got == pytest.approx(want, abs=1e-6)


def test_demand_below_production_becomes_surplus_at_the_gate():
    sol = resolve(official(demand_kt=demand(BPN=10.0), collection_policy="all"), inputs=tiny([100.0]), candidates=[A])
    assert sum(s["kt"] for s in sol.model_dump()["surplus"]) == pytest.approx(10.0, abs=1e-6)


def test_excess_demand_is_infeasible_with_reason():
    sol = resolve(official(demand_kt=demand(BPN=21.0)), inputs=tiny([100.0]), candidates=[A])
    assert sol.status == "infeasible"
    assert "exceeds" in sol.status_reason


def test_site_without_depot_in_range_is_infeasible_under_collect_all():
    inputs = line([10.0, 10.0], spacing=500.0)
    sol = resolve(official(demand_kt=demand(BPN=1.0), collection_policy="all", excluded_ids=[A]), inputs=inputs,
                  candidates=[B])
    assert sol.status == "infeasible"
    assert "in range" in sol.status_reason
    assert sol.status_reason.endswith(f"of {A}")


def test_zero_demand_optional_opens_nothing():
    sol = resolve(official(demand_kt=demand()), inputs=tiny([100.0]), candidates=[A])
    assert sol.status == "optimal"
    assert sol.total_horizon_usd == 0
    assert sol.model_dump()["facilities"] == []


def test_excluded_ids_remove_facilities_but_keep_supply():
    sol = resolve(official(demand_kt=demand(BPN=40.0), excluded_ids=[B]), inputs=line([100.0, 100.0]),
                  candidates=[A, B])
    sites = {f["site_id"] for f in sol.model_dump()["facilities"]}
    assert sol.status == "optimal"
    assert B not in sites
    assert sum(f["kt"] for f in by_leg(sol, "supply_depot")) == pytest.approx(200.0, abs=1e-6)


def test_trk_is_dropped_but_the_other_airports_stay_refinery_candidates():
    p = build_problem(official(), tiny([100.0]), [A, "PNK", "PKN", "BPN", "TRK"], RATE)
    assert p.refineries == (A, "PNK", "PKN", "BPN")


def test_trk_is_never_opened_even_when_it_is_the_only_candidate():
    sol = resolve(official(demand_kt=spread(20.0)), inputs=tiny([100.0]), candidates=["TRK"])
    assert sol.status == "infeasible"
    assert sol.n_candidates == 0
    assert sized(sol, "refinery") == []


def test_passing_trk_changes_nothing():
    inputs = three_leg()
    scenario = official(demand_kt=spread(20.0))
    with_trk = resolve(scenario, inputs=inputs, candidates=["PNK", "TRK"])
    assert sized(with_trk, "refinery") == [("PNK", "small")]
    assert with_trk.total_horizon_usd == pytest.approx(KNOWN_NON_FREIGHT + KNOWN_FREIGHT, abs=0.01)


def test_optional_collection_leaves_what_demand_does_not_need():
    sol = resolve(official(demand_kt=demand(BPN=3.0)), inputs=line([50.0, 50.0]), candidates=[B])
    assert {f["from"] for f in by_leg(sol, "supply_depot")} == {B}
    assert {s["site_id"]: s["kt"] for s in sol.model_dump()["stranded"]}[A] == pytest.approx(50.0, abs=1e-6)


def test_optional_collection_leaves_a_site_out_of_range_unused():
    sol = resolve(official(demand_kt=demand(BPN=1.0)), inputs=line([10.0, 10.0], spacing=500.0), candidates=[B])
    assert sol.status == "optimal"
    assert {f["from"] for f in by_leg(sol, "supply_depot")} == {B}
    assert {s["site_id"]: s["kt"] for s in sol.model_dump()["stranded"]}[A] == pytest.approx(10.0, abs=1e-6)


def test_retention_scales_refinery_inflow():
    # 24 kt of SAF at yield 0.20 needs 120 kt at the refinery, so 150 kt into depots at retention 0.8.
    sol = resolve(official(demand_kt=demand(BPN=24.0), depot_retention=0.8), inputs=line([100.0, 100.0]),
                  candidates=[A, B])
    assert sum(f["kt"] for f in by_leg(sol, "supply_depot")) == pytest.approx(150.0, abs=1e-6)
    assert sum(f["kt"] for f in by_leg(sol, "depot_refinery")) == pytest.approx(120.0, abs=1e-6)
    assert sum(f["kt"] for f in by_leg(sol, "refinery_airport")) == pytest.approx(24.0, abs=1e-6)


def test_variable_opex_follows_each_stage_throughput_under_retention():
    # 10 kt of SAF: 50 kt into the refinery, 100 kt into the depot at retention 0.5.
    # 0.10 x 482.25M + 5 x 100k + 60 x 50k = 51.725M.
    sol = resolve(official(demand_kt=spread(10.0), depot_retention=0.5), inputs=tiny([100.0]), candidates=[A],
                  rates=ZERO)
    assert sol.total_horizon_usd == pytest.approx(51.725e6, abs=0.01)


def test_biomass_basis_needs_refineries_for_input_not_output():
    inputs = line([300.0, 300.0])
    want = demand(BPN=120.0)
    saf = resolve(official(demand_kt=want, capacity_basis="saf_output"), inputs=inputs, candidates=[A, B])
    biomass = resolve(official(demand_kt=want), inputs=inputs, candidates=[A, B])
    assert [size for _, size in sized(saf, "refinery")] == ["small"]
    assert [size for _, size in sized(biomass, "refinery")] == ["large"]


def test_more_candidates_never_raise_cost():
    inputs = line([120.0, 80.0, 90.0, 60.0])
    scenario = official(demand_kt=demand(BPN=60.0))
    few = resolve(scenario, inputs=inputs, candidates=[A, B])
    many = resolve(scenario, inputs=inputs, candidates=[A, B, C, D, "BPN"])
    assert few.status == many.status == "optimal"
    assert many.total_horizon_usd <= few.total_horizon_usd + 0.01


def test_higher_rates_never_lower_cost():
    inputs = line([120.0, 80.0, 90.0, 60.0])
    scenario = official(demand_kt=demand(BPN=60.0))
    low = resolve(scenario, inputs=inputs, candidates=[A, B, C, D])
    high = resolve(scenario, inputs=inputs, candidates=[A, B, C, D], rates=(0.2, 0.24, 0.16))
    assert low.status == high.status == "optimal"
    assert high.total_horizon_usd > low.total_horizon_usd + 1


def test_doubling_rates_doubles_freight_exactly():
    sol = known(rates=tuple(2 * rate for rate in RATE))
    assert sol.total_horizon_usd == pytest.approx(KNOWN_NON_FREIGHT + 2 * KNOWN_FREIGHT, abs=0.01)


def test_road_factor_scales_freight_only():
    sol = known(road_factor=2.6)
    assert sol.total_horizon_usd == pytest.approx(KNOWN_NON_FREIGHT + 2 * KNOWN_FREIGHT, abs=0.01)
    assert sol.capex_usd == pytest.approx(KNOWN_CAPEX, abs=0.01)


def test_horizon_multiplies_the_annual_total_but_not_capex_or_logistics():
    sol = known(horizon_years=3)
    assert sol.total_horizon_usd == pytest.approx(3 * (KNOWN_NON_FREIGHT + KNOWN_FREIGHT), abs=0.01)
    assert sol.primal == pytest.approx(sol.total_horizon_usd, abs=0.01)
    assert sol.capex_usd == pytest.approx(KNOWN_CAPEX, abs=0.01)
    assert sol.logistics_annual_usd == pytest.approx(KNOWN_FREIGHT, abs=0.01)


AUDIT_CASES = {
    "known_answer": (lambda: three_leg(), ["PNK"], dict(demand_kt=spread(20.0))),
    "large_depot": (lambda: tiny([300.0]), [A], dict(demand_kt=spread(60.0))),
    "large_refinery": (lambda: tiny([300.0, 300.0]), [A], dict(demand_kt=spread(120.0))),
    "line": (lambda: line([60.0, 60.0, 60.0]), [A, B, C], dict(demand_kt=demand(BPN=8.0, PNK=4.0, TRK=2.0, PKN=1.0))),
    "surplus": (lambda: tiny([100.0]), [A], dict(demand_kt=demand(BPN=10.0), collection_policy="all")),
    "retention": (lambda: line([100.0, 100.0]), [A, B], dict(demand_kt=demand(BPN=24.0), depot_retention=0.8)),
    "stranded": (lambda: line([50.0, 50.0]), [B], dict(demand_kt=demand(BPN=3.0))),
    "excluded": (lambda: line([100.0, 100.0]), [A, B], dict(demand_kt=demand(BPN=40.0), excluded_ids=[B])),
    "horizon": (lambda: three_leg(), ["PNK"], dict(demand_kt=spread(20.0), horizon_years=3)),
    "saf_basis": (lambda: line([300.0, 300.0]), [A, B], dict(demand_kt=demand(BPN=120.0), capacity_basis="saf_output")),
    "nothing_open": (lambda: tiny([100.0]), [A], dict(demand_kt=demand())),
}


def audited(case):
    from solver.audit import audit

    build, candidates, overrides = AUDIT_CASES[case]
    inputs, scenario = build(), official(**overrides)
    return audit(scenario, resolve(scenario, inputs=inputs, candidates=candidates), inputs=inputs)


@pytest.mark.parametrize("case", AUDIT_CASES)
def test_every_tiny_result_passes_every_audit_family_except_totals(case):
    report = audited(case)
    assert [line for line in report.failures if not line.startswith("totals:")] == []


@pytest.mark.parametrize("case", AUDIT_CASES)
def test_every_tiny_result_passes_the_audit_totals(case):
    report = audited(case)
    assert report.passed, report.failures


FLOOR_CASES = {
    "optional": (lambda: line([200.0, 200.0, 200.0]), dict(demand_kt=spread(60.0))),
    "collect_all": (lambda: line([200.0, 200.0, 200.0]), dict(demand_kt=spread(60.0), collection_policy="all")),
    "saf_basis": (lambda: line([200.0, 200.0, 200.0]), dict(demand_kt=spread(60.0), capacity_basis="saf_output")),
    "retention": (lambda: line([200.0, 200.0, 200.0]), dict(demand_kt=spread(48.0), depot_retention=0.8)),
    "surplus": (lambda: line([200.0, 200.0, 200.0]), dict(demand_kt=spread(20.0), collection_policy="all")),
    "co_located": (lambda: tiny([300.0, 300.0, 300.0]), dict(demand_kt=spread(120.0))),
}


@pytest.mark.parametrize("case", FLOOR_CASES)
def test_mix_floor_never_exceeds_a_proven_plan(case):
    build, overrides = FLOOR_CASES[case]
    p = build_problem(official(**overrides), build(), [A, B, C], RATE)
    proven = 0
    for mix in enumerate_mixes(len(p.refineries)):
        result = solve_mix(p, mix["n_large"], mix["n_small"], 5)
        if result["state"] == "proven":
            proven += 1
            assert mix_floor(p, mix["n_large"], mix["n_small"]) <= result["primal"] + 0.01, mix
    assert proven > 0


def test_mix_floor_is_at_least_the_annual_refinery_charge():
    p = build_problem(official(demand_kt=spread(60.0)), line([200.0, 200.0, 200.0]), [A, B, C], RATE)
    assert mix_floor(p, 1, 1) >= ANNUAL_FIXED_SHARE * (765e6 + 480e6)


def test_mix_floor_scales_with_the_horizon():
    inputs = tiny([100.0])
    one = build_problem(official(demand_kt=spread(20.0)), inputs, [A], RATE)
    three = build_problem(official(demand_kt=spread(20.0), horizon_years=3), inputs, [A], RATE)
    assert mix_floor(three, 0, 1) == pytest.approx(3 * mix_floor(one, 0, 1), abs=0.01)


def test_mixes_ascend_by_capex_and_start_at_zero():
    mixes = enumerate_mixes(3)
    capex = [m["capex_usd"] for m in mixes]
    assert capex == sorted(capex)
    assert (mixes[0]["n_large"], mixes[0]["n_small"]) == (0, 0)
    assert len(mixes) == 10


def test_every_mix_is_reported_and_short_capacity_is_skipped(monkeypatch):
    monkeypatch.setattr("solver.model.WORKERS", 1)
    sol = resolve(official(demand_kt=demand(BPN=120.0)), inputs=line([300.0, 300.0]), candidates=[A, B])
    states = {(m["n_large"], m["n_small"]): m["reason"] for m in sol.model_dump()["portfolios"]}
    assert set(states) == {(0, 0), (0, 1), (1, 0), (0, 2), (1, 1), (2, 0)}
    assert states[0, 0] == states[0, 1] == "skipped_capacity"
    assert states[1, 0] == "proven"
    assert states[0, 2] == states[1, 1] == states[2, 0] == "skipped_capex"
    assert sol.status == "optimal"


def test_haul_limit_keeps_the_214_15_km_arc():
    from solver.inputs import load_inputs

    inputs = load_inputs()
    ids = list(inputs.node_ids)
    assert 214 < inputs.hav_km[ids.index("KAL_SUP_06"), ids.index("KAL_SUP_76")] <= HAUL_HAV_KM
    problem = build_problem(official(), inputs, ["KAL_SUP_06"], RATE)
    assert ("KAL_SUP_06", "KAL_SUP_76") in problem.supply_km


def test_live_solve_is_labelled_live():
    sol = resolve(official(demand_kt=spread(20.0)), inputs=tiny([100.0]), candidates=[A], rates=ZERO)
    assert sol.source == "live"


@pytest.mark.parametrize("state, status", [
    ("proven", "optimal"),
    ("infeasible", "infeasible"),
    ("best_found", "best_found"),
    ("no_incumbent", "skipped"),
    ("not_run", "skipped"),
    ("dominated", "skipped"),
    ("skipped_capex", "skipped"),
    ("skipped_capacity", "skipped"),
])
def test_portfolio_row_maps_state_to_contract_status_and_keeps_raw_state(state, status):
    row = portfolio_row({"n_large": 1, "n_small": 2, "capex_usd": 5.0, "state": state, "primal": None, "bound": None,
                         "gap": None, "seconds": None})
    assert row == {"n_large": 1, "n_small": 2, "capex_usd": 5.0, "status": status, "primal": None, "bound": None,
                   "gap": None, "solve_seconds": 0, "reason": state}


def test_portfolio_row_keeps_a_failed_mix_visible_and_never_optimal():
    row = portfolio_row({"n_large": 1, "n_small": 0, "capex_usd": 5.0, "state": "failed", "primal": None, "bound": 1.0,
                         "gap": None, "seconds": None})
    assert row["reason"] == "failed"
    assert row["status"] != "optimal"


def test_trips_use_the_contract_formula_exactly():
    sol = resolve(official(demand_kt=spread(27.0)), inputs=line([90.0, 45.0]), candidates=[A, B])
    flows = sol.model_dump(by_alias=True)["flows"]
    assert flows
    assert all(f["trips"] == math.ceil(f["kt"] * 1000 / f["truck_t"]) for f in flows)


def test_surplus_rows_carry_only_site_and_kt():
    sol = resolve(official(demand_kt=demand(BPN=10.0), collection_policy="all"), inputs=tiny([100.0]), candidates=[A])
    assert [set(row) for row in sol.model_dump()["surplus"]] == [{"site_id", "kt"}]


def test_infeasible_solution_is_a_complete_contract_row():
    sol = resolve(official(demand_kt=demand(BPN=21.0)), inputs=tiny([100.0]), candidates=[A]).model_dump()
    assert (sol["primal"], sol["bound"], sol["gap"]) == (None, None, None)
    assert (sol["capex_usd"], sol["logistics_annual_usd"], sol["total_horizon_usd"]) == (0, 0, 0)
    assert (sol["facilities"], sol["flows"], sol["stranded"], sol["surplus"]) == ([], [], [], [])


@pytest.mark.slow
def test_six_large_refineries_on_real_data_cost_about_895m_a_year():
    from solver.candidates import SHORTLIST
    from solver.inputs import load_inputs

    problem = build_problem(official(), load_inputs(), list(SHORTLIST), RATE)
    result = solve_mix(problem, 6, 0, 45)
    assert result["primal"] is not None, result["state"]
    assert result["primal"] == pytest.approx(895e6, abs=10e6)


def test_precheck_passes_a_scenario_that_can_work():
    assert precheck(official(demand_kt=demand(BPN=100.0)), line([300.0, 300.0]), candidates=[A, B]) is None


def test_precheck_names_excess_demand():
    assert "exceeds" in precheck(official(demand_kt=demand(BPN=16.0)), tiny([50.0]), candidates=[A])


def test_precheck_names_short_refinery_capacity():
    reason = precheck(official(demand_kt=demand(BPN=240.0)), line([1500.0]), candidates=[A])
    assert "1,200.00 kt" in reason
    assert "1,087.00 kt" in reason
    assert "efiner" in reason


def test_precheck_names_short_depot_capacity():
    reason = precheck(official(demand_kt=demand(BPN=80.0)), tiny([400.0]), candidates=[A, "BPN"])
    assert "400.00 kt" in reason
    assert "300.00 kt" in reason
    assert "epot" in reason


def test_resolve_reports_the_same_reason_without_starting_a_solve(monkeypatch):
    monkeypatch.setattr("solver.model.run_portfolio", lambda *a, **k: pytest.fail("must not solve"))
    sol = resolve(official(demand_kt=demand(BPN=240.0)), inputs=line([1500.0]), candidates=[A])
    assert sol.status == "infeasible"
    assert "1,087.00 kt" in sol.status_reason
