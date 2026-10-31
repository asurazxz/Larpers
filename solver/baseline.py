"""Prototype greedy baseline, with scenario semantics and complete flow records."""

import math
import time
from collections import defaultdict
from uuid import uuid4

from solver.audit import audit
from solver.contract import (
    AuditReport, Facility, Flow, Scenario, Solution, Stranded, Surplus,
)
from solver.inputs import load_inputs


def _haversine(a, b):
    la, lo, lb, lp = map(math.radians, (*a, *b))
    h = math.sin((lb-la)/2)**2 + math.cos(la)*math.cos(lb)*math.sin((lp-lo)/2)**2
    return 2*6371.0088*math.asin(math.sqrt(min(1., h)))


def baseline(scenario: Scenario, *, inputs=None) -> Solution:
    started = time.perf_counter()
    inputs = load_inputs() if inputs is None else inputs
    sites = {row["site_id"]: row for row in inputs.sites.to_dict("records")}
    airports = {row["iata"]: row for row in inputs.airports.to_dict("records")}
    nodes = {**sites, **airports}
    index = {str(node): i for i, node in enumerate(inputs.node_ids)}
    supply = {node: float(row["kt"]) for node, row in sites.items()}
    parameters = scenario.parameters
    capacity_kt, capex_usd = parameters.capacity_kt(), parameters.capex_usd()
    rates, truck_t = parameters.rates(), parameters.truck_t()
    depot_small, depot_large = capacity_kt["depot"]["small"], capacity_kt["depot"]["large"]
    refinery_small, refinery_large = capacity_kt["refinery"]["small"], capacity_kt["refinery"]["large"]
    onshore = [node for node, row in sites.items() if row["is_candidate"] and row["is_onshore"] and node not in scenario.excluded_ids]
    wanted_depots, wanted_refineries = scenario.depot_candidates, scenario.refinery_candidates
    depot_sites = onshore if wanted_depots is None else [node for node in onshore if node in wanted_depots]
    refinery_sites = onshore if wanted_refineries is None else [
        node for node in wanted_refineries if node in onshore or (node in airports and node != "TRK"
                                                                  and node not in scenario.excluded_ids)]
    result = Solution(
        run_id=str(uuid4()), source="baseline", data_hash=inputs.data_hash,
        scenario_hash=scenario.scenario_hash(), status="heuristic", primal=0,
        bound=None, gap=None, n_candidates=len(onshore), solve_seconds=0,
        facilities=[], flows=[], stranded=[], surplus=[], capex_usd=0,
        logistics_annual_usd=0, total_horizon_usd=0, validation=AuditReport(),
    )

    def stranded(node, amount, reason):
        row = sites[node]
        return Stranded(site_id=node, label=row["label"], lat=row["lat"], lon=row["lon"], kt=amount, reason=reason)

    def infeasible(reason):
        result.status = "infeasible"
        result.primal = None
        result.facilities = []
        result.flows = []
        result.surplus = []
        result.stranded = [stranded(node, amount, reason) for node, amount in supply.items() if amount > 0]
        result.capex_usd = result.logistics_annual_usd = result.total_horizon_usd = 0
        result.validation = AuditReport(passed=False, failures=[reason])
        result.solve_seconds = time.perf_counter() - started
        return result

    def distance(a, b):
        return float(inputs.hav_km[index[a], index[b]])

    def nearest(origin, candidates):
        return sorted(candidates, key=lambda node: (distance(origin, node), node))

    def emit(leg, source, dest, amount):
        if amount <= 0:
            return
        a, b = nodes[source], nodes[dest]
        hav = distance(source, dest)
        km = hav * scenario.road_factor
        if scenario.distance_basis == "osrm" and "TRK" not in (source, dest):
            km = max(float(inputs.road_km[index[source], index[dest]]), hav)
        truck = truck_t[leg]
        result.flows.append(Flow(
            leg=leg, commodity="saf" if leg == "refinery_airport" else "biomass",
            from_id=source, to=dest, from_lat=a["lat"], from_lon=a["lon"],
            to_lat=b["lat"], to_lon=b["lon"], from_label=a.get("label", a.get("name", source)),
            to_label=b.get("label", b.get("name", dest)), kt=amount, hav_km=hav,
            road_factor=scenario.road_factor, km=km, rate_usd_per_t_km=rates[leg],
            cost_usd=amount*1000*rates[leg]*km, truck_t=truck, distance_basis=scenario.distance_basis,
            trips=math.ceil(amount*1000/truck),
            road_km=float(inputs.road_km[index[source], index[dest]]),
        ))

    def facility(node, kind, size, throughput):
        row = nodes[node]
        capacity = capacity_kt[kind][size]
        basis = "saf_out" if kind == "refinery" and scenario.capacity_basis == "saf_output" else "biomass_in"
        result.facilities.append(Facility(
            site_id=node, label=row.get("label", row.get("name", node)), type=kind,
            size=size, lat=row["lat"], lon=row["lon"], capacity_kt=capacity,
            capacity_basis=basis, throughput_kt=throughput, utilisation=throughput/capacity,
            capex_usd=capex_usd[kind][size],
        ))

    # Preserve the prototype's descending-production seeds and whole-site assignment.
    unassigned = {node for node in sites if supply[node] > 0}
    depots = {}
    for seed in sorted(depot_sites, key=lambda node: (-supply[node], node)):
        if seed not in unassigned or supply[seed] > depot_large:
            continue
        members, amount = [seed], supply[seed]
        unassigned.remove(seed)
        for node in nearest(seed, unassigned):
            if distance(seed, node) <= scenario.haul_limit_km and amount + supply[node] <= depot_large:
                members.append(node)
                amount += supply[node]
                unassigned.remove(node)
        depots[seed] = (members, amount)
    for node in sorted(unassigned):
        room = [depot for depot, (_, amount) in depots.items() if amount + supply[node] <= depot_large and distance(node, depot) <= scenario.haul_limit_km]
        if room:
            depot = nearest(node, room)[0]
            members, amount = depots[depot]
            members.append(node)
            depots[depot] = (members, amount + supply[node])
        else:
            # The prototype omitted this haul check on offshore leftovers.
            available = [depot for depot in depot_sites if depot not in depots and distance(node, depot) <= scenario.haul_limit_km and supply[node] <= 300]
            if available:
                depots[nearest(node, available)[0]] = ([node], supply[node])
            elif scenario.collection_policy == "all":
                return infeasible(f"Greedy baseline could not collect {node} within the supply haul limit")
            else:
                result.stranded.append(stranded(node, supply[node], "No reachable depot with room in the greedy baseline"))

    collected = sum(amount for _, amount in depots.values())
    biomass = collected * scenario.depot_retention
    production = biomass * scenario.yield_fraction
    demand = scenario.airport_demand(sum(supply.values()))
    if sum(demand.values()) > production + 1e-9:
        return infeasible("Greedy baseline production is below airport demand")
    if not depots:
        result.validation = audit(scenario, result, inputs=inputs)
        result.solve_seconds = time.perf_counter() - started
        return result

    total_supply = sum(supply.values())
    centroid = tuple(sum(supply[node]*sites[node][coord] for node in sites)/total_supply for coord in ("lat", "lon"))
    if not refinery_sites:
        return infeasible("No eligible refinery candidate for the greedy baseline")
    primary = min(refinery_sites, key=lambda node: (_haversine((nodes[node]["lat"], nodes[node]["lon"]), centroid), node))
    required = production if scenario.capacity_basis == "saf_output" else biomass
    portfolios = []
    for n_large in range(1, min(len(refinery_sites), max(1, math.ceil(required/refinery_large))) + 1):
        n_small = max(0, math.ceil((required - n_large*refinery_large - 1e-9)/refinery_small))
        if n_large + n_small <= len(refinery_sites):
            portfolios.append((n_large*capex_usd["refinery"]["large"]+n_small*capex_usd["refinery"]["small"], n_large, n_small))
    if not portfolios:
        return infeasible("Not enough eligible sites for greedy refinery capacity")
    _, n_large, n_small = min(portfolios)
    additions = nearest("BPN", [node for node in refinery_sites if node != primary])
    refineries = [(primary, "large")]
    refineries += list(zip(additions, ["small"]*n_small + ["large"]*(n_large-1)))
    input_room = {node: capacity_kt["refinery"][size] / (scenario.yield_fraction if scenario.capacity_basis == "saf_output" else 1) for node, size in refineries}
    refinery_in = defaultdict(float)
    for depot, (members, amount) in depots.items():
        facility(depot, "depot", "small" if amount <= depot_small else "large", amount)
        for node in members:
            emit("supply_depot", node, depot, supply[node])
        remaining = amount * scenario.depot_retention
        for refinery in nearest(depot, input_room):
            taken = min(remaining, max(0., input_room[refinery]))
            emit("depot_refinery", depot, refinery, taken)
            refinery_in[refinery] += taken
            input_room[refinery] -= taken
            remaining -= taken
            if remaining <= 0:
                break
        if remaining > 1e-9:
            return infeasible("Greedy refinery allocation ran out of capacity")

    output_room = {node: refinery_in[node]*scenario.yield_fraction for node, _ in refineries}
    for airport, amount in demand.items():
        remaining = amount
        for refinery in nearest(airport, output_room):
            taken = min(remaining, max(0., output_room[refinery]))
            emit("refinery_airport", refinery, airport, taken)
            output_room[refinery] -= taken
            remaining -= taken
            if remaining <= 0:
                break
        if remaining > 1e-9:
            return infeasible("Greedy airport allocation ran out of SAF")
    result.surplus = [Surplus(site_id=node, kt=amount) for node, amount in output_room.items() if amount > 0]
    for node, size in refineries:
        throughput = refinery_in[node] * (scenario.yield_fraction if scenario.capacity_basis == "saf_output" else 1)
        facility(node, "refinery", size, throughput)
    result.capex_usd = sum(f.capex_usd for f in result.facilities)
    result.logistics_annual_usd = sum(f.cost_usd for f in result.flows)
    result.total_horizon_usd = result.capex_usd + scenario.horizon_years*result.logistics_annual_usd
    result.primal = result.total_horizon_usd
    result.validation = audit(scenario, result, inputs=inputs)
    result.solve_seconds = time.perf_counter() - started
    return result


if __name__ == "__main__":
    print(baseline(Scenario()).model_dump_json(by_alias=True, indent=2))
