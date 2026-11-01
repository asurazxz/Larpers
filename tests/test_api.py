"""API boundary checks."""

import importlib
import json
import threading

import pytest
from fastapi.testclient import TestClient

from solver.baseline import baseline
from solver.contract import Scenario
from test_audit import tiny_case


@pytest.fixture
def api_client(monkeypatch):
    from api import main
    inputs, _, _ = tiny_case()
    monkeypatch.setattr(main, "resolve", lambda scenario: baseline(scenario, inputs=inputs))
    monkeypatch.setattr(main, "precheck", lambda scenario, inputs: None)
    main.app.dependency_overrides[main.get_inputs] = lambda: inputs
    with TestClient(main.app) as client:
        yield client, inputs
    main.app.dependency_overrides.clear()


@pytest.mark.parametrize("endpoint", ["solve", "baseline"])
def test_solve_and_baseline_need_no_login(api_client, endpoint):
    client, _ = api_client
    fits_tiny_supply = {"demand_kt": {"BPN": 5, "PNK": 3, "TRK": 2, "PKN": 1}}
    response = client.post(f"/api/{endpoint}", json=fits_tiny_supply)
    assert response.status_code == 200, response.text
    assert response.json()["validation"]["passed"]
    assert response.json()["run_id"] == response.headers["X-Run-ID"]


def test_public_endpoints(api_client):
    client, _ = api_client
    health = client.get("/api/health")
    assert health.status_code == 200
    assert isinstance(health.json()["available"], bool)
    assert health.json()["solver_version"]
    assert health.json()["run_id"] == health.headers["X-Run-ID"]
    data = client.get("/api/data")
    assert data.status_code == 200
    assert data.json()["data_hash"] == "tiny-data"
    assert len(data.json()["sites"]) == 3
    assert len(data.json()["airports"]) == 4
    assert data.json()["defaults"]["yield"] == .20
    assert data.json()["run_id"]
    _, legacy, solution = tiny_case()
    scenario = Scenario.model_validate({**legacy.model_dump(by_alias=True), "demand_kt": legacy.airport_demand(120.)})
    solution.scenario_hash = scenario.scenario_hash()
    validation = client.post("/api/validate", json={"scenario": scenario.model_dump(by_alias=True), "solution": solution.model_dump(by_alias=True)})
    assert validation.status_code == 200
    assert validation.json()["passed"]
    assert validation.json()["run_id"]


def test_solve_audits_corrupted_result(api_client, monkeypatch):
    from api import main
    client, _ = api_client
    _, _, solution = tiny_case()
    solution.flows[0].kt = -1
    monkeypatch.setattr(main, "resolve", lambda scenario: solution)
    response = client.post("/api/solve", json={})
    assert response.status_code == 200
    assert not response.json()["validation"]["passed"]
    assert any(f.startswith("flow_nonnegative:") for f in response.json()["validation"]["failures"])


def test_infeasible_is_200(api_client):
    client, _ = api_client
    response = client.post("/api/solve", json={"demand_kt": {"BPN": 1000, "PNK": 0, "TRK": 0, "PKN": 0}})
    assert response.status_code == 200
    assert response.json()["status"] == "infeasible"
    assert response.json()["primal"] is None


def test_import_error_uses_labelled_fixture(monkeypatch):
    from api import main
    original = importlib.import_module

    def missing_model(name):
        if name == "solver.model":
            raise ImportError("solver not merged yet")
        return original(name)

    monkeypatch.setattr(main.importlib, "import_module", missing_model)
    resolve, available, version = main.load_resolver()
    assert not available
    assert version == "fixture-v1"
    result = resolve(Scenario())
    assert result.source == "fixture"
    assert not result.validation.passed
    assert len(result.flows) == 3


@pytest.mark.parametrize("payload", [
    {"yield": 0}, {"yield": 1.1}, {"excluded_ids": ["KAL_SUP_99"]},
    {"excluded_ids": ["KAL_SUP_80"]},
    {"demand_kt": {"BPN": -1, "PNK": 0, "TRK": 0, "PKN": 0}},
    {"demand_kt": {"BPN": 10}}, {"surprise": True},
])
def test_bad_scenario_is_422(api_client, payload):
    client, _ = api_client
    response = client.post("/api/solve", json=payload)
    assert response.status_code == 422, response.text
    assert response.json()["run_id"]


def test_repeated_scenario_is_deterministic(api_client):
    client, _ = api_client
    first = client.post("/api/solve", json={}).json()
    second = client.post("/api/solve", json={}).json()
    assert first["run_id"] != second["run_id"]
    assert first["scenario_hash"] == second["scenario_hash"]
    assert first["primal"] == pytest.approx(second["primal"], abs=.01)
    assert [f["kt"] for f in first["flows"]] == pytest.approx([f["kt"] for f in second["flows"]], abs=1e-6)


def test_cors_allows_only_configured_frontend(api_client, monkeypatch):
    from api import main
    monkeypatch.setenv("FRONTEND_URL", "https://planner.example")
    with TestClient(main.create_app()) as client:
        for origin in ("http://localhost:3000", "http://127.0.0.1:3000", "https://planner.example"):
            response = client.options("/api/solve", headers={"Origin": origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type"})
            assert response.status_code == 200
            assert response.headers["Access-Control-Allow-Origin"] == origin
            assert response.headers["X-Run-ID"]
        response = client.options("/api/solve", headers={"Origin": "https://untrusted.example", "Access-Control-Request-Method": "POST"})
        assert response.status_code == 400
        assert "Access-Control-Allow-Origin" not in response.headers


def test_unknown_route_has_run_id(api_client):
    client, _ = api_client
    response = client.get("/api/unknown")
    assert response.status_code == 404
    assert response.json()["run_id"] == response.headers["X-Run-ID"]


def test_unexpected_error_has_safe_detail_and_run_id(api_client, monkeypatch):
    from api import main

    def fail(scenario):
        raise RuntimeError("internal-only solver diagnostic")

    monkeypatch.setattr(main, "resolve", fail)
    with TestClient(main.app, raise_server_exceptions=False) as client:
        response = client.post("/api/solve", json={})
    assert response.status_code == 500
    assert "internal-only" not in response.text
    assert response.json()["run_id"] == response.headers["X-Run-ID"]


def test_actual_stub_response_stays_labelled_fixture(api_client, monkeypatch):
    from api import main, stub_resolve
    monkeypatch.setattr(main, "resolve", stub_resolve.resolve)
    monkeypatch.setattr(main, "SOLVER_AVAILABLE", False)
    monkeypatch.setattr(main, "SOLVER_VERSION", "fixture-v1")
    client, _ = api_client
    health = client.get("/api/health").json()
    assert not health["ok"] and not health["available"]
    assert health["source"] == "fixture"
    response = client.post("/api/solve", json={})
    assert response.status_code == 200
    assert response.json()["source"] == "fixture"
    assert not response.json()["validation"]["passed"]


def test_missing_prepared_data_is_explained(monkeypatch):
    from api import main

    def missing():
        raise FileNotFoundError("processed")

    monkeypatch.setattr(main, "load_inputs", missing)
    with TestClient(main.create_app()) as client:
        response = client.get("/api/data")
        assert response.status_code == 503
        assert response.json()["run_id"]
        health = client.get("/api/health").json()
        assert not health["ok"] and not health["data_available"]


def test_resolver_can_omit_validation_before_audit():
    from solver.contract import Solution
    _, _, solution = tiny_case()
    payload = solution.model_dump(by_alias=True)
    payload.pop("validation")
    result = Solution.model_validate(payload)
    assert not result.validation.passed
    assert result.validation.failures == ["Not audited"]
    assert result.validation.max_residuals == {}
    other = Solution.model_validate(payload)
    result.validation.failures.append("first result only")
    assert other.validation.failures == ["Not audited"]


def test_proof_reason_and_portfolio_capex_survive_solution_round_trip():
    from solver.contract import Solution
    _, _, solution = tiny_case()
    payload = solution.model_dump(by_alias=True)
    payload["status_reason"] = "Best found, gap 2%"
    payload["portfolios"] = [{"n_large": 2, "n_small": 0, "status": "skipped", "capex_usd": 1_530_000_000, "reason": "skipped_capex", "solve_seconds": 0}]
    result = Solution.model_validate(payload)
    wire = result.model_dump(mode="json", by_alias=True)
    assert wire["status_reason"] == "Best found, gap 2%"
    assert wire["portfolios"][0]["capex_usd"] == 1_530_000_000
    assert wire["portfolios"][0]["reason"] == "skipped_capex"
    assert Solution.model_validate(wire) == result


@pytest.mark.parametrize("endpoint, target", [("solve", "resolve"), ("baseline", "baseline")])
def test_infeasible_input_is_refused_with_its_reason_before_any_solve(api_client, monkeypatch, endpoint, target):
    from api import main
    from solver import model

    def must_not_run(*args, **kwargs):
        raise AssertionError("a refused scenario must not reach the solver")

    client, _ = api_client
    monkeypatch.setattr(main, "precheck", model.precheck)
    monkeypatch.setattr(main, target, must_not_run)
    demand = {"BPN": 5000, "PNK": 0, "TRK": 0, "PKN": 0}
    response = client.post(f"/api/{endpoint}", json={"demand_kt": demand})
    assert response.status_code == 422
    assert "exceeds" in response.json()["detail"]
    assert response.json()["run_id"]


def test_a_scenario_that_passes_the_precheck_still_solves(api_client, monkeypatch):
    from api import main
    client, _ = api_client
    monkeypatch.setattr(main, "precheck", lambda scenario, inputs: None)
    response = client.post("/api/solve", json={"demand_kt": {"BPN": 5, "PNK": 3, "TRK": 2, "PKN": 1}})
    assert response.status_code == 200


def test_validate_still_audits_a_scenario_the_precheck_would_refuse(api_client, monkeypatch):
    from api import main
    client, _ = api_client
    monkeypatch.setattr(main, "precheck", lambda scenario, inputs: "refused")
    _, legacy, solution = tiny_case()
    scenario = Scenario.model_validate({**legacy.model_dump(by_alias=True), "demand_kt": legacy.airport_demand(120.)})
    solution.scenario_hash = scenario.scenario_hash()
    response = client.post("/api/validate", json={"scenario": scenario.model_dump(by_alias=True),
                                                  "solution": solution.model_dump(by_alias=True)})
    assert response.status_code == 200


def stream_lines(response):
    return [json.loads(line) for line in response.text.splitlines()]


def test_stream_rejects_a_bad_scenario_before_streaming(api_client):
    client, _ = api_client
    response = client.post("/api/solve/stream", json={"yield": 0})
    assert response.status_code == 422


def test_stream_refuses_infeasible_input_before_any_solve(api_client, monkeypatch):
    from api import main

    def must_not_run(*args, **kwargs):
        raise AssertionError("no solve should start")

    monkeypatch.setattr(main, "resolve", must_not_run)
    monkeypatch.setattr(main, "precheck", lambda scenario, inputs: "Demand exceeds supply")
    client, _ = api_client
    response = client.post("/api/solve/stream", json={})
    assert response.status_code == 422
    assert response.json()["detail"] == "Demand exceeds supply"


def test_stream_refuses_a_run_when_the_solver_is_full(api_client, monkeypatch):
    from api import main

    def must_not_run(*args, **kwargs):
        raise AssertionError("no solve should start")

    monkeypatch.setattr(main, "resolve", must_not_run)
    monkeypatch.setattr(main, "live_solves", threading.BoundedSemaphore(1))
    assert main.live_solves.acquire(blocking=False)
    client, _ = api_client
    response = client.post("/api/solve/stream", json={})
    assert response.status_code == 429
    assert response.json()["run_id"]


@pytest.mark.parametrize("outcome", ["finishes", "fails", "cancelled"])
def test_stream_gives_its_slot_back_however_the_run_ends(api_client, monkeypatch, outcome):
    from api import main
    client, inputs = api_client

    def run(scenario, on_event, stop):
        if outcome == "fails":
            raise RuntimeError("boom")
        if outcome == "cancelled":
            raise main.SolveCancelled
        return baseline(scenario, inputs=inputs)

    monkeypatch.setattr(main, "resolve", run)
    monkeypatch.setattr(main, "live_solves", threading.BoundedSemaphore(1))
    for _ in range(3):
        assert client.post("/api/solve/stream", json={}).status_code == 200


def test_stream_ends_in_the_same_audited_result_as_solve(api_client, monkeypatch):
    from api import main
    client, inputs = api_client

    def fake(scenario, on_event, stop):
        on_event({"type": "start", "candidates": []})
        on_event({"type": "incumbent", "primal": 1.0, "depots": [], "refineries": [], "flows": []})
        return baseline(scenario, inputs=inputs)

    monkeypatch.setattr(main, "resolve", fake)
    response = client.post("/api/solve/stream", json={})
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/x-ndjson")
    events = stream_lines(response)
    assert [e["type"] for e in events] == ["start", "incumbent", "phase", "result"]
    assert all(e["t"] >= 0 for e in events)
    solution = events[-1]["solution"]
    assert solution["run_id"] == response.headers["X-Run-ID"]
    assert solution["validation"]["failures"] != ["Not audited"]


def test_stream_reports_failure_without_the_diagnostic(api_client, monkeypatch):
    from api import main

    def fail(scenario, on_event, stop):
        raise RuntimeError("internal-only solver diagnostic")

    monkeypatch.setattr(main, "resolve", fail)
    client, _ = api_client
    response = client.post("/api/solve/stream", json={})
    assert response.status_code == 200
    assert "internal-only" not in response.text
    last = stream_lines(response)[-1]
    assert last["type"] == "error"
    assert last["run_id"] == response.headers["X-Run-ID"]


def test_stream_stays_quiet_when_a_run_is_cancelled(api_client, monkeypatch):
    from api import main

    def cancelled(scenario, on_event, stop):
        raise main.SolveCancelled

    monkeypatch.setattr(main, "resolve", cancelled)
    client, _ = api_client
    response = client.post("/api/solve/stream", json={})
    assert response.status_code == 200
    assert response.text == ""


def test_stream_uses_the_labelled_fixture_when_the_solver_is_missing(api_client, monkeypatch):
    from api import main, stub_resolve
    monkeypatch.setattr(main, "resolve", stub_resolve.resolve)
    monkeypatch.setattr(main, "SOLVER_AVAILABLE", False)
    client, _ = api_client
    response = client.post("/api/solve/stream", json={})
    assert stream_lines(response)[-1]["solution"]["source"] == "fixture"
