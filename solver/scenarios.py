"""Stored runs: solve, audit and write web/data/bundle.json, keyed by slug.

Run from the repo root: python -m solver.scenarios [--tiers T1,T2,T3]
Tiers run in order, so a time cut drops the last tier only. A failed audit is
never written; infeasible is a stored result. Resume skips slugs whose stored
data_hash matches the current one.

python -m solver.scenarios --stub --out <path outside web/> exercises the
pipeline with a stub resolve, so stub output never looks stored.
"""

import argparse
import hashlib
import json
import os
import random
import tempfile
import time
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

from solver import sensitivity
from solver.sensitivity import as_dict

ROOT = Path(__file__).resolve().parent.parent
BUNDLE = ROOT / "web" / "data" / "bundle.json"
WEB = ROOT / "web"
FIXTURE = ROOT / "contracts" / "fixture_solution.json"

TIERS = ("T1", "T2", "T3")
SOLVED = ("optimal", "best_found", "heuristic")
TOP_DEPOTS = 10
STRESS_SEED = 2026
STRESS_N = 20
STRESS_TIME_LIMIT_S = 60
SCHEMA_VERSION = 1

# Our settings before the organisers' 12:45 update, kept as one labelled sensitivity run.
# Demand is the earlier production-derived split at 15% of 6,800 kt.
EARLIER_ASSUMPTIONS = {
    "yield": 0.15,
    "road_factor": 1.9,
    "collection_policy": "all",
    "capacity_basis": "saf_output",
    "demand_kt": {"BPN": 569.16, "PNK": 323.34, "TRK": 76.5, "PKN": 51.0},
}


def official_base(parameters):
    """Scenario fields fixed by the organisers' 12:45 update; empty when no parameters are loaded."""
    if not parameters:
        return {}
    return {
        "yield": parameters["yield"],
        "road_factor": parameters["road_factor"],
        "depot_retention": parameters["depot_retention"],
        "collection_policy": parameters["collection_policy"],
        "capacity_basis": parameters["capacity_basis"],
        "demand_kt": dict(parameters["demand_kt"]),
    }


@dataclass(frozen=True)
class RunSpec:
    slug: str
    family: str
    tier: str
    overrides: dict = field(default_factory=dict)
    kind: str = "resolve"  # or "baseline"


BASE = RunSpec("base", "base", "T1")


def tier_specs(tier, base_solution, sites):
    """Runs for one tier, in order. Removal runs need the base solution; without it they are skipped."""
    depots = sensitivity.depots_by_throughput(base_solution) if base_solution else []
    if tier == "T1":
        specs = [
            BASE,
            RunSpec("baseline", "baseline", "T1", kind="baseline"),
            RunSpec("earlier_assumptions", "our_assumptions", "T1", EARLIER_ASSUMPTIONS),
            # OSRM car road km instead of the official 1.3 factor; a sensitivity, never the base case.
            RunSpec("road_matrix", "distance_basis", "T1", {"distance_basis": "osrm"}),
        ]
        refineries = sensitivity.facilities_of(base_solution, "refinery") if base_solution else []
        specs += [
            RunSpec(f"no_refinery_{f['site_id']}", "disruption", "T1", {"excluded_ids": [f["site_id"]]})
            for f in refineries
        ]
        return specs
    if tier == "T2":
        specs = [RunSpec(slug, "sensitivity", "T2", o) for slug, o in sensitivity.grid_overrides()]
        specs += [RunSpec(slug, "district_lost", "T2", o) for slug, o in sensitivity.district_lost_overrides(sites)]
        specs += [
            RunSpec(f"no_depot_{d}", "disruption", "T2", {"excluded_ids": [d]}) for d in depots[:TOP_DEPOTS]
        ]
        specs.append(RunSpec("collect_all", "collection", "T2", {"collection_policy": "all"}))
        return specs
    if tier == "T3":
        specs = [RunSpec(f"no_depot_{d}", "disruption", "T3", {"excluded_ids": [d]}) for d in depots[TOP_DEPOTS:]]
        specs.append(RunSpec("saf_output", "capacity_basis", "T3", {"capacity_basis": "saf_output"}))
        return specs
    raise ValueError(f"unknown tier {tier}")


def stress_scenarios(seed, candidate_ids, demand_kt):
    """20 random scenarios around the official base with a fixed seed, plus one deliberately infeasible case."""
    rng = random.Random(seed)
    out = []
    for n in range(STRESS_N):
        scale = round(rng.uniform(0.5, 1.0), 3)
        payload = {
            "yield": round(rng.uniform(0.15, 0.25), 4),
            "road_factor": rng.choice((1.3, 1.6, 1.9)),
            "collection_policy": rng.choice(("optional", "all")),
            "capacity_basis": rng.choice(("biomass_input", "saf_output")),
            "excluded_ids": sorted(rng.sample(list(candidate_ids), rng.randint(0, 3))),
            "demand_kt": {a: round(d * scale, 3) for a, d in demand_kt.items()},
            "time_limit_s": STRESS_TIME_LIMIT_S,
        }
        out.append((f"stress_{n:02d}", payload))
    # 4,000 kt SAF needs 20,000 kt biomass at 20%: far above the 6,800 kt supply.
    out.append(("stress_infeasible", {"demand_kt": {a: 1000.0 for a in demand_kt}, "time_limit_s": STRESS_TIME_LIMIT_S}))
    return out


def load_bundle(path):
    path = Path(path)
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return {}


def write_atomic(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(data, fh, indent=1, sort_keys=False)
            fh.write("\n")
        os.replace(tmp, path)
    except BaseException:
        if os.path.exists(tmp):
            os.remove(tmp)
        raise


def _now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class Runner:
    """Runs specs through solve, audit and an atomic bundle write."""

    def __init__(self, *, out, inputs, resolve_fn, baseline_fn, audit_fn, scenario_fn, stub=False, clock=_now,
                 log=print, solver_version=None, fresh=False):
        self.out = Path(out)
        self.inputs = inputs
        self.data_hash = inputs.data_hash
        self.solver_version = solver_version
        self.resolve_fn = resolve_fn
        self.baseline_fn = baseline_fn
        self.audit_fn = audit_fn
        self.scenario_fn = scenario_fn
        self.stub = stub
        self.clock = clock
        self.log = log
        self.base_overrides = official_base(getattr(inputs, "parameters", None))
        self.bundle = {} if fresh else load_bundle(self.out)
        self.bundle.setdefault("runs", {})
        self.table = []  # (tier, family, slug, outcome)

    def _fresh(self, slug, payload):
        """A stored run is reused only if its data, its full scenario and the solver version all match."""
        entry = self.bundle["runs"].get(slug)
        if entry is None or entry.get("data_hash") != self.data_hash:
            return False
        if entry.get("solver_version") != self.solver_version:
            return False
        return entry.get("scenario") == as_dict(self.scenario_fn(payload))

    def _solve(self, kind, payload):
        scenario = self.scenario_fn(payload)
        fn = self.baseline_fn if kind == "baseline" else self.resolve_fn
        solution = fn(scenario)
        report = as_dict(self.audit_fn(scenario, solution))
        return scenario, as_dict(solution), report

    def run(self, spec):
        payload = {**self.base_overrides, **spec.overrides}
        if self._fresh(spec.slug, payload):
            self.table.append((spec.tier, spec.family, spec.slug, "resumed"))
            return self.bundle["runs"][spec.slug]
        started = time.monotonic()
        scenario, solution, report = self._solve(spec.kind, payload)
        if not report.get("passed"):
            self.table.append((spec.tier, spec.family, spec.slug, "audit_failed"))
            self.log(f"  {spec.slug}: audit failed, not written: {report.get('failures')}")
            return None
        solution["validation"] = report
        solution["source"] = "stub" if self.stub else "stored"
        entry = {
            "slug": spec.slug,
            "family": spec.family,
            "tier": spec.tier,
            "status": solution.get("status"),
            "solved_at": self.clock(),
            "data_hash": self.data_hash,
            "solver_version": self.solver_version,
            "scenario_hash": solution.get("scenario_hash"),
            "precomputed": True,
            "stub": self.stub,
            "overrides": dict(spec.overrides),
            "base": "official_12_45" if self.base_overrides else "contract_defaults",
            "scenario": as_dict(scenario),
            "solution": solution,
        }
        self.bundle["runs"][spec.slug] = entry
        self._write()
        self.table.append((spec.tier, spec.family, spec.slug, entry["status"]))
        self.log(f"  {spec.slug}: {entry['status']} in {time.monotonic() - started:.1f}s")
        return entry

    def stress(self, seed=STRESS_SEED):
        done = self.bundle.get("stress")
        if (done and done.get("data_hash") == self.data_hash and done.get("seed") == seed
                and done.get("solver_version") == self.solver_version and done.get("base") == self.base_overrides):
            self.table.append(("T1", "stress", "stress_*", "resumed"))
            return done
        sites = self.inputs.sites
        candidates = list(sites.loc[sites["is_candidate"], "site_id"])
        demand = self.base_overrides.get("demand_kt") or dict(
            zip(self.inputs.airports["iata"], self.inputs.airports["demand_kt"]))
        rows = []
        for slug, payload in stress_scenarios(seed, candidates, demand):
            _, solution, report = self._solve("resolve", {**self.base_overrides, **payload})
            row = {
                "slug": slug,
                "status": solution.get("status"),
                "solve_seconds": solution.get("solve_seconds"),
                "gap": solution.get("gap"),
                "audit_passed": bool(report.get("passed")),
            }
            rows.append(row)
            self.table.append(("T1", "stress", slug, row["status"] if row["audit_passed"] else "audit_failed"))
        random_rows = [r for r in rows if r["slug"] != "stress_infeasible"]
        solved = [r for r in random_rows if r["status"] in SOLVED and r["audit_passed"]]
        gaps = [r["gap"] for r in solved if r["gap"] is not None]
        seconds = [r["solve_seconds"] for r in rows if r["solve_seconds"] is not None]
        infeasible = next(r for r in rows if r["slug"] == "stress_infeasible")
        summary = {
            "seed": seed,
            "data_hash": self.data_hash,
            "solver_version": self.solver_version,
            "base": self.base_overrides,
            "n_random": len(random_rows),
            "solved": len(solved),
            "worst_solve_seconds": max(seconds) if seconds else None,
            "worst_gap": max(gaps) if gaps else None,
            "infeasible_case_status": infeasible["status"],
            "infeasible_case_detected": infeasible["status"] == "infeasible" and infeasible["audit_passed"],
            "runs": rows,
            "precomputed": True,
        }
        self.bundle["stress"] = summary
        self._write()
        self.log(f"stress: solved {summary['solved']} of {summary['n_random']}, "
                 f"worst {summary['worst_solve_seconds']} s, worst gap {summary['worst_gap']}, "
                 f"infeasible case {summary['infeasible_case_status']}")
        return summary

    def finish(self):
        runs = self.bundle["runs"].values()
        district_of = dict(zip(self.inputs.sites["site_id"], self.inputs.sites["district"]))
        sweep = [e for e in runs if e.get("family") == "sensitivity"]
        self.bundle["robustness"] = sensitivity.robustness(sweep, district_of)
        base = self.bundle["runs"].get("base")
        if base and base.get("status") in SOLVED:
            self.bundle["bulungan"] = sensitivity.bulungan_cost(base["solution"])
        self._write()

    def _write(self):
        self.bundle.update({
            "schema_version": SCHEMA_VERSION,
            "label": "Stub output, not stored runs" if self.stub else "Stored runs, precomputed by the solver",
            "data_hash": self.data_hash,
            "generated_at": self.clock(),
        })
        write_atomic(self.out, self.bundle)


def run_all(runner, tiers=TIERS, stress=True):
    base = runner.run(BASE)
    base_solution = base["solution"] if base and base.get("status") in SOLVED else None
    for tier in tiers:
        for spec in tier_specs(tier, base_solution, runner.inputs.sites):
            if spec.slug != BASE.slug:
                runner.run(spec)
        if tier == "T1" and stress:
            runner.stress()
    runner.finish()
    return runner.bundle


def print_table(table, log=print):
    counts = Counter((tier, family) for tier, family, _, _ in table)
    outcomes = Counter((tier, family, outcome) for tier, family, _, outcome in table)
    log(f"\n{'tier':<5}{'family':<16}{'runs':>5}  outcomes")
    for (tier, family), n in sorted(counts.items(), key=lambda kv: (TIERS.index(kv[0][0]), kv[0][1])):
        detail = ", ".join(f"{o} {c}" for (t, f, o), c in sorted(outcomes.items()) if (t, f) == (tier, family))
        log(f"{tier:<5}{family:<16}{n:>5}  {detail}")
    log(f"{'':<5}{'total':<16}{len(table):>5}")


# ---------- Stubs, for --stub only ----------

def stub_resolve(scenario):
    if FIXTURE.exists():
        solution = json.loads(FIXTURE.read_text(encoding="utf-8"))
    else:
        solution = {"status": "optimal", "gap": 0.0, "bound": 0.0, "primal": 0.0, "facilities": [], "flows": []}
    solution["source"] = "stub"
    solution.setdefault("solve_seconds", 0.0)
    return solution


def stub_audit(scenario, solution):
    return {"passed": True, "max_residuals": {}, "failures": []}


def _default_scenario(payload):
    from solver.contract import Scenario

    return Scenario.model_validate(payload)


SOLVER_SOURCES = ("model.py", "baseline.py", "audit.py", "candidates.py", "contract.py")


def solver_version():
    """Hash of the solver sources, so a changed objective or audit never reuses stored runs."""
    h = hashlib.sha256()
    for name in SOLVER_SOURCES:
        p = Path(__file__).with_name(name)
        if p.exists():
            h.update(name.encode())
            h.update(p.read_bytes())
    return h.hexdigest()[:12]


def main():
    parser = argparse.ArgumentParser(description="Solve, audit and store runs into the bundle.")
    parser.add_argument("--tiers", default=",".join(TIERS), help="comma-separated, e.g. T1,T2")
    parser.add_argument("--out", default=str(BUNDLE))
    parser.add_argument("--stub", action="store_true", help="stub resolve; needs --out outside web/")
    parser.add_argument("--no-stress", action="store_true")
    parser.add_argument("--fresh", action="store_true", help="ignore runs already in --out")
    args = parser.parse_args()
    tiers = [t.strip() for t in args.tiers.split(",") if t.strip()]
    for t in tiers:
        if t not in TIERS:
            parser.error(f"unknown tier {t}")
    out = Path(args.out).resolve()
    if args.stub and out.is_relative_to(WEB.resolve()):
        parser.error("--stub output must go outside web/, so stub runs never look stored")

    from solver.inputs import load_inputs

    inputs = load_inputs()
    if args.stub:
        resolve_fn, baseline_fn, audit_fn, scenario_fn = stub_resolve, stub_resolve, stub_audit, dict
    else:
        from solver.audit import audit
        from solver.baseline import baseline
        from solver.model import resolve

        resolve_fn, baseline_fn, audit_fn, scenario_fn = resolve, baseline, audit, _default_scenario
    runner = Runner(out=out, inputs=inputs, resolve_fn=resolve_fn, baseline_fn=baseline_fn, audit_fn=audit_fn,
                    scenario_fn=scenario_fn, stub=args.stub, solver_version=solver_version(), fresh=args.fresh)
    run_all(runner, tiers, stress=not args.no_stress)
    print_table(runner.table)
    print(f"\nwrote {out}")


if __name__ == "__main__":
    main()
