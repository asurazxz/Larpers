"""Organiser values are the defaults; any of them can be overridden, and every layer must follow the override."""
import pytest
from pydantic import ValidationError

from solver.audit import audit
from solver.baseline import baseline
from solver.contract import Parameters, Scenario
from solver.inputs import load_inputs
from solver.model import build_problem, mix_floor, precheck, resolve, solve_mix
from test_model import A, B, RATE, demand, line, official, tiny


def micro(**parameters):
    """One 100 kt site with every airport co-located: fixed charges plus variable OpEx, no transport."""
    scenario = official(demand_kt=demand(BPN=20.0), parameters=parameters)
    inputs = tiny([100.0])
    solution = resolve(scenario, inputs=inputs, candidates=[A])
    return scenario, inputs, solution


def rows(solution, kind):
    return [f for f in solution.facilities if f.type == kind]


def test_defaults_are_the_organisers_workbook():
    official_values = load_inputs().parameters
    p = Parameters()
    assert (p.capex_years, p.fixed_opex_share) == (official_values["capex_years"], official_values["fixed_opex_rate"])
    capacity, capex, variable = p.capacity_kt(), p.capex_usd(), p.variable_opex_usd_t()
    assert len(official_values["facilities"]) == 4
    for row in official_values["facilities"]:
        kind, size = row["facility"], row["size"]
        assert capacity[kind][size] == row["capacity_kt_biomass_in"]
        assert capex[kind][size] == row["capex_usd"]
        assert variable[kind][size] == row["variable_opex_usd_per_t_in"]
    rates = p.rates()
    assert [rates[leg] for leg in ("supply_depot", "depot_refinery", "refinery_airport")] == [0.10, 0.12, 0.08]


def test_a_partial_override_keeps_every_other_default():
    p = Parameters(depot_large_kt=350)
    assert p.depot_large_kt == 350
    assert p.model_dump(exclude={"depot_large_kt"}) == Parameters().model_dump(exclude={"depot_large_kt"})


@pytest.mark.parametrize("bad", [{"depot_large_kt": 0}, {"refinery_small_kt": -1}, {"rate_supply_depot": -0.1},
                                 {"capex_years": 0}, {"fixed_opex_share": -0.05}, {"truck_depot_refinery_t": 0},
                                 {"refinery_large_var_usd_t": -1}, {"depot_small_capex_usd": -1}])
def test_nonsense_values_are_rejected(bad):
    with pytest.raises(ValidationError):
        Parameters(**bad)


def test_unknown_parameter_is_rejected_rather_than_ignored():
    with pytest.raises(ValidationError):
        Parameters(depot_largest_kt=350)


def test_default_parameters_leave_the_scenario_hash_alone():
    assert Scenario(parameters={}).scenario_hash() == Scenario().scenario_hash()
    assert Scenario(parameters={"depot_large_kt": 350}).scenario_hash() != Scenario().scenario_hash()


@pytest.mark.parametrize("overrides, total", [
    ({}, 54_725_000),                                   # 0.10 x 482.25M + 6M + 0.5M
    ({"refinery_small_capex_usd": 240e6}, 30_725_000),  # 0.10 x 242.25M + 6.5M
    ({"depot_small_capex_usd": 4.25e6}, 54_850_000),    # Small now costs 0.925M a year, so a large at 0.85M wins
    ({"capex_years": 10}, 78_837_500),                  # 0.15 x 482.25M + 6.5M
    ({"fixed_opex_share": 0}, 30_612_500),              # 0.05 x 482.25M + 6.5M
    ({"refinery_small_var_usd_t": 30}, 51_725_000),     # 48.225M + 3M + 0.5M
    ({"depot_small_var_usd_t": 10}, 54_850_000),        # Small now costs 1.225M a year, so a large at 0.85M wins
])
def test_cost_overrides_give_the_hand_worked_total_and_pass_the_audit(overrides, total):
    scenario, inputs, solution = micro(**overrides)
    assert solution.status == "optimal"
    assert solution.total_annual_usd == pytest.approx(total, abs=0.01)
    assert audit(scenario, solution, inputs=inputs).passed


def test_rate_override_reaches_the_flows_the_objective_and_the_audit():
    inputs = line([100.0, 100.0])
    base = official(demand_kt=demand(BPN=30.0))
    custom = official(demand_kt=demand(BPN=30.0), parameters={"rate_supply_depot": 0.50})
    plain, dear = resolve(base, inputs=inputs, candidates=[A, B]), resolve(custom, inputs=inputs, candidates=[A, B])
    assert {f.rate_usd_per_t_km for f in dear.flows if f.leg == "supply_depot"} == {0.50}
    assert dear.total_annual_usd > plain.total_annual_usd
    assert audit(custom, dear, inputs=inputs).passed


def test_truck_override_changes_trips_only():
    scenario, inputs, solution = micro(truck_supply_depot_t=3)
    _, _, plain = micro()
    leg = next(f for f in solution.flows if f.leg == "supply_depot")
    assert (leg.truck_t, leg.trips) == (3, 33_334)
    assert solution.total_annual_usd == pytest.approx(plain.total_annual_usd, abs=0.01)
    assert audit(scenario, solution, inputs=inputs).passed


def test_larger_refinery_changes_the_mix():
    inputs = line([900.0, 900.0])
    plain = official(demand_kt=demand(BPN=300.0), parameters={"depot_large_kt": 1000})
    bigger = official(demand_kt=demand(BPN=300.0), parameters={"depot_large_kt": 1000, "refinery_large_kt": 2000})
    assert len(rows(resolve(plain, inputs=inputs, candidates=[A, B]), "refinery")) == 2
    solution = resolve(bigger, inputs=inputs, candidates=[A, B])
    assert [f.size for f in rows(solution, "refinery")] == ["large"]
    assert audit(bigger, solution, inputs=inputs).passed


def test_depot_that_is_not_twice_a_small_one_still_solves():
    # 400 kt cannot pass one 300 kt depot; at 400 kt the old 2 x small cover cut would cut this plan off.
    inputs = tiny([400.0])
    refused = official(demand_kt=demand(BPN=80.0))
    assert "epot" in precheck(refused, inputs, candidates=[A])
    custom = official(demand_kt=demand(BPN=80.0), parameters={"depot_large_kt": 400})
    solution = resolve(custom, inputs=inputs, candidates=[A])
    assert solution.status == "optimal"
    assert [f.size for f in rows(solution, "depot")] == ["large"]
    assert audit(custom, solution, inputs=inputs).passed


def test_floor_stays_a_lower_bound_when_small_plants_are_cheaper_to_run():
    inputs = line([700.0, 700.0])
    scenario = official(demand_kt=demand(BPN=200.0), parameters={
        "depot_large_kt": 1000, "refinery_small_var_usd_t": 20, "depot_small_var_usd_t": 1})
    p = build_problem(scenario, inputs, [A, B], RATE)
    result = solve_mix(p, 1, 1, 20)
    assert result["state"] == "proven"
    assert mix_floor(p, 1, 1) <= result["primal"] + 1e-6


def test_refinery_override_is_used_by_the_precheck():
    inputs = line([1500.0])
    assert "1,087.00 kt" in precheck(official(demand_kt=demand(BPN=240.0)), inputs, candidates=[A])
    custom = official(demand_kt=demand(BPN=240.0), parameters={"refinery_large_kt": 1500, "depot_large_kt": 1500})
    assert precheck(custom, inputs, candidates=[A]) is None


def test_a_size_that_stops_being_worthwhile_is_not_chosen():
    _, _, solution = micro(depot_small_capex_usd=4.25e6)
    assert [f.size for f in rows(solution, "depot")] == ["large"]


def test_baseline_follows_the_overrides_and_passes_the_audit():
    inputs = line([900.0, 900.0])
    scenario = official(demand_kt=demand(BPN=360.0), parameters={
        "depot_large_kt": 1000, "refinery_large_kt": 2000, "refinery_large_capex_usd": 500e6, "rate_depot_refinery": 0.2,
        "truck_depot_refinery_t": 25})
    solution = baseline(scenario, inputs=inputs)
    assert solution.status != "infeasible"
    assert audit(scenario, solution, inputs=inputs).passed


def test_audit_rejects_a_custom_run_checked_against_official_values():
    scenario, inputs, solution = micro(refinery_small_capex_usd=240e6, truck_supply_depot_t=3)
    report = audit(scenario.model_copy(update={"parameters": Parameters()}), solution, inputs=inputs)
    assert any(f.startswith("capex:") for f in report.failures)
    assert any(f.startswith("flow_metadata:") for f in report.failures)


def test_custom_runs_are_labelled_custom():
    assert "custom parameters" in micro(capex_years=10)[2].status_reason
    assert "custom parameters" not in micro()[2].status_reason
