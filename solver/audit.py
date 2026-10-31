"""Recompute network feasibility and economics independently of optimization."""

import math
from collections import defaultdict

from solver.contract import AuditReport
from solver.inputs import load_inputs

KT_TOL = 1e-6
USD_TOL = 0.01


def audit(scenario, solution, *, inputs=None) -> AuditReport:
    inputs = load_inputs() if inputs is None else inputs
    residuals = {}
    failures = []

    def check(family, residual, context, tol=KT_TOL):
        residual = abs(float(residual))
        if not math.isfinite(residual):
            residual = 1e100
        residuals[family] = max(residuals.get(family, 0.), residual)
        if residual > tol:
            failures.append(f"{family}: {context} (residual {residual:.12g})")

    def require(family, condition, context):
        check(family, 0 if condition else 1, context, tol=0)

    parameters = scenario.parameters
    capacity_kt, capex_usd = parameters.capacity_kt(), parameters.capex_usd()
    variable_usd_t, rates, truck_t = parameters.variable_opex_usd_t(), parameters.rates(), parameters.truck_t()
    capex_years, fixed_opex_share = parameters.capex_years, parameters.fixed_opex_share
    sites = {row["site_id"]: row for row in inputs.sites.to_dict("records")}
    airports = {row["iata"]: row for row in inputs.airports.to_dict("records")}
    nodes = {**sites, **airports}
    indices = {str(node): i for i, node in enumerate(inputs.node_ids)}
    check("scenario_hash", int(solution.scenario_hash != scenario.scenario_hash()), "scenario provenance", tol=0)
    check("data_hash", int(solution.data_hash != inputs.data_hash), "data provenance", tol=0)
    if solution.status in ("infeasible", "no_solution"):
        require("status", not solution.facilities and not solution.flows, "No network may accompany this status")
        return AuditReport(passed=not failures, max_residuals=residuals, failures=failures)

    facilities = {}
    for facility in solution.facilities:
        key = (facility.type, facility.site_id)
        require("identifiers", facility.site_id in nodes, f"facility {facility.site_id}")
        require("facility_selection", key not in facilities, f"one size per {key}")
        facilities[key] = facility
        site = sites.get(facility.site_id)
        eligible = bool(site and site["is_candidate"] and site["is_onshore"])
        if facility.type == "refinery" and facility.site_id in airports:
            eligible = True
        allowed = scenario.refinery_candidates if facility.type == "refinery" else scenario.depot_candidates
        if allowed is not None:
            eligible = eligible and facility.site_id in allowed
        require("facility_selection", eligible and facility.site_id not in scenario.excluded_ids, f"eligible {key}")
        capacity = capacity_kt[facility.type][facility.size]
        check("capacity", facility.capacity_kt - capacity, f"declared capacity {key}")
        expected_basis = "saf_out" if facility.type == "refinery" and scenario.capacity_basis == "saf_output" else "biomass_in"
        require("capacity", facility.capacity_basis == expected_basis, f"basis {key}")
        check("capex", facility.capex_usd - capex_usd[facility.type][facility.size], f"facility cost {key}", USD_TOL)
        if facility.site_id in nodes:
            node = nodes[facility.site_id]
            check("flow_metadata", facility.lat - node["lat"], f"latitude {key}")
            check("flow_metadata", facility.lon - node["lon"], f"longitude {key}")

    supply = defaultdict(float)
    depot_in, depot_out = defaultdict(float), defaultdict(float)
    ref_in, ref_out = defaultdict(float), defaultdict(float)
    delivered = defaultdict(float)
    logistics = 0.
    for flow in solution.flows:
        context = f"{flow.leg} {flow.from_id} -> {flow.to}"
        require("flow_nonnegative", math.isfinite(flow.kt) and flow.kt >= 0, context)
        require("flow_positive", math.isfinite(flow.kt) and flow.kt > 0, context)
        known = flow.from_id in nodes and flow.to in nodes
        require("identifiers", known, context)
        if not known or not math.isfinite(flow.kt):
            continue
        if flow.leg == "supply_depot":
            valid = flow.from_id in sites and ("depot", flow.to) in facilities
            supply[flow.from_id] += flow.kt
            depot_in[flow.to] += flow.kt
        elif flow.leg == "depot_refinery":
            valid = ("depot", flow.from_id) in facilities and ("refinery", flow.to) in facilities
            depot_out[flow.from_id] += flow.kt
            ref_in[flow.to] += flow.kt
        else:
            valid = ("refinery", flow.from_id) in facilities and flow.to in airports
            ref_out[flow.from_id] += flow.kt
            delivered[flow.to] += flow.kt
        require("facility_selection", valid, context + " endpoints")
        expected_commodity = "saf" if flow.leg == "refinery_airport" else "biomass"
        require("flow_metadata", flow.commodity == expected_commodity, context + " commodity")
        require("flow_metadata", flow.truck_t == truck_t[flow.leg], context + " truck")
        require("flow_metadata", flow.trips == math.ceil(flow.kt * 1000 / truck_t[flow.leg]), context + " trips")
        for side, node_id in (("from", flow.from_id), ("to", flow.to)):
            for coord in ("lat", "lon"):
                check("flow_metadata", getattr(flow, f"{side}_{coord}") - nodes[node_id][coord], context + f" {side}_{coord}")
        hav = float(inputs.hav_km[indices[flow.from_id], indices[flow.to]])
        km = hav * scenario.road_factor
        if scenario.distance_basis == "osrm" and "TRK" not in (flow.from_id, flow.to):
            km = max(float(inputs.road_km[indices[flow.from_id], indices[flow.to]]), hav)
        require("distance", flow.distance_basis == scenario.distance_basis, context + " basis")
        check("distance", flow.hav_km - hav, context + " haversine")
        check("distance", flow.road_factor - scenario.road_factor, context + " factor")
        check("distance", flow.km - km, context + " model km")
        if flow.road_km is not None:
            check("distance", flow.road_km - float(inputs.road_km[indices[flow.from_id], indices[flow.to]]), context + " reference road km")
        if flow.leg == "supply_depot":
            check("haul_limit", max(0., hav - scenario.haul_limit_km), context)
        check("rate", flow.rate_usd_per_t_km - rates[flow.leg], context, tol=1e-12)
        cost = flow.kt * 1000 * rates[flow.leg] * km
        check("cost", flow.cost_usd - cost, context, USD_TOL)
        logistics += cost

    stranded = defaultdict(float)
    for row in solution.stranded:
        require("identifiers", row.site_id in sites, f"stranded {row.site_id}")
        require("stranded", row.kt > 0, f"positive stranded {row.site_id}")
        require("stranded", row.site_id not in stranded, f"unique stranded {row.site_id}")
        stranded[row.site_id] += row.kt
        if row.site_id in sites:
            for coord in ("lat", "lon"):
                check("stranded", getattr(row, coord) - sites[row.site_id][coord], f"{row.site_id} {coord}")
    for node_id, site in sites.items():
        check("supply", max(0., supply[node_id] - site["kt"]), node_id)
        if scenario.collection_policy == "all":
            check("collection", supply[node_id] - site["kt"], node_id)
        check("stranded", supply[node_id] + stranded[node_id] - site["kt"], node_id)

    surplus = defaultdict(float)
    for row in solution.surplus:
        require("identifiers", row.site_id in nodes, f"surplus {row.site_id}")
        require("surplus", ("refinery", row.site_id) in facilities and row.kt > 0, row.site_id)
        require("surplus", row.site_id not in surplus, f"unique surplus {row.site_id}")
        surplus[row.site_id] += row.kt

    for (kind, node_id), facility in facilities.items():
        capacity = capacity_kt[kind][facility.size]
        if kind == "depot":
            check("depot_balance", scenario.depot_retention * depot_in[node_id] - depot_out[node_id], node_id)
            throughput = depot_in[node_id]
        else:
            output = ref_out[node_id] + surplus[node_id]
            check("refinery_yield", scenario.yield_fraction * ref_in[node_id] - output, node_id)
            throughput = output if scenario.capacity_basis == "saf_output" else ref_in[node_id]
        check("capacity", max(0., throughput - capacity), f"{kind} {node_id}")
        check("throughput", facility.throughput_kt - throughput, f"{kind} {node_id}")
        check("throughput", facility.utilisation - throughput / capacity, f"{kind} {node_id} utilisation")
    demand = scenario.airport_demand(sum(float(site["kt"]) for site in sites.values()))
    for airport in airports:
        check("demand", delivered[airport] - demand[airport], airport)

    capex = sum(capex_usd[f.type][f.size] for f in solution.facilities)
    if solution.total_annual_usd is None:
        total = capex + scenario.horizon_years * logistics
    else:
        intake = {"depot": depot_in, "refinery": ref_in}
        variable = 1000 * sum(variable_usd_t[f.type][f.size] * intake[f.type][f.site_id]
                              for f in solution.facilities)
        annual = capex / capex_years + capex * fixed_opex_share + variable + logistics
        total = scenario.horizon_years * annual
        check("totals", (solution.annualised_capex_usd or 0) - capex / capex_years, "annualised CapEx", USD_TOL)
        check("totals", (solution.fixed_opex_usd or 0) - capex * fixed_opex_share, "fixed OpEx", USD_TOL)
        check("totals", (solution.variable_opex_usd or 0) - variable, "variable OpEx", USD_TOL)
        check("totals", solution.total_annual_usd - annual, "annual total", USD_TOL)
    check("totals", solution.capex_usd - capex, "CapEx", USD_TOL)
    check("totals", solution.logistics_annual_usd - logistics, "annual logistics", USD_TOL)
    check("totals", solution.total_horizon_usd - total, "horizon total", USD_TOL)
    require("totals", solution.primal is not None, "feasible result has primal")
    if solution.primal is not None:
        check("totals", solution.primal - total, "primal", USD_TOL)
    return AuditReport(passed=not failures, max_residuals=residuals, failures=failures)
