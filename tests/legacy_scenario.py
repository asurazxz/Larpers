"""Pre-update scenario defaults, for tests of code that has not moved to the 12:45 update yet (the baseline)."""
from typing import Literal

from pydantic import Field

from solver.contract import AIRPORT_SHARES, Finite, Scenario


class LegacyScenario(Scenario):
    yield_fraction: Finite = Field(default=0.15, alias="yield", gt=0, le=1)
    road_factor: Finite = Field(default=1.9, ge=1)
    collection_policy: Literal["all", "optional"] = "all"
    capacity_basis: Literal["saf_output", "biomass_input"] = "saf_output"

    def airport_demand(self, supply_kt: float) -> dict[str, float]:
        if self.demand_kt is not None:
            return dict(self.demand_kt)
        total = supply_kt * self.depot_retention * self.yield_fraction
        return {airport: share * total for airport, share in AIRPORT_SHARES.items()}
