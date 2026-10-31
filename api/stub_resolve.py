"""Explicitly labelled integration fixture while the optimizer is unavailable."""

from uuid import uuid4

from solver.contract import CONTRACTS, Scenario, Solution


def resolve(scenario: Scenario) -> Solution:
    fixture = Solution.model_validate_json((CONTRACTS / "fixture_solution.json").read_text())
    return fixture.model_copy(update={
        "run_id": str(uuid4()), "source": "fixture", "scenario_hash": scenario.scenario_hash(),
    })
