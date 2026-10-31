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


class Scenario(ContractModel):
    demand_kt: dict[Literal["BPN", "PNK", "TRK", "PKN"], Annotated[Finite, Field(ge=0)]] | None = None
    yield_fraction: Finite = Field(default=0.20, alias="yield", gt=0, le=1)
    depot_retention: Finite = Field(default=1.0, gt=0, le=1)
    road_factor: Finite = Field(default=1.3, ge=1)
    horizon_years: Finite = Field(default=1, ge=1)
    collection_policy: Literal["all", "optional"] = "optional"
    capacity_basis: Literal["saf_output", "biomass_input"] = "biomass_input"
    excluded_ids: list[NodeId] = Field(default_factory=list)
    time_limit_s: Finite = Field(default=90, gt=0)

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

    def scenario_hash(self) -> str:
        payload = json.dumps(self.model_dump(mode="json", by_alias=True), sort_keys=True, separators=(",", ":"), allow_nan=False)
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
    truck_t: Literal[9, 30, 32]
    trips: int
    road_km: Finite | None = None


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
