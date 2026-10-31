"""Shared wire contract. Run this module to regenerate the JSON schema."""

import argparse
import hashlib
import json
from pathlib import Path
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

AIRPORT_SHARES = {"BPN": 0.558, "PNK": 0.317, "TRK": 0.075, "PKN": 0.050}
AIRPORT_DEMAND_KT = 300.0
SITE_IDS = frozenset(f"KAL_SUP_{i:02d}" for i in range(1, 81))
NODE_IDS = SITE_IDS | AIRPORT_SHARES.keys()
HAUL_HAV_KM = 300 / 1.4
RATES = {"supply_depot": 0.10, "depot_refinery": 0.12, "refinery_airport": 0.08}
TRUCK_T = {"supply_depot": 9, "depot_refinery": 30, "refinery_airport": 32}
CAPACITY_KT = {"depot": {"small": 150, "large": 300}, "refinery": {"small": 500, "large": 1087}}
CAPEX_USD = {"depot": {"small": 2_250_000, "large": 4_500_000}, "refinery": {"small": 480_000_000, "large": 765_000_000}}
CAPEX_YEARS, FIXED_OPEX_SHARE = 20, 0.05
VARIABLE_OPEX_USD_T = {"depot": {"small": 5, "large": 4}, "refinery": {"small": 60, "large": 55}}
Finite = Annotated[float, Field(allow_inf_nan=False)]
NodeId = Annotated[str, Field(pattern=r"^(KAL_SUP_(0[1-9]|[1-7][0-9]|80)|BPN|PNK|TRK|PKN)$")]


class ContractModel(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True, allow_inf_nan=False, validate_default=True)


class Parameters(ContractModel):
    """Organiser values from challenge3_parameters.xlsx are the defaults. Override any of them to test our own."""
    rate_supply_depot: Finite = Field(default=RATES["supply_depot"], ge=0)
    rate_depot_refinery: Finite = Field(default=RATES["depot_refinery"], ge=0)
    rate_refinery_airport: Finite = Field(default=RATES["refinery_airport"], ge=0)
    truck_supply_depot_t: Finite = Field(default=TRUCK_T["supply_depot"], gt=0)
    truck_depot_refinery_t: Finite = Field(default=TRUCK_T["depot_refinery"], gt=0)
    truck_refinery_airport_t: Finite = Field(default=TRUCK_T["refinery_airport"], gt=0)
    depot_small_kt: Finite = Field(default=CAPACITY_KT["depot"]["small"], gt=0)
    depot_large_kt: Finite = Field(default=CAPACITY_KT["depot"]["large"], gt=0)
    refinery_small_kt: Finite = Field(default=CAPACITY_KT["refinery"]["small"], gt=0)
    refinery_large_kt: Finite = Field(default=CAPACITY_KT["refinery"]["large"], gt=0)
    depot_small_capex_usd: Finite = Field(default=CAPEX_USD["depot"]["small"], ge=0)
    depot_large_capex_usd: Finite = Field(default=CAPEX_USD["depot"]["large"], ge=0)
    refinery_small_capex_usd: Finite = Field(default=CAPEX_USD["refinery"]["small"], ge=0)
    refinery_large_capex_usd: Finite = Field(default=CAPEX_USD["refinery"]["large"], ge=0)
    depot_small_var_usd_t: Finite = Field(default=VARIABLE_OPEX_USD_T["depot"]["small"], ge=0)
    depot_large_var_usd_t: Finite = Field(default=VARIABLE_OPEX_USD_T["depot"]["large"], ge=0)
    refinery_small_var_usd_t: Finite = Field(default=VARIABLE_OPEX_USD_T["refinery"]["small"], ge=0)
    refinery_large_var_usd_t: Finite = Field(default=VARIABLE_OPEX_USD_T["refinery"]["large"], ge=0)
    capex_years: Finite = Field(default=CAPEX_YEARS, gt=0)
    fixed_opex_share: Finite = Field(default=FIXED_OPEX_SHARE, ge=0)

    def rates(self) -> dict[str, float]:
        return {"supply_depot": self.rate_supply_depot, "depot_refinery": self.rate_depot_refinery,
                "refinery_airport": self.rate_refinery_airport}

    def truck_t(self) -> dict[str, float]:
        return {"supply_depot": self.truck_supply_depot_t, "depot_refinery": self.truck_depot_refinery_t,
                "refinery_airport": self.truck_refinery_airport_t}

    def _by_size(self, suffix: str) -> dict[str, dict[str, float]]:
        return {kind: {size: getattr(self, f"{kind}_{size}_{suffix}") for size in ("small", "large")}
                for kind in ("depot", "refinery")}

    def capacity_kt(self) -> dict[str, dict[str, float]]:
        return self._by_size("kt")

    def capex_usd(self) -> dict[str, dict[str, float]]:
        return self._by_size("capex_usd")

    def variable_opex_usd_t(self) -> dict[str, dict[str, float]]:
        return self._by_size("var_usd_t")


class Scenario(ContractModel):
    demand_kt: dict[Literal["BPN", "PNK", "TRK", "PKN"], Annotated[Finite, Field(ge=0)]] | None = None
    yield_fraction: Finite = Field(default=0.20, alias="yield", gt=0, le=1)
    depot_retention: Finite = Field(default=1.0, gt=0, le=1)
    road_factor: Finite = Field(default=1.3, ge=1)
    # "factor": haversine x road_factor (official). "osrm": OSRM car road km, never below haversine; TRK barge stays on factor.
    distance_basis: Literal["factor", "osrm"] = "factor"
    horizon_years: Finite = Field(default=1, ge=1)
    collection_policy: Literal["all", "optional"] = "optional"
    capacity_basis: Literal["saf_output", "biomass_input"] = "biomass_input"
    excluded_ids: list[NodeId] = Field(default_factory=list)
    time_limit_s: Finite = Field(default=90, gt=0)
    # Our own modelling choices, not organiser values. None keeps the 69 onshore depots and the frozen shortlist.
    haul_limit_km: Finite = Field(default=HAUL_HAV_KM, gt=0)
    refinery_candidates: list[NodeId] | None = None
    depot_candidates: list[NodeId] | None = None
    parameters: Parameters = Field(default_factory=Parameters)

    @field_validator("demand_kt")
    @classmethod
    def four_airports(cls, value):
        if value is not None and set(value) != set(AIRPORT_SHARES):
            raise ValueError("demand_kt must contain exactly BPN, PNK, TRK and PKN")
        return value

    @field_validator("excluded_ids")
    @classmethod
    def unique_exclusions(cls, value):
        return sorted(set(value))

    @field_validator("refinery_candidates", "depot_candidates")
    @classmethod
    def unique_candidates(cls, value):
        return None if value is None else sorted(set(value))

    def scenario_hash(self) -> str:
        fields = self.model_dump(mode="json", by_alias=True)
        # Settings left at their defaults stay out, so stored runs keep their hash.
        if self.haul_limit_km == HAUL_HAV_KM:
            del fields["haul_limit_km"]
        if self.distance_basis == "factor":
            del fields["distance_basis"]
        for name in ("refinery_candidates", "depot_candidates"):
            if fields[name] is None:
                del fields[name]
        if self.parameters == Parameters():
            del fields["parameters"]
        payload = json.dumps(fields, sort_keys=True, separators=(",", ":"), allow_nan=False)
        return hashlib.sha256(payload.encode()).hexdigest()

    def airport_demand(self, supply_kt: float) -> dict[str, float]:
        if self.demand_kt is not None:
            return dict(self.demand_kt)
        return {airport: AIRPORT_DEMAND_KT for airport in AIRPORT_SHARES}


def scenario_hash(scenario: Scenario) -> str:
    return scenario.scenario_hash()


class AuditReport(ContractModel):
    passed: bool = False
    max_residuals: dict[str, Finite] = Field(default_factory=dict)
    failures: list[str] = Field(default_factory=lambda: ["Not audited"])


class Facility(ContractModel):
    site_id: NodeId
    label: str
    type: Literal["depot", "refinery"]
    size: Literal["small", "large"]
    lat: Finite = Field(ge=-90, le=90)
    lon: Finite = Field(ge=-180, le=180)
    capacity_kt: Finite
    capacity_basis: Literal["biomass_in", "saf_out"]
    throughput_kt: Finite
    utilisation: Finite
    capex_usd: Finite


class Flow(ContractModel):
    leg: Literal["supply_depot", "depot_refinery", "refinery_airport"]
    commodity: Literal["biomass", "saf"]
    from_id: NodeId = Field(alias="from")
    to: NodeId
    from_lat: Finite = Field(ge=-90, le=90)
    from_lon: Finite = Field(ge=-180, le=180)
    to_lat: Finite = Field(ge=-90, le=90)
    to_lon: Finite = Field(ge=-180, le=180)
    from_label: str
    to_label: str
    kt: Finite
    hav_km: Finite
    road_factor: Finite
    km: Finite
    rate_usd_per_t_km: Finite
    cost_usd: Finite
    truck_t: Finite = Field(gt=0)
    trips: int
    road_km: Finite | None = None
    distance_basis: Literal["factor", "osrm"] = "factor"


class Stranded(ContractModel):
    site_id: NodeId
    label: str
    lat: Finite = Field(ge=-90, le=90)
    lon: Finite = Field(ge=-180, le=180)
    kt: Finite
    reason: str


class Surplus(ContractModel):
    site_id: NodeId
    kt: Finite


class Portfolio(ContractModel):
    n_large: int = Field(ge=0)
    n_small: int = Field(ge=0)
    status: Literal["optimal", "best_found", "infeasible", "heuristic", "skipped"]
    capex_usd: Finite | None = None
    primal: Finite | None = None
    bound: Finite | None = None
    gap: Finite | None = None
    solve_seconds: Finite = Field(default=0, ge=0)
    reason: str | None = None


class Solution(ContractModel):
    schema_version: Literal[1] = 1
    run_id: str
    source: Literal["live", "stored", "fixture", "baseline"]
    data_hash: str
    scenario_hash: str
    status: Literal["optimal", "best_found", "infeasible", "heuristic", "no_solution"]
    status_reason: str | None = None
    primal: Finite | None
    bound: Finite | None
    gap: Finite | None
    n_candidates: int = Field(ge=0)
    solve_seconds: Finite = Field(ge=0)
    facilities: list[Facility]
    flows: list[Flow]
    stranded: list[Stranded]
    surplus: list[Surplus]
    capex_usd: Finite
    logistics_annual_usd: Finite
    opex: Literal["not_provided", "included"] = "not_provided"
    annualised_capex_usd: Finite | None = None
    fixed_opex_usd: Finite | None = None
    variable_opex_usd: Finite | None = None
    total_annual_usd: Finite | None = None
    total_horizon_usd: Finite
    validation: AuditReport = Field(default_factory=AuditReport)
    portfolios: list[Portfolio] = Field(default_factory=list)


CONTRACTS = Path(__file__).resolve().parents[1] / "contracts"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    schema = Solution.model_json_schema(by_alias=True)
    schema_path = CONTRACTS / "solution.schema.json"
    if args.check:
        if json.loads(schema_path.read_text()) != schema:
            raise SystemExit("Stale solution schema: run python -m solver.contract")
        fixture = Solution.model_validate_json((CONTRACTS / "fixture_solution.json").read_text())
        if fixture.source != "fixture":
            raise SystemExit("Fixture must be explicitly labelled fixture")
        if sorted(flow.leg for flow in fixture.flows) != sorted(RATES):
            raise SystemExit("Fixture needs one flow per leg")
        if len(fixture.stranded) != 1 or len(fixture.surplus) != 1:
            raise SystemExit("Fixture needs one stranded site and one surplus")
        print("Contract schema and illustrative fixture validated")
    else:
        CONTRACTS.mkdir(exist_ok=True)
        schema_path.write_text(json.dumps(schema, indent=2) + "\n")


if __name__ == "__main__":
    main()
