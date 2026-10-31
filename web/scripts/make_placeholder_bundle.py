"""Placeholder web/data/bundle.json from the team's greedy baseline, independently audited.

Stands in until solver/scenarios.py writes stored bundle v1. Run from the repo root:
    python web/scripts/make_placeholder_bundle.py
"""

from datetime import datetime, timezone
from pathlib import Path

from solver.audit import audit
from solver.baseline import baseline
from solver.contract import Scenario
from solver.inputs import load_inputs
from solver.scenarios import write_atomic

OUT = Path(__file__).resolve().parents[1] / "data" / "bundle.json"


def dump(model):
    return model.model_dump(mode="json", by_alias=True) if hasattr(model, "model_dump") else dict(model)


inputs = load_inputs()
scenario = Scenario()
result = baseline(scenario, inputs=inputs)
report = dump(audit(scenario, result, inputs=inputs))
solution = dump(result)
solution["validation"] = report
solved_at = datetime.now(timezone.utc).isoformat(timespec="seconds")

write_atomic(OUT, {
    "schema_version": 1,
    "label": "Greedy baseline only, placeholder until stored bundle v1",
    "data_hash": solution["data_hash"],
    "generated_at": solved_at,
    "runs": {
        "baseline": {
            "slug": "baseline",
            "family": "baseline",
            "label": "Greedy baseline (heuristic, audited)",
            "status": solution["status"],
            "solved_at": solved_at,
            "data_hash": solution["data_hash"],
            "scenario_hash": solution["scenario_hash"],
            "precomputed": True,
            "scenario": dump(scenario),
            "solution": solution,
        },
    },
})
print(f"{OUT}: status {solution['status']}, audit passed {report.get('passed')}, "
      f"{len(report.get('failures') or [])} failures, total {solution['total_horizon_usd']:,.0f} USD")
