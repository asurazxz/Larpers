"""Two-echelon capacitated facility location MILP for the Kalimantan SAF network.

Sets: sites i (80), onshore depots j (69), refinery candidates k (shortlist, airports included), airports a (4),
sizes s in {S, L}.

Variables: x_ij in [0, 1] share of site i sent to depot j; f_jk >= 0 biomass kt; g_ka >= 0 SAF kt; e_k >= 0 surplus SAF
at the gate, costless; zD_j,s and zR_k,s binary.

Minimise  sum CapEx * z + H * 1000 * [ r1 sum d_ij P_i x_ij + r2 sum d_jk f_jk + r3 sum d_ka g_ka ],
with d = haversine km * road factor and rates r = 0.10, 0.12, 0.08 USD/t/km. OpEx is not provided.

Subject to:
    Collection        sum_j x_ij = 1 (all) or <= 1 (optional)
    Depot balance     r * sum_i P_i x_ij = sum_k f_jk, r = depot retention
    Depot capacity    sum_i P_i x_ij <= sum_s C_D,s zD_j,s
    Yield balance     y * sum_j f_jk = sum_a g_ka + e_k
    Refinery capacity SAF basis: sum_a g_ka + e_k <= sum_s C_R,s zR_k,s; biomass basis: sum_j f_jk <= same
    Demand            sum_k g_ka = D_a
    Arcs              supply leg haversine <= 300 / 1.4 km; no depot-to-refinery limit
    Cuts              one size per site; x_ij <= sum_s zD_j,s; f_jk <= 300 r sum_s zR_k,s;
                      sum_j (zS_j + 2 zL_j) >= ceil(sum P / 150) under collection all;
                      sum_k zL_k = nL and sum_k zS_k = nS

The refinery mix (nL, nS) is fixed per MILP, which stops the LP buying fractional refineries. `resolve` solves every
mix that can still win, so "optimal" means every feasible mix was proven or validly skipped, among the N candidates.
"""
from __future__ import annotations

import argparse
import math
import os
import time
import uuid
from collections import defaultdict, deque
from concurrent.futures import FIRST_COMPLETED, ProcessPoolExecutor, wait
from dataclasses import dataclass

import pulp

from solver.candidates import SHORTLIST
from solver.contract import Scenario, Solution
from solver.inputs import load_inputs

RATE = (0.10, 0.12, 0.08)
HAUL_HAV_KM = 300 / 1.4
TRUCK_T = (9, 30, 32)
DEPOT_KT, DEPOT_USD = {"S": 150, "L": 300}, {"S": 2.25e6, "L": 4.5e6}
REFINERY_KT, REFINERY_USD = {"S": 500, "L": 1087}, {"S": 480e6, "L": 765e6}
SIZE_NAME = {"S": "small", "L": "large"}
MAX_SOLVE_S = 90
THREADS = 2
WORKERS = max(1, min(8, (os.cpu_count() or 2) // THREADS))
EPS = 1e-9
RESOLVED = {"proven", "infeasible", "skipped_capacity", "skipped_capex", "dominated"}
MIX_STATUS = {"proven": "optimal", "infeasible": "infeasible", "best_found": "best_found"}


@dataclass(frozen=True)
class Problem:
    """Plain data for one scenario, picklable so workers can build their own MILP."""
    supply: dict[str, float]
    depots: tuple[str, ...]
    refineries: tuple[str, ...]
    demand: dict[str, float]
    supply_km: dict[tuple[str, str], float]
    depot_km: dict[tuple[str, str], float]
    airport_km: dict[tuple[str, str], float]
    yield_: float
    retention: float
    horizon: float
    collect_all: bool
    biomass_basis: bool
    rates: tuple[float, float, float]


def build_problem(scenario: Scenario, inputs, candidates, rates=RATE) -> Problem:
    s = scenario.model_dump(by_alias=True)
    at = {n: i for i, n in enumerate(inputs.node_ids.tolist())}
    hav, road_factor = inputs.hav_km, s["road_factor"]
    supply = dict(zip(inputs.sites.site_id.tolist(), inputs.sites.kt.tolist()))
    airports = inputs.airports.iata.tolist()
    excluded = set(s["excluded_ids"])
    onshore = inputs.sites.site_id[inputs.sites.is_candidate].tolist()
    depots = tuple(j for j in onshore if j not in excluded)
    allowed = set(onshore) | set(airports)
    refineries = tuple(k for k in dict.fromkeys(candidates) if k in allowed and k not in excluded)
    y, r = s["yield"], s["depot_retention"]
    if s["demand_kt"] is None:
        total = y * r * sum(supply.values())
        demand = dict(zip(airports, (share * total for share in inputs.airports.demand_share.tolist())))
    else:
        demand = {a: float(s["demand_kt"][a]) for a in airports}
    km = lambda a, b: float(hav[at[a], at[b]]) * road_factor
    return Problem(
        supply=supply,
        depots=depots,
        refineries=refineries,
        demand=demand,
        supply_km={(i, j): km(i, j) for i in supply for j in depots if hav[at[i], at[j]] <= HAUL_HAV_KM},
        depot_km={(j, k): km(j, k) for j in depots for k in refineries},
        airport_km={(k, a): km(k, a) for k in refineries for a in airports},
        yield_=y,
        retention=r,
        horizon=s["horizon_years"],
        collect_all=s["collection_policy"] == "all",
        biomass_basis=s["capacity_basis"] == "biomass_input",
        rates=tuple(rates),
    )


def infeasible_reason(p: Problem) -> str | None:
    """Reasons that hold for every refinery mix, stated before any solve."""
    total = sum(p.demand.values())
    most = p.yield_ * p.retention * sum(p.supply.values())
    if total > most + EPS:
        return (f"Demand of {total:,.2f} kt exceeds the {most:,.2f} kt of SAF the sites can make "
                f"at yield {p.yield_:g} and retention {p.retention:g}")
    served = {i for i, _ in p.supply_km}
    if p.collect_all and (cut_off := sorted(set(p.supply) - served)):
        return f"No depot in range ({HAUL_HAV_KM:.1f} km straight-line) of {', '.join(cut_off)}"
    reachable = p.yield_ * p.retention * sum(p.supply[i] for i in served)
    if total > reachable + EPS:
        return f"Demand of {total:,.2f} kt exceeds the {reachable:,.2f} kt of SAF from sites with a depot in range"
    return None


def required_capacity(p: Problem) -> float:
    total = sum(p.demand.values())
    if p.collect_all:
        biomass = p.retention * sum(p.supply.values())
        return biomass if p.biomass_basis else p.yield_ * biomass
    return total / p.yield_ if p.biomass_basis else total


def depot_floor(p: Problem) -> float:
    """Cheapest depot CapEx any plan must pay: both sizes cost $2.25M per 150 kt."""
    q = sum(p.supply.values()) if p.collect_all else sum(p.demand.values()) / (p.yield_ * p.retention)
    return math.ceil(q / DEPOT_KT["S"] - EPS) * DEPOT_USD["S"]


def enumerate_mixes(n: int) -> list[dict]:
    mixes = [{"n_large": nl, "n_small": ns, "capex_usd": nl * REFINERY_USD["L"] + ns * REFINERY_USD["S"]}
             for nl in range(n + 1) for ns in range(n + 1 - nl)]
    return sorted(mixes, key=lambda m: (m["capex_usd"], m["n_large"]))


def _finite(v) -> float | None:
    return float(v) if v is not None and math.isfinite(v) else None


def solve_mix(p: Problem, n_large: int, n_small: int, time_limit: float, threads: int = THREADS, fixed=None) -> dict:
    """Solve one refinery mix and return a plain dict. `fixed` pins the facilities and re-solves only the flows."""
    started = time.monotonic()
    sizes = ("S", "L")
    m = pulp.LpProblem("saf", pulp.LpMinimize)
    x = {e: pulp.LpVariable(f"x{n}", 0, 1) for n, e in enumerate(p.supply_km)}
    f = {e: pulp.LpVariable(f"f{n}", 0) for n, e in enumerate(p.depot_km)}
    g = {e: pulp.LpVariable(f"g{n}", 0) for n, e in enumerate(p.airport_km)}
    spare = max(p.yield_ * p.retention * sum(p.supply.values()) - sum(p.demand.values()), 0.0)
    e_k = {k: pulp.LpVariable(f"e{n}", 0, spare) for n, k in enumerate(p.refineries)}
    zd = {(j, s): pulp.LpVariable(f"zd{n}{s}", cat="Binary") for n, j in enumerate(p.depots) for s in sizes}
    zr = {(k, s): pulp.LpVariable(f"zr{n}{s}", cat="Binary") for n, k in enumerate(p.refineries) for s in sizes}
    if fixed is not None:
        for variables, chosen in ((zd, fixed["depots"]), (zr, fixed["refineries"])):
            for key, v in variables.items():
                v.lowBound = v.upBound = 1 if key in chosen else 0

    r1, r2, r3 = p.rates
    capex = pulp.lpSum(DEPOT_USD[s] * v for (_, s), v in zd.items()) + pulp.lpSum(
        REFINERY_USD[s] * v for (_, s), v in zr.items())
    freight = (pulp.lpSum(1000 * r1 * p.supply_km[e] * p.supply[e[0]] * v for e, v in x.items())
               + pulp.lpSum(1000 * r2 * p.depot_km[e] * v for e, v in f.items())
               + pulp.lpSum(1000 * r3 * p.airport_km[e] * v for e, v in g.items()))
    m += capex + p.horizon * freight

    out_i, in_j, out_j, in_k, out_k, in_a = (defaultdict(list) for _ in range(6))
    for (i, j), v in x.items():
        out_i[i].append(v)
        in_j[j].append(p.supply[i] * v)
    for (j, k), v in f.items():
        out_j[j].append(v)
        in_k[k].append(v)
    for (k, a), v in g.items():
        out_k[k].append(v)
        in_a[a].append(v)

    for i in p.supply:
        share = pulp.lpSum(out_i[i])
        m += (share == 1) if p.collect_all else (share <= 1)
    for j in p.depots:
        inflow = pulp.lpSum(in_j[j])
        m += p.retention * inflow == pulp.lpSum(out_j[j])
        m += inflow <= pulp.lpSum(DEPOT_KT[s] * zd[j, s] for s in sizes)
        m += pulp.lpSum(zd[j, s] for s in sizes) <= 1
    for (i, j), v in x.items():
        m += v <= zd[j, "S"] + zd[j, "L"]
    for (j, k), v in f.items():
        m += v <= DEPOT_KT["L"] * p.retention * (zr[k, "S"] + zr[k, "L"])
    for k in p.refineries:
        out = pulp.lpSum(out_k[k]) + e_k[k]
        m += p.yield_ * pulp.lpSum(in_k[k]) == out
        m += (pulp.lpSum(in_k[k]) if p.biomass_basis else out) <= pulp.lpSum(REFINERY_KT[s] * zr[k, s] for s in sizes)
        m += pulp.lpSum(zr[k, s] for s in sizes) <= 1
    for a, kt in p.demand.items():
        m += pulp.lpSum(in_a[a]) == kt
    m += pulp.lpSum(zr[k, "L"] for k in p.refineries) == n_large
    m += pulp.lpSum(zr[k, "S"] for k in p.refineries) == n_small
    if p.collect_all:
        m += pulp.lpSum(zd[j, "S"] + 2 * zd[j, "L"] for j in p.depots) >= math.ceil(
            sum(p.supply.values()) / DEPOT_KT["S"] - EPS)

    m.solve(pulp.HiGHS(msg=False, timeLimit=max(time_limit, 0.1), gapRel=0.0, threads=threads))
    h = m.solverModel
    info = h.getInfo()
    model_status = h.modelStatusToString(h.getModelStatus())
    has_incumbent = m.sol_status in (pulp.LpSolutionOptimal, pulp.LpSolutionIntegerFeasible)
    if model_status == "Optimal":
        state = "proven"
    elif "nfeasible" in model_status:
        state = "infeasible"
    else:
        state = "best_found" if has_incumbent else "no_incumbent"
    result = {"n_large": n_large, "n_small": n_small, "state": state, "primal": None, "bound": None, "gap": None,
              "seconds": time.monotonic() - started, "model_status": model_status}
    if state == "infeasible":
        return result
    result["bound"] = _finite(info.mip_dual_bound) if fixed is None else _finite(info.objective_function_value)
    if not has_incumbent:
        return result
    value = lambda v: v.value() or 0.0
    result.update(
        primal=float(pulp.value(m.objective) or 0.0),
        gap=0.0 if state == "proven" else _finite(info.mip_gap),
        depots=[key for key, v in zd.items() if value(v) > 0.5],
        refineries=[key for key, v in zr.items() if value(v) > 0.5],
        x=[(*e, value(v)) for e, v in x.items() if value(v) > EPS],
        f=[(*e, value(v)) for e, v in f.items() if value(v) > EPS],
        g=[(*e, value(v)) for e, v in g.items() if value(v) > EPS],
        e=[(k, value(v)) for k, v in e_k.items() if value(v) > EPS],
    )
    return result


def _stop_workers(pool: ProcessPoolExecutor) -> None:
    """HiGHS cannot be cancelled from outside, so end the workers once their answers cannot matter."""
    processes = list((pool._processes or {}).values())
    pool.shutdown(wait=False, cancel_futures=True)
    for process in processes:
        process.terminate()


def run_portfolio(p: Problem, budget_s: float) -> list[dict]:
    """Solve every mix that can still win, in ascending CapEx, and report what happened to each one."""
    deadline = time.monotonic() + budget_s
    need, floor = required_capacity(p), depot_floor(p)
    mixes = enumerate_mixes(len(p.refineries))
    queue = deque()
    for mix in mixes:
        cap = mix["n_large"] * REFINERY_KT["L"] + mix["n_small"] * REFINERY_KT["S"]
        mix.update(state="not_run", primal=None, gap=None, seconds=None, bound=mix["capex_usd"] + floor)
        if cap < need - EPS:
            mix.update(state="skipped_capacity", bound=None)
        else:
            queue.append(mix)

    best = math.inf
    running = {}
    pool = ProcessPoolExecutor(max_workers=WORKERS)
    try:
        while queue or running:
            while queue and len(running) < WORKERS and time.monotonic() < deadline:
                mix = queue.popleft()
                if mix["bound"] >= best:
                    mix["state"] = "skipped_capex"
                    continue
                left = deadline - time.monotonic()
                running[pool.submit(solve_mix, p, mix["n_large"], mix["n_small"], left)] = mix
            if not running or (not queue and all(mix["bound"] >= best for mix in running.values())):
                break
            done, _ = wait(running, timeout=deadline + 5 - time.monotonic(), return_when=FIRST_COMPLETED)
            if not done:
                break
            for future in done:
                mix = running.pop(future)
                mix.update(future.result())
                if mix["primal"] is not None:
                    best = min(best, mix["primal"])
    finally:
        _stop_workers(pool)

    for mix in mixes:
        if mix["state"] in RESOLVED:
            continue
        if mix["bound"] is not None and mix["bound"] >= best:
            mix["state"] = "skipped_capex" if mix["state"] == "not_run" else "dominated"
    return mixes


def _nodes(inputs) -> dict[str, dict]:
    nodes = {r.site_id: {"label": r.label, "lat": float(r.lat), "lon": float(r.lon)}
             for r in inputs.sites.itertuples()}
    nodes.update({r.iata: {"label": f"{r.iata}, {r.name}", "lat": float(r.lat), "lon": float(r.lon)}
                  for r in inputs.airports.itertuples()})
    return nodes


def portfolio_row(mix: dict) -> dict:
    """One `portfolios[]` row: the contract's status, with the raw engine state kept in `reason`."""
    return {"n_large": mix["n_large"], "n_small": mix["n_small"], "capex_usd": mix["capex_usd"],
            "status": MIX_STATUS.get(mix["state"], "skipped"), "primal": mix["primal"], "bound": mix["bound"],
            "gap": mix["gap"], "solve_seconds": mix["seconds"] or 0, "reason": mix["state"]}


def _empty_solution(scenario, inputs, n_candidates, started, reason, portfolios=()) -> Solution:
    return Solution.model_validate({
        "run_id": uuid.uuid4().hex, "source": "live", "data_hash": inputs.data_hash,
        "scenario_hash": scenario.scenario_hash(), "status": "infeasible", "status_reason": reason,
        "primal": None, "bound": None, "gap": None, "n_candidates": n_candidates,
        "solve_seconds": time.monotonic() - started, "facilities": [], "flows": [], "stranded": [], "surplus": [],
        "capex_usd": 0.0, "logistics_annual_usd": 0.0, "total_horizon_usd": 0.0, "portfolios": list(portfolios),
    })


def _report(scenario, inputs, p: Problem, flows: dict) -> dict:
    """Turn solved values into flat rows. Every cost is recomputed here from kt, rate and km."""
    s = scenario.model_dump(by_alias=True)
    nodes = _nodes(inputs)
    at = {n: i for i, n in enumerate(inputs.node_ids.tolist())}
    rows = []

    def add(leg, n, commodity, a, b, kt):
        hav, road_factor = float(inputs.hav_km[at[a], at[b]]), s["road_factor"]
        km, road = hav * road_factor, float(inputs.road_km[at[a], at[b]])
        rows.append({
            "leg": leg, "commodity": commodity, "from": a, "to": b,
            "from_lat": nodes[a]["lat"], "from_lon": nodes[a]["lon"],
            "to_lat": nodes[b]["lat"], "to_lon": nodes[b]["lon"],
            "from_label": nodes[a]["label"], "to_label": nodes[b]["label"],
            "kt": kt, "hav_km": hav, "road_factor": road_factor, "km": km,
            "rate_usd_per_t_km": p.rates[n], "cost_usd": kt * 1000 * p.rates[n] * km,
            "truck_t": TRUCK_T[n], "trips": math.ceil(kt * 1000 / TRUCK_T[n]),
            "road_km": road if math.isfinite(road) else None,
        })

    collected = defaultdict(float)
    depot_in, gate_in, gate_out = defaultdict(float), defaultdict(float), defaultdict(float)
    for i, j, share in flows["x"]:
        kt = p.supply[i] * share
        collected[i] += kt
        depot_in[j] += kt
        add("supply_depot", 0, "biomass", i, j, kt)
    for j, k, kt in flows["f"]:
        gate_in[k] += kt
        add("depot_refinery", 1, "biomass", j, k, kt)
    for k, a, kt in flows["g"]:
        gate_out[k] += kt
        add("refinery_airport", 2, "saf", k, a, kt)
    for k, kt in flows["e"]:
        gate_out[k] += kt

    def facility(kind, site, size, cap, usd, basis, through):
        return {"site_id": site, **nodes[site], "type": kind, "size": SIZE_NAME[size], "capacity_kt": cap,
                "capacity_basis": basis, "throughput_kt": through, "utilisation": through / cap, "capex_usd": usd}

    refinery_basis, refinery_through = ("biomass_in", gate_in) if p.biomass_basis else ("saf_out", gate_out)
    facilities = [facility("depot", j, s, DEPOT_KT[s], DEPOT_USD[s], "biomass_in", depot_in[j])
                  for j, s in flows["depots"]]
    facilities += [facility("refinery", k, s, REFINERY_KT[s], REFINERY_USD[s], refinery_basis, refinery_through[k])
                   for k, s in flows["refineries"]]
    served = {i for i, _ in p.supply_km}
    stranded = [{"site_id": i, **nodes[i], "kt": kt - collected[i],
                 "reason": "not needed for demand" if i in served else "no depot in range"}
                for i, kt in p.supply.items() if kt - collected[i] > 1e-6]
    surplus = [{"site_id": k, "kt": kt} for k, kt in flows["e"]]
    capex = sum(row["capex_usd"] for row in facilities)
    logistics = sum(row["cost_usd"] for row in rows)
    total = capex + p.horizon * logistics
    return {"facilities": facilities, "flows": rows, "stranded": stranded, "surplus": surplus, "capex_usd": capex,
            "logistics_annual_usd": logistics, "total_horizon_usd": total, "primal": total}


def resolve(scenario: Scenario, inputs=None, candidates=None, rates=RATE) -> Solution:
    """Solve a scenario across all refinery mixes and label the result by what was actually proven."""
    started = time.monotonic()
    inputs = load_inputs() if inputs is None else inputs
    p = build_problem(scenario, inputs, SHORTLIST if candidates is None else candidates, rates)
    n = len(p.refineries)
    if reason := infeasible_reason(p):
        return _empty_solution(scenario, inputs, n, started, reason)

    budget = min(scenario.time_limit_s, MAX_SOLVE_S)
    mixes = run_portfolio(p, budget * 0.9)
    portfolios = [portfolio_row(mix) for mix in mixes]
    found = [mix for mix in mixes if mix["primal"] is not None]
    if not found:
        unresolved = any(mix["state"] not in RESOLVED for mix in mixes)
        reason = (f"Could not find a feasible network within {budget:g} s; this does not prove none exists"
                  if unresolved else f"No refinery mix among {n} candidates can serve this scenario")
        return _empty_solution(scenario, inputs, n, started, reason, portfolios)

    winner = min(found, key=lambda mix: mix["primal"])
    fixed = {"depots": set(winner["depots"]), "refineries": set(winner["refineries"])}
    clean = solve_mix(p, winner["n_large"], winner["n_small"], max(budget * 0.1, 5), fixed=fixed)
    report = _report(scenario, inputs, p, clean if clean["primal"] is not None else winner)

    open_bounds = [mix["bound"] for mix in mixes if mix["state"] not in RESOLVED and mix["bound"] is not None]
    bound = min([report["primal"], *open_bounds])
    proven = all(mix["state"] in RESOLVED for mix in mixes)
    primal = report["primal"]
    gap = 0.0 if proven else (primal - bound) / primal
    label = f"Optimal among {n} candidates" if proven else f"Best found, gap {gap:.2%}"
    return Solution.model_validate({
        "run_id": uuid.uuid4().hex, "source": "live", "data_hash": inputs.data_hash,
        "scenario_hash": scenario.scenario_hash(), "status": "optimal" if proven else "best_found",
        "status_reason": label, "bound": bound, "gap": gap, "n_candidates": n,
        "solve_seconds": time.monotonic() - started, "opex": "not_provided", "portfolios": portfolios, **report,
    })


def main() -> None:
    parser = argparse.ArgumentParser(description="Solve one scenario and print the result.")
    parser.add_argument("--horizon", type=float, default=1)
    parser.add_argument("--yield", dest="yield_", type=float, default=0.15)
    parser.add_argument("--road-factor", type=float, default=1.9)
    parser.add_argument("--time-limit", type=float, default=MAX_SOLVE_S)
    args = parser.parse_args()
    scenario = Scenario.model_validate({"yield": args.yield_, "road_factor": args.road_factor,
                                        "horizon_years": args.horizon, "time_limit_s": args.time_limit})
    solution = resolve(scenario)
    for mix in solution.model_dump(by_alias=True)["portfolios"]:
        primal = "-" if mix["primal"] is None else f"${mix['primal'] / 1e6:,.1f}M"
        lower = "-" if mix["bound"] is None else f"${mix['bound'] / 1e6:,.1f}M"
        print(f"  L{mix['n_large']:>2} S{mix['n_small']:>2}  capex ${mix['capex_usd'] / 1e6:>7,.0f}M  "
              f"{mix['reason']:<17} primal {primal:>11}  bound {lower:>11}")
    print(f"status     {solution.status} ({solution.status_reason})")
    print(f"objective  {solution.primal}")
    print(f"gap        {solution.gap}")
    print(f"bound      {solution.bound}")
    print(f"seconds    {solution.solve_seconds:.1f}")


if __name__ == "__main__":
    main()
