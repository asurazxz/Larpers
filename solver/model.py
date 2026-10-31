"""Two-echelon capacitated facility location MILP for the Kalimantan SAF network, on the organisers' 12:45 update.

Sets: sites i (80), onshore depots j (69), refinery candidates k (shortlist; never TRK, which trucks cannot reach),
airports a (4), sizes s in {S, L}.

Variables: x_ij in [0, 1] share of site i sent to depot j; f_jk >= 0 biomass kt; g_ka >= 0 SAF kt; e_k >= 0 surplus SAF
at the gate, costless; zD_j,s and zR_k,s binary; qD_j,s and qR_k,s >= 0 biomass intake kt by size.

Minimise H * [ sum 0.10 CapEx z + 1000 sum v q + 1000 ( r1 sum d_ij P_i x_ij + r2 sum d_jk f_jk + r3 sum d_ka g_ka ) ],
one year by default. 0.10 is CapEx / 20 years plus fixed OpEx of 5% of CapEx. v is variable OpEx per tonne in: depot $5/$4,
refinery $60/$55 (small/large). d = haversine km * road factor, rates r = 0.10, 0.12, 0.08 USD/t/km; the Tarakan barge
uses the same rate and distance rule.

Subject to:
    Collection        sum_j x_ij = 1 (all) or <= 1 (optional, the official default)
    Depot balance     r * sum_i P_i x_ij = sum_k f_jk, r = depot retention (official 1)
    Depot intake      sum_i P_i x_ij = sum_s qD_j,s; qD_j,s <= C_D,s zD_j,s
    Yield balance     y * sum_j f_jk = sum_a g_ka + e_k
    Refinery intake   sum_j f_jk = sum_s qR_k,s; qR_k,s <= C_R,s zR_k,s (C / y on the old SAF-output basis)
    Demand            sum_k g_ka = D_a, 300 kt each by default
    Arcs              supply leg haversine <= 300 / 1.4 km, our stated assumption; no depot-to-refinery limit
    Cuts              one size per site; x_ij <= sum_s zD_j,s; f_jk <= 300 r sum_s zR_k,s; g_ka <= D_a sum_s zR_k,s;
                      sum_j (zS_j + 2 zL_j) >= ceil(Q / 150), Q the biomass that must pass the depots;
                      sum_k zL_k = nL and sum_k zS_k = nS

Variable OpEx differs by size, so a large depot is no longer two small ones and throughput must be split by size.

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
from concurrent.futures.process import BrokenProcessPool
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
CAPEX_YEARS, FIXED_OPEX_SHARE = 20, 0.05
ANNUAL_FIXED_SHARE = 1 / CAPEX_YEARS + FIXED_OPEX_SHARE
DEPOT_VAR_USD_T, REFINERY_VAR_USD_T = {"S": 5, "L": 4}, {"S": 60, "L": 55}
AIRPORT_DEMAND_KT = 300
NO_TRUCK_ACCESS = {"TRK"}
SIZE_NAME = {"S": "small", "L": "large"}
MAX_SOLVE_S = 90
THREADS = 2
CORES = os.cpu_count() or 2
WORKERS = max(1, min(5, CORES // THREADS))
LEAD_THREADS = max(THREADS, min(7, CORES - THREADS * (WORKERS - 1)))
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
    allowed = (set(onshore) | set(airports)) - NO_TRUCK_ACCESS
    refineries = tuple(k for k in dict.fromkeys(candidates) if k in allowed and k not in excluded)
    y, r = s["yield"], s["depot_retention"]
    if s["demand_kt"] is None:
        demand = {a: float(AIRPORT_DEMAND_KT) for a in airports}
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


def refinery_intake(p: Problem) -> float:
    """Biomass kt every plan must feed its refineries."""
    if p.collect_all:
        return p.retention * sum(p.supply.values())
    return sum(p.demand.values()) / p.yield_


def mix_floor(p: Problem, n_large: int, n_small: int) -> float:
    """Lower bound on any plan with this mix: its fixed charges, then the cheapest OpEx for the biomass it must take."""
    intake = refinery_intake(p)
    large_kt = n_large * REFINERY_KT["L"] / (1 if p.biomass_basis else p.yield_)
    variable = REFINERY_VAR_USD_T["L"] * min(intake, large_kt) + REFINERY_VAR_USD_T["S"] * max(intake - large_kt, 0)
    refineries = ANNUAL_FIXED_SHARE * (n_large * REFINERY_USD["L"] + n_small * REFINERY_USD["S"]) + 1000 * variable
    per_kt = min(ANNUAL_FIXED_SHARE * DEPOT_USD[s] / DEPOT_KT[s] + 1000 * DEPOT_VAR_USD_T[s] for s in DEPOT_KT)
    return p.horizon * (refineries + per_kt * intake / p.retention)


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
    intake_kt = {s: REFINERY_KT[s] / (1 if p.biomass_basis else p.yield_) for s in sizes}
    m = pulp.LpProblem("saf", pulp.LpMinimize)
    x = {e: pulp.LpVariable(f"x{n}", 0, 1) for n, e in enumerate(p.supply_km)}
    f = {e: pulp.LpVariable(f"f{n}", 0) for n, e in enumerate(p.depot_km)}
    g = {e: pulp.LpVariable(f"g{n}", 0) for n, e in enumerate(p.airport_km)}
    spare = max(p.yield_ * p.retention * sum(p.supply.values()) - sum(p.demand.values()), 0.0)
    e_k = {k: pulp.LpVariable(f"e{n}", 0, spare) for n, k in enumerate(p.refineries)}
    zd = {(j, s): pulp.LpVariable(f"zd{n}{s}", cat="Binary") for n, j in enumerate(p.depots) for s in sizes}
    zr = {(k, s): pulp.LpVariable(f"zr{n}{s}", cat="Binary") for n, k in enumerate(p.refineries) for s in sizes}
    qd = {(j, s): pulp.LpVariable(f"qd{n}{s}", 0, DEPOT_KT[s]) for n, j in enumerate(p.depots) for s in sizes}
    qr = {(k, s): pulp.LpVariable(f"qr{n}{s}", 0, intake_kt[s]) for n, k in enumerate(p.refineries) for s in sizes}
    if fixed is not None:
        for variables, chosen in ((zd, fixed["depots"]), (zr, fixed["refineries"])):
            for key, v in variables.items():
                v.lowBound = v.upBound = 1 if key in chosen else 0

    r1, r2, r3 = p.rates
    charges = ANNUAL_FIXED_SHARE * (pulp.lpSum(DEPOT_USD[s] * v for (_, s), v in zd.items()) + pulp.lpSum(
        REFINERY_USD[s] * v for (_, s), v in zr.items()))
    variable = (pulp.lpSum(1000 * DEPOT_VAR_USD_T[s] * v for (_, s), v in qd.items())
                + pulp.lpSum(1000 * REFINERY_VAR_USD_T[s] * v for (_, s), v in qr.items()))
    freight = (pulp.lpSum(1000 * r1 * p.supply_km[e] * p.supply[e[0]] * v for e, v in x.items())
               + pulp.lpSum(1000 * r2 * p.depot_km[e] * v for e, v in f.items())
               + pulp.lpSum(1000 * r3 * p.airport_km[e] * v for e, v in g.items()))
    m += p.horizon * (charges + variable + freight)

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
        m += inflow == pulp.lpSum(qd[j, s] for s in sizes)
        for s in sizes:
            m += qd[j, s] <= DEPOT_KT[s] * zd[j, s]
        m += pulp.lpSum(zd[j, s] for s in sizes) <= 1
    for (i, j), v in x.items():
        m += v <= zd[j, "S"] + zd[j, "L"]
    for (j, k), v in f.items():
        m += v <= DEPOT_KT["L"] * p.retention * (zr[k, "S"] + zr[k, "L"])
    for (k, a), v in g.items():
        m += v <= p.demand[a] * (zr[k, "S"] + zr[k, "L"])
    for k in p.refineries:
        intake = pulp.lpSum(in_k[k])
        m += p.yield_ * intake == pulp.lpSum(out_k[k]) + e_k[k]
        m += intake == pulp.lpSum(qr[k, s] for s in sizes)
        for s in sizes:
            m += qr[k, s] <= intake_kt[s] * zr[k, s]
        m += pulp.lpSum(zr[k, s] for s in sizes) <= 1
    for a, kt in p.demand.items():
        m += pulp.lpSum(in_a[a]) == kt
    m += pulp.lpSum(zr[k, "L"] for k in p.refineries) == n_large
    m += pulp.lpSum(zr[k, "S"] for k in p.refineries) == n_small
    must_pass = sum(p.supply.values()) if p.collect_all else refinery_intake(p) / p.retention
    m += pulp.lpSum(zd[j, "S"] + 2 * zd[j, "L"] for j in p.depots) >= math.ceil(must_pass / DEPOT_KT["S"] - EPS)

    limit = max(time_limit - (time.monotonic() - started), 0.1)
    m.solve(pulp.HiGHS(msg=False, timeLimit=limit, gapRel=0.0, threads=threads))
    h = m.solverModel
    info = h.getInfo()
    model_status = h.modelStatusToString(h.getModelStatus())
    has_incumbent = m.sol_status in (pulp.LpSolutionOptimal, pulp.LpSolutionIntegerFeasible)
    if model_status == "Optimal":
        state = "proven"
    elif "nfeasible" in model_status:
        state = "infeasible"
    elif model_status == "Time limit reached":
        state = "best_found" if has_incumbent else "no_incumbent"
    else:
        raise RuntimeError(f"HiGHS stopped with status {model_status!r}")
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


def _submit_mix(pool, p: Problem, mix: dict, left: float, threads: int):
    return pool.submit(solve_mix, p, mix["n_large"], mix["n_small"], left, threads)


def run_portfolio(p: Problem, budget_s: float, grace_s: float = 2.0) -> list[dict]:
    """Solve every mix that can still win, lowest floor first, and report what happened to each one."""
    deadline = time.monotonic() + budget_s
    need = required_capacity(p)
    mixes = enumerate_mixes(len(p.refineries))
    waiting = []
    for mix in mixes:
        cap = mix["n_large"] * REFINERY_KT["L"] + mix["n_small"] * REFINERY_KT["S"]
        floor = mix_floor(p, mix["n_large"], mix["n_small"])
        mix.update(state="not_run", primal=None, gap=None, seconds=None, bound=floor)
        if cap < need - EPS:
            mix.update(state="skipped_capacity", bound=None)
        else:
            waiting.append(mix)
    queue = deque(sorted(waiting, key=lambda mix: mix["bound"]))

    best = math.inf
    running = {}
    threads = LEAD_THREADS
    pool = ProcessPoolExecutor(max_workers=WORKERS, max_tasks_per_child=1)
    try:
        while queue or running:
            while queue and len(running) < WORKERS and time.monotonic() < deadline:
                mix = queue.popleft()
                if mix["bound"] >= best:
                    mix["state"] = "skipped_capex"
                    continue
                try:
                    running[_submit_mix(pool, p, mix, deadline - time.monotonic(), threads)] = mix
                except BrokenProcessPool:
                    mix["state"] = "failed"
                    queue.clear()
                    break
                threads = THREADS
            if not running or all(mix["bound"] >= best for mix in running.values()):
                break
            done, _ = wait(running, timeout=max(deadline + grace_s - time.monotonic(), 0),
                           return_when=FIRST_COMPLETED)
            if not done:
                break
            broken = False
            for future in done:
                mix = running.pop(future)
                floor = mix["bound"]
                try:
                    result = future.result()
                except BrokenProcessPool:
                    mix["state"] = "failed"
                    broken = True
                    continue
                except Exception as error:
                    mix.update(state="failed", error=repr(error))
                    continue
                mix.update(result)
                if mix["state"] != "infeasible":
                    mix["bound"] = floor if result["bound"] is None else max(floor, result["bound"])
                if mix["primal"] is not None:
                    best = min(best, mix["primal"])
            if broken:
                for other in running.values():
                    other["state"] = "failed"
                running.clear()
                queue.clear()
    finally:
        _stop_workers(pool)

    for mix in mixes:
        if mix["state"] not in RESOLVED and mix["bound"] is not None and mix["bound"] >= best:
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


def _empty_solution(scenario, inputs, n_candidates, started, reason, portfolios=(), status="infeasible") -> Solution:
    return Solution.model_validate({
        "run_id": uuid.uuid4().hex, "source": "live", "data_hash": inputs.data_hash,
        "scenario_hash": scenario.scenario_hash(), "status": status, "status_reason": reason,
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
    variable = 1000 * (sum(DEPOT_VAR_USD_T[size] * depot_in[j] for j, size in flows["depots"])
                       + sum(REFINERY_VAR_USD_T[size] * gate_in[k] for k, size in flows["refineries"]))
    annual = capex * ANNUAL_FIXED_SHARE + variable + logistics
    return {"facilities": facilities, "flows": rows, "stranded": stranded, "surplus": surplus, "capex_usd": capex,
            "logistics_annual_usd": logistics, "annualised_capex_usd": capex / CAPEX_YEARS,
            "fixed_opex_usd": capex * FIXED_OPEX_SHARE, "variable_opex_usd": variable, "total_annual_usd": annual,
            "total_horizon_usd": p.horizon * annual, "primal": p.horizon * annual}


def resolve(scenario: Scenario, inputs=None, candidates=None, rates=RATE) -> Solution:
    """Solve a scenario across all refinery mixes and label the result by what was actually proven."""
    started = time.monotonic()
    inputs = load_inputs() if inputs is None else inputs
    p = build_problem(scenario, inputs, SHORTLIST if candidates is None else candidates, rates)
    n = len(p.refineries)
    if reason := infeasible_reason(p):
        return _empty_solution(scenario, inputs, n, started, reason)

    budget = min(scenario.time_limit_s, MAX_SOLVE_S)
    reserve = min(7.0, budget * 0.2)
    mixes = run_portfolio(p, budget - reserve, grace_s=reserve * 0.3)
    portfolios = [portfolio_row(mix) for mix in mixes]
    found = [mix for mix in mixes if mix["primal"] is not None]
    if not found:
        if any(mix["state"] not in RESOLVED for mix in mixes):
            reason = f"Could not find a feasible network within {budget:g} s; this does not prove none exists"
            return _empty_solution(scenario, inputs, n, started, reason, portfolios, status="no_solution")
        reason = f"No feasible network among {n} refinery candidates"
        return _empty_solution(scenario, inputs, n, started, reason, portfolios)

    winner = min(found, key=lambda mix: mix["primal"])
    fixed = {"depots": set(winner["depots"]), "refineries": set(winner["refineries"])}
    try:
        clean = solve_mix(p, winner["n_large"], winner["n_small"], max(reserve * 0.7, 0.1), fixed=fixed)
    except Exception:
        clean = winner
    report = _report(scenario, inputs, p, clean if clean["primal"] is not None else winner)

    proven = all(mix["state"] in RESOLVED for mix in mixes)
    primal = report["primal"]
    open_bounds = [mix["bound"] for mix in mixes if mix["state"] not in RESOLVED and mix["bound"] is not None]
    bound = primal if proven else min([primal, *open_bounds])
    gap = (primal - bound) / primal if primal else 0.0
    label = f"Optimal among {n} candidates" if proven else f"Best found, gap {gap:.2%}"
    return Solution.model_validate({
        "run_id": uuid.uuid4().hex, "source": "live", "data_hash": inputs.data_hash,
        "scenario_hash": scenario.scenario_hash(), "status": "optimal" if proven else "best_found",
        "status_reason": label, "bound": bound, "gap": gap, "n_candidates": n,
        "solve_seconds": time.monotonic() - started, "opex": "included", "portfolios": portfolios, **report,
    })


def main() -> None:
    parser = argparse.ArgumentParser(description="Solve one scenario and print the result.")
    parser.add_argument("--horizon", type=float, default=1)
    parser.add_argument("--yield", dest="yield_", type=float, default=0.20)
    parser.add_argument("--road-factor", type=float, default=1.3)
    parser.add_argument("--time-limit", type=float, default=MAX_SOLVE_S)
    args = parser.parse_args()
    scenario = Scenario.model_validate({"yield": args.yield_, "road_factor": args.road_factor,
                                        "horizon_years": args.horizon, "time_limit_s": args.time_limit,
                                        "collection_policy": "optional", "capacity_basis": "biomass_input"})
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
