"""Portfolio fault handling with canned futures: no worker process starts and HiGHS never runs.

The instance is three co-located 300 kt sites and 120 kt of demand at BPN, so 600 kt of biomass must move and the two
cheapest refinery mixes are known by hand. Mixes with less than 600 kt of capacity are skipped before any submission.
"""
from concurrent.futures import Future
from concurrent.futures.process import BrokenProcessPool

import pytest

from solver.model import build_problem, mix_floor, resolve, run_portfolio
from test_model import A, B, C, demand, official, tiny

LARGE, PAIR, BOTH = (1, 0), (0, 2), (1, 1)
LARGE_USD = 112.8e6  # 0.10 x (9M + 765M) + 4 x 600k + 55 x 600k
PAIR_USD = 135.3e6  # 0.10 x (9M + 960M) + 4 x 600k + 60 x 600k
SCENARIO = official(demand_kt=demand(BPN=120.0), time_limit_s=5)
CANDIDATES = [A, B, C]
FLOWS = {
    LARGE: dict(refineries=[(A, "L")], f=[(A, A, 300.0), (B, A, 300.0)], g=[(A, "BPN", 120.0)]),
    PAIR: dict(refineries=[(A, "S"), (B, "S")], f=[(A, A, 300.0), (B, B, 300.0)],
               g=[(A, "BPN", 60.0), (B, "BPN", 60.0)]),
}
USD = {LARGE: LARGE_USD, PAIR: PAIR_USD}


def inputs():
    return tiny([300.0, 300.0, 300.0])


def problem():
    return build_problem(SCENARIO, inputs(), CANDIDATES)


def plan(key, state="proven", **overrides):
    """What a worker returns for a finished mix, with flows that recompute to USD[key]."""
    return {"n_large": key[0], "n_small": key[1], "state": state, "primal": USD[key], "bound": USD[key], "gap": 0.0,
            "seconds": 0.001, "model_status": "Optimal", "depots": [(A, "L"), (B, "L")], "x": [(A, A, 1.0), (B, B, 1.0)],
            "e": [], **FLOWS[key], **overrides}


def empty(key, state="no_incumbent", bound=None):
    """What a worker returns when the time limit ends with no incumbent."""
    return {"n_large": key[0], "n_small": key[1], "state": state, "primal": None, "bound": bound, "gap": None,
            "seconds": 0.001, "model_status": "Time limit reached"}


def settled(outcome):
    future = Future()
    if isinstance(outcome, BaseException):
        future.set_exception(outcome)
    else:
        future.set_result(outcome)
    return future


@pytest.fixture
def fake_pool(monkeypatch):
    """Replace the process boundary. Returns the list of mixes submitted, in order."""
    def install(outcomes, workers=1, clean=None, submit_raises=None):
        submitted = []

        def submit(pool, p, mix, *rest):
            key = (mix["n_large"], mix["n_small"])
            if submit_raises is not None and key in submit_raises:
                raise submit_raises[key]
            submitted.append(key)
            return settled(outcomes.get(key, empty(key)))

        def solve_clean(p, n_large, n_small, time_limit, threads=2, fixed=None):
            if isinstance(clean, BaseException):
                raise clean
            return plan((n_large, n_small)) if clean is None else clean

        monkeypatch.setattr("solver.model.WORKERS", workers)
        monkeypatch.setattr("solver.model._submit_mix", submit)
        monkeypatch.setattr("solver.model.solve_mix", solve_clean)
        return submitted

    return install


def solve():
    return resolve(SCENARIO, inputs=inputs(), candidates=CANDIDATES)


def rows(solution):
    return {(m["n_large"], m["n_small"]): m for m in solution.model_dump()["portfolios"]}


def states(mixes):
    return {(m["n_large"], m["n_small"]): m["state"] for m in mixes}


def test_instance_has_the_floors_these_tests_rely_on():
    p = problem()
    assert mix_floor(p, *LARGE) < PAIR_USD
    assert mix_floor(p, *BOTH) >= PAIR_USD


def test_clean_run_is_optimal(fake_pool):
    fake_pool({LARGE: plan(LARGE)})
    sol = solve()
    assert sol.status == "optimal"
    assert sol.primal == pytest.approx(LARGE_USD, abs=0.01)
    assert sol.gap == 0


def test_worker_exception_marks_only_that_mix_failed_and_keeps_the_incumbent(fake_pool):
    fake_pool({LARGE: RuntimeError("HiGHS crashed"), PAIR: plan(PAIR)})
    sol = solve()
    table = rows(sol)
    assert table[LARGE]["reason"] == "failed"
    assert table[PAIR]["reason"] == "proven"
    assert sol.status == "best_found"
    assert sol.primal == pytest.approx(PAIR_USD, abs=0.01)
    assert sol.gap > 0
    assert sol.status != "optimal"


def test_broken_pool_marks_the_running_mix_failed_and_keeps_an_earlier_incumbent(fake_pool):
    # LARGE returns a poor incumbent first, so PAIR's floor is below best and PAIR must run, then the pool dies.
    fake_pool({LARGE: plan(LARGE, state="best_found", primal=200e6, bound=120e6, gap=0.4),
               PAIR: BrokenProcessPool("a worker died")})
    mixes = run_portfolio(problem(), 5)
    got = states(mixes)
    assert got[LARGE] == "best_found"
    assert got[PAIR] == "failed"
    assert next(m for m in mixes if m["state"] == "best_found")["primal"] == 200e6


def test_broken_pool_marks_every_running_mix_failed(fake_pool):
    broken = BrokenProcessPool("a worker died")
    fake_pool({LARGE: broken, PAIR: broken}, workers=2)
    got = states(run_portfolio(problem(), 5))
    assert got[LARGE] == got[PAIR] == "failed"
    assert "proven" not in got.values()


def test_broken_pool_keeps_a_result_that_finished_in_the_same_batch(fake_pool):
    # wait() returns a set, so the broken future may be read first. Repeat so both read orders are exercised.
    broken = BrokenProcessPool("a worker died")
    for _ in range(40):
        fake_pool({LARGE: broken, PAIR: plan(PAIR)}, workers=2)
        got = states(run_portfolio(problem(), 5))
        assert got[LARGE] == "failed"
        assert got[PAIR] == "proven"


def test_broken_pool_raising_at_submit_does_not_escape(fake_pool):
    # ProcessPoolExecutor.submit raises BrokenProcessPool itself once a worker has died.
    fake_pool({LARGE: plan(LARGE, state="best_found", primal=200e6, bound=120e6, gap=0.4)}, workers=2,
              submit_raises={PAIR: BrokenProcessPool("a worker died")})
    got = states(run_portfolio(problem(), 5))
    assert got[LARGE] == "best_found"
    assert got[PAIR] in ("failed", "not_run")


def test_broken_pool_with_nothing_found_is_not_a_proof_of_infeasibility(fake_pool):
    broken = BrokenProcessPool("a worker died")
    fake_pool({LARGE: broken, PAIR: broken}, workers=2)
    sol = solve()
    assert sol.status != "optimal"
    assert "could not find" in sol.status_reason.lower()


@pytest.mark.parametrize("lost_bound", [None, 1.0, -1e12], ids=["none", "below_floor", "negative"])
def test_a_bound_below_the_floor_cannot_report_best_found_gap_zero(fake_pool, lost_bound):
    # The old run_portfolio let mix.update(result) write None over the floor. resolve then dropped the None, took
    # min([primal]) as the bound, and printed "Best found, gap 0.00%" with a whole mix unproven.
    fake_pool({LARGE: empty(LARGE, bound=lost_bound), PAIR: plan(PAIR)})
    sol = solve()
    floor = mix_floor(problem(), *LARGE)
    assert sol.status == "best_found"
    assert rows(sol)[LARGE]["bound"] == pytest.approx(floor, abs=0.01)
    assert sol.bound == pytest.approx(floor, abs=0.01)
    assert sol.gap == pytest.approx((PAIR_USD - floor) / PAIR_USD, abs=1e-9)
    assert sol.gap > 0
    assert "gap 0.00%" not in sol.status_reason


def test_a_failed_mix_keeps_its_floor_as_its_bound(fake_pool):
    fake_pool({LARGE: RuntimeError("HiGHS crashed"), PAIR: plan(PAIR)})
    sol = solve()
    floor = mix_floor(problem(), *LARGE)
    assert rows(sol)[LARGE]["bound"] == pytest.approx(floor, abs=0.01)
    assert sol.bound == pytest.approx(floor, abs=0.01)
    assert "gap 0.00%" not in sol.status_reason


def test_a_bound_above_the_floor_is_kept(fake_pool):
    fake_pool({LARGE: empty(LARGE, bound=120e6), PAIR: plan(PAIR)})
    sol = solve()
    assert rows(sol)[LARGE]["bound"] == pytest.approx(120e6, abs=0.01)
    assert sol.bound == pytest.approx(120e6, abs=0.01)


@pytest.mark.parametrize("best", [113e6, 150e6, 200e6, 400e6, 1500e6])
def test_a_capex_skip_needs_the_floor_at_or_above_best(fake_pool, best):
    # One-off CapEx cannot be the test: $765M of CapEx is only $76.5M a year, so comparing it to an annual best skips
    # mixes that could still win.
    submitted = fake_pool({LARGE: plan(LARGE, primal=best, bound=best)})
    p = problem()
    mixes = run_portfolio(p, 5)
    for mix in mixes:
        key = (mix["n_large"], mix["n_small"])
        floor = mix_floor(p, *key)
        if mix["state"] in ("skipped_capex", "dominated"):
            assert floor >= best, (key, mix["state"], floor)
        elif mix["state"] != "skipped_capacity":
            assert key in submitted, (key, mix["state"], floor)
    if best == 113e6:
        assert "skipped_capex" in states(mixes).values()


@pytest.mark.parametrize("clean", [RuntimeError("clean solve crashed"), empty(LARGE, state="best_found")],
                         ids=["raises", "no_values"])
def test_the_clean_resolve_failing_falls_back_to_the_winner_flows(fake_pool, clean):
    fake_pool({LARGE: plan(LARGE)}, clean=clean)
    sol = solve()
    assert sol.status in ("optimal", "best_found")
    assert sol.primal == pytest.approx(LARGE_USD, abs=0.01)
    assert sum(f.kt for f in sol.flows if f.leg == "refinery_airport") == pytest.approx(120.0, abs=1e-6)
    assert sorted((f.site_id, f.size) for f in sol.facilities if f.type == "refinery") == [(A, "large")]


@pytest.mark.parametrize("outcome", [
    RuntimeError("HiGHS crashed"),
    empty(LARGE),
    empty(LARGE, bound=120e6),
    plan(LARGE, state="best_found", primal=140e6, bound=120e6, gap=0.14),
], ids=["failed", "no_incumbent", "no_incumbent_with_bound", "best_found"])
def test_an_unresolved_mix_means_status_is_never_optimal(fake_pool, outcome):
    fake_pool({LARGE: outcome, PAIR: plan(PAIR)})
    sol = solve()
    assert sol.status == "best_found"
    assert sol.gap > 0
    assert sol.bound < sol.primal
    assert sol.status_reason.startswith("Best found")


def test_no_mix_has_run_when_the_budget_is_already_spent(fake_pool):
    submitted = fake_pool({})
    got = states(run_portfolio(problem(), 0))
    assert submitted == []
    assert got[LARGE] == got[PAIR] == "not_run"


def test_every_mix_infeasible_is_a_real_infeasibility(fake_pool):
    keys = [(1, 0), (0, 2), (1, 1), (0, 3), (2, 0), (1, 2), (2, 1), (3, 0)]
    fake_pool({key: empty(key, state="infeasible") for key in keys})
    sol = solve()
    assert sol.status == "infeasible"
    assert "could not find" not in sol.status_reason.lower()


@pytest.mark.parametrize("outcome", [RuntimeError("HiGHS crashed"), empty(LARGE)], ids=["failed", "no_incumbent"])
def test_nothing_found_with_a_mix_unresolved_says_could_not_find(fake_pool, outcome):
    fake_pool({LARGE: outcome})
    sol = solve()
    assert sol.status != "optimal"
    assert "could not find" in sol.status_reason.lower()
    assert sol.primal is None


@pytest.mark.parametrize("outcome", [RuntimeError("HiGHS crashed"), empty(LARGE)], ids=["failed", "no_incumbent"])
def test_nothing_found_with_a_mix_unresolved_is_no_solution(fake_pool, outcome):
    fake_pool({LARGE: outcome})
    assert solve().status == "no_solution"
