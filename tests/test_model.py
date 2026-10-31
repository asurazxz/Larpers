"""Known-answer tests for the MILP. Tiny instances are injected; Run A uses the real sites."""
from types import SimpleNamespace

import numpy as np
import pandas as pd
import pytest

from solver.candidates import PROTOTYPE_SHORTLIST
from solver.contract import Scenario
from solver.model import HAUL_HAV_KM, RATE, build_problem, enumerate_mixes, resolve, solve_mix

AIRPORTS = ("PNK", "PKN", "BPN", "TRK")
SHARES = {"PNK": 0.317, "PKN": 0.05, "BPN": 0.558, "TRK": 0.075}


def tiny(kt, *, km=None, candidate=None):
    """Sites A, B, ... plus the four airports. `km` is a full (n+4)² haversine matrix; default all co-located."""
    ids = [chr(65 + n) for n in range(len(kt))]
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


def by_leg(solution, leg):
    return [f for f in solution.model_dump(by_alias=True)["flows"] if f["leg"] == leg]


def test_zero_freight_microcase_costs_one_small_refinery_and_one_small_depot():
    sol = resolve(Scenario(), inputs=tiny([100.0]), candidates=["A"], rates=(0, 0, 0))
    assert sol.status == "optimal"
    assert sol.total_horizon_usd == pytest.approx(482.25e6, abs=0.01)


def test_run_a_old_shortlist_large_mix_matches_prototype():
    from solver.inputs import load_inputs

    problem = build_problem(Scenario(), load_inputs(), list(PROTOTYPE_SHORTLIST), RATE)
    result = solve_mix(problem, 1, 0, 120)
    assert result["state"] == "proven"
    assert result["primal"] == pytest.approx(1393.5e6, abs=1e6)


def test_haul_limit_keeps_the_214_15_km_arc():
    from solver.inputs import load_inputs

    inputs = load_inputs()
    ids = list(inputs.node_ids)
    assert 214 < inputs.hav_km[ids.index("KAL_SUP_06"), ids.index("KAL_SUP_76")] <= HAUL_HAV_KM
    problem = build_problem(Scenario(), inputs, list(PROTOTYPE_SHORTLIST), RATE)
    assert ("KAL_SUP_06", "KAL_SUP_76") in problem.supply_km


def test_every_airport_receives_its_demand():
    want = demand(BPN=8.0, PNK=4.0, TRK=2.0, PKN=1.0)
    sol = resolve(Scenario(demand_kt=want), inputs=line([60.0, 60.0, 60.0]), candidates=["A", "B", "C"])
    got = {a: sum(f["kt"] for f in by_leg(sol, "refinery_airport") if f["to"] == a) for a in AIRPORTS}
    assert sol.status == "optimal"
    assert got == pytest.approx(want, abs=1e-6)


def test_demand_below_production_becomes_surplus_at_the_gate():
    sol = resolve(Scenario(demand_kt=demand(BPN=10.0)), inputs=tiny([100.0]), candidates=["A"])
    assert sum(s["kt"] for s in sol.model_dump()["surplus"]) == pytest.approx(5.0, abs=1e-6)


def test_excess_demand_is_infeasible_with_reason():
    sol = resolve(Scenario(demand_kt=demand(BPN=16.0)), inputs=tiny([100.0]), candidates=["A"])
    assert sol.status == "infeasible"
    assert "exceeds" in sol.status_reason


def test_site_without_depot_in_range_is_infeasible_under_collect_all():
    inputs = line([10.0, 10.0], spacing=500.0)
    sol = resolve(Scenario(excluded_ids=["A"]), inputs=inputs, candidates=["B"])
    assert sol.status == "infeasible"
    assert "in range" in sol.status_reason
    assert sol.status_reason.endswith("of A")


def test_zero_demand_optional_opens_nothing():
    sol = resolve(Scenario(demand_kt=demand(), collection_policy="optional"), inputs=tiny([100.0]), candidates=["A"])
    assert sol.status == "optimal"
    assert sol.total_horizon_usd == 0
    assert sol.model_dump()["facilities"] == []


def test_optional_collection_strands_what_demand_does_not_need():
    sol = resolve(Scenario(demand_kt=demand(BPN=3.0), collection_policy="optional"),
                  inputs=line([50.0, 50.0]), candidates=["B"])
    assert {f["from"] for f in by_leg(sol, "supply_depot")} == {"B"}
    assert {s["site_id"]: s["kt"] for s in sol.model_dump()["stranded"]}["A"] == pytest.approx(50.0, abs=1e-6)


def test_retention_scales_refinery_inflow_and_preset_demand():
    sol = resolve(Scenario(depot_retention=0.8), inputs=line([100.0, 100.0]), candidates=["A", "B"])
    assert sum(f["kt"] for f in by_leg(sol, "depot_refinery")) == pytest.approx(160.0, abs=1e-6)
    assert sum(f["kt"] for f in by_leg(sol, "refinery_airport")) == pytest.approx(24.0, abs=1e-6)


def test_excluded_ids_remove_facilities_but_keep_supply():
    sol = resolve(Scenario(excluded_ids=["B"]), inputs=line([100.0, 100.0]), candidates=["A", "B"])
    sites = {f["site_id"] for f in sol.model_dump()["facilities"]}
    assert "B" not in sites
    assert sum(f["kt"] for f in by_leg(sol, "supply_depot")) == pytest.approx(200.0, abs=1e-6)


def test_biomass_basis_needs_refineries_for_input_not_output():
    inputs = line([300.0, 300.0])
    saf = resolve(Scenario(), inputs=inputs, candidates=["A", "B"])
    biomass = resolve(Scenario(capacity_basis="biomass_input"), inputs=inputs, candidates=["A", "B"])
    size = lambda s: sorted(f["size"] for f in s.model_dump()["facilities"] if f["type"] == "refinery")
    assert size(saf) == ["small"]
    assert size(biomass) == ["large"]


def test_mixes_ascend_by_capex_and_start_at_zero():
    mixes = enumerate_mixes(3)
    capex = [m["capex_usd"] for m in mixes]
    assert capex == sorted(capex)
    assert (mixes[0]["n_large"], mixes[0]["n_small"]) == (0, 0)
    assert len(mixes) == 10


def test_every_mix_is_reported_and_short_capacity_is_skipped(monkeypatch):
    monkeypatch.setattr("solver.model.WORKERS", 1)
    sol = resolve(Scenario(capacity_basis="biomass_input"), inputs=line([300.0, 300.0]), candidates=["A", "B"])
    states = {(m["n_large"], m["n_small"]): m["state"] for m in sol.model_dump()["portfolios"]}
    assert set(states) == {(0, 0), (0, 1), (1, 0), (0, 2), (1, 1), (2, 0)}
    assert states[0, 0] == states[0, 1] == "skipped_capacity"
    assert states[0, 2] == states[1, 1] == states[2, 0] == "skipped_capex"


def test_more_candidates_never_raise_cost():
    inputs = line([120.0, 80.0, 90.0, 60.0])
    few = resolve(Scenario(), inputs=inputs, candidates=["A", "B"])
    many = resolve(Scenario(), inputs=inputs, candidates=["A", "B", "C", "D", "BPN"])
    assert few.status == many.status == "optimal"
    assert many.total_horizon_usd <= few.total_horizon_usd + 0.01


def test_higher_rates_never_lower_cost():
    inputs = line([120.0, 80.0, 90.0, 60.0])
    low = resolve(Scenario(), inputs=inputs, candidates=["A", "B", "C", "D"])
    high = resolve(Scenario(), inputs=inputs, candidates=["A", "B", "C", "D"], rates=(0.2, 0.24, 0.16))
    assert low.status == high.status == "optimal"
    assert high.total_horizon_usd >= low.total_horizon_usd - 0.01


def test_time_limited_run_is_not_called_optimal():
    from solver.inputs import load_inputs

    sol = resolve(Scenario(time_limit_s=1), inputs=load_inputs(), candidates=list(PROTOTYPE_SHORTLIST))
    assert sol.status != "optimal"
    assert sol.gap is None or sol.gap > 0
