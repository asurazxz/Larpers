"""API boundary checks using real signatures and a local JWKS-client substitute."""

import importlib
import time
from types import SimpleNamespace

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec, rsa
from fastapi.testclient import TestClient

from solver.baseline import baseline
from solver.contract import Scenario
from test_audit import tiny_case

SUPABASE_URL = "https://unit-test.supabase.co"


@pytest.fixture
def api_client(monkeypatch):
    from api import main
    inputs, _, _ = tiny_case()
    monkeypatch.setenv("SUPABASE_URL", SUPABASE_URL)
    monkeypatch.setattr(main, "resolve", lambda scenario: baseline(scenario, inputs=inputs))
    main.app.dependency_overrides[main.get_inputs] = lambda: inputs
    with TestClient(main.app) as client:
        yield client, inputs
    main.app.dependency_overrides.clear()


@pytest.fixture(params=["RS256", "ES256"])
def signer(request, monkeypatch):
    from api import auth
    algorithm = request.param
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048) if algorithm == "RS256" else ec.generate_private_key(ec.SECP256R1())

    class LocalJwksClient:
        def get_signing_key_from_jwt(self, token):
            return SimpleNamespace(key=private_key.public_key())

    monkeypatch.setattr(auth, "get_jwks_client", lambda url: LocalJwksClient())

    def token(**changes):
        claims = {"sub": "unit-test-user", "exp": int(time.time())+120, "aud": "authenticated", "iss": SUPABASE_URL+"/auth/v1"}
        claims.update(changes)
        claims = {key: value for key, value in claims.items() if value is not None}
        return jwt.encode(claims, private_key, algorithm=algorithm, headers={"kid": "unit-key"})

    return token


@pytest.mark.parametrize("endpoint", ["solve", "baseline"])
def test_auth_valid_asymmetric_token(api_client, signer, endpoint):
    client, _ = api_client
    fits_tiny_supply = {"demand_kt": {"BPN": 5, "PNK": 3, "TRK": 2, "PKN": 1}}
    response = client.post(f"/api/{endpoint}", json=fits_tiny_supply, headers={"Authorization": "Bearer "+signer()})
    assert response.status_code == 200, response.text
    assert response.json()["validation"]["passed"]
    assert response.json()["run_id"] == response.headers["X-Run-ID"]


@pytest.mark.parametrize("endpoint", ["solve", "baseline"])
def test_auth_missing_token(api_client, endpoint):
    client, _ = api_client
    response = client.post(f"/api/{endpoint}", json={})
    assert response.status_code == 401
    assert response.headers["WWW-Authenticate"] == "Bearer"
    assert response.json()["run_id"]


@pytest.mark.parametrize("kind", ["expired", "tampered", "no_exp", "wrong_aud", "no_aud", "wrong_issuer", "no_subject"])
def test_auth_rejects_invalid_token(api_client, signer, kind):
    client, _ = api_client
    changes = {"expired": {"exp": int(time.time())-60}, "no_exp": {"exp": None}, "wrong_aud": {"aud": "anon"}, "no_aud": {"aud": None}, "wrong_issuer": {"iss": "https://other.supabase.co/auth/v1"}, "no_subject": {"sub": None}}
    token = signer(**changes.get(kind, {}))
    if kind == "tampered":
        head, payload, signature = token.split(".")
        signature = ("A" if signature[0] != "A" else "B") + signature[1:]
        token = ".".join((head, payload, signature))
    response = client.post("/api/solve", json={}, headers={"Authorization": "Bearer "+token})
    assert response.status_code == 401
    assert token not in response.text
    assert response.json()["run_id"]


@pytest.mark.parametrize("algorithm", ["HS256", "none"])
def test_auth_rejects_algorithm_confusion(api_client, algorithm):
    client, _ = api_client
    token = jwt.encode({"sub": "user", "aud": "authenticated", "exp": int(time.time())+60}, "test-only-secret-longer-than-32-bytes" if algorithm == "HS256" else None, algorithm=algorithm)
    response = client.post("/api/solve", json={}, headers={"Authorization": "Bearer "+token})
    assert response.status_code == 401


def test_auth_jwks_client_caches_by_url():
    from api.auth import get_jwks_client
    first = get_jwks_client(SUPABASE_URL)
    assert first is get_jwks_client(SUPABASE_URL)
    assert first.uri == SUPABASE_URL+"/auth/v1/.well-known/jwks.json"


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


def test_solve_audits_corrupted_result(api_client, signer, monkeypatch):
    from api import main
    client, _ = api_client
    _, _, solution = tiny_case()
    solution.flows[0].kt = -1
    monkeypatch.setattr(main, "resolve", lambda scenario: solution)
    response = client.post("/api/solve", json={}, headers={"Authorization": "Bearer "+signer()})
    assert response.status_code == 200
    assert not response.json()["validation"]["passed"]
    assert any(f.startswith("flow_nonnegative:") for f in response.json()["validation"]["failures"])


def test_infeasible_is_200(api_client, signer):
    client, _ = api_client
    response = client.post("/api/solve", json={"demand_kt": {"BPN": 1000, "PNK": 0, "TRK": 0, "PKN": 0}}, headers={"Authorization": "Bearer "+signer()})
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
def test_bad_scenario_is_422(api_client, signer, payload):
    client, _ = api_client
    response = client.post("/api/solve", json=payload, headers={"Authorization": "Bearer "+signer()})
    assert response.status_code == 422, response.text
    assert response.json()["run_id"]


def test_repeated_scenario_is_deterministic(api_client, signer):
    client, _ = api_client
    headers = {"Authorization": "Bearer "+signer()}
    first = client.post("/api/solve", json={}, headers=headers).json()
    second = client.post("/api/solve", json={}, headers=headers).json()
    assert first["run_id"] != second["run_id"]
    assert first["scenario_hash"] == second["scenario_hash"]
    assert first["primal"] == pytest.approx(second["primal"], abs=.01)
    assert [f["kt"] for f in first["flows"]] == pytest.approx([f["kt"] for f in second["flows"]], abs=1e-6)


def test_cors_allows_only_configured_frontend(api_client, monkeypatch):
    from api import main
    monkeypatch.setenv("FRONTEND_URL", "https://planner.example")
    with TestClient(main.create_app()) as client:
        for origin in ("http://localhost:3000", "http://127.0.0.1:3000", "https://planner.example"):
            response = client.options("/api/solve", headers={"Origin": origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization,content-type"})
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


def test_unexpected_error_has_safe_detail_and_run_id(api_client, signer, monkeypatch):
    from api import main

    def fail(scenario):
        raise RuntimeError("internal-only solver diagnostic")

    monkeypatch.setattr(main, "resolve", fail)
    with TestClient(main.app, raise_server_exceptions=False) as client:
        response = client.post("/api/solve", json={}, headers={"Authorization": "Bearer "+signer()})
    assert response.status_code == 500
    assert "internal-only" not in response.text
    assert response.json()["run_id"] == response.headers["X-Run-ID"]


def test_auth_jwks_failure_is_401(api_client, monkeypatch, signer):
    from api import auth

    class UnavailableJwksClient:
        def get_signing_key_from_jwt(self, token):
            raise jwt.PyJWKClientConnectionError("unavailable")

    monkeypatch.setattr(auth, "get_jwks_client", lambda url: UnavailableJwksClient())
    client, _ = api_client
    response = client.post("/api/solve", json={}, headers={"Authorization": "Bearer "+signer()})
    assert response.status_code == 401
    assert "unavailable" not in response.text


def test_actual_stub_response_stays_labelled_fixture(api_client, signer, monkeypatch):
    from api import main, stub_resolve
    monkeypatch.setattr(main, "resolve", stub_resolve.resolve)
    monkeypatch.setattr(main, "SOLVER_AVAILABLE", False)
    monkeypatch.setattr(main, "SOLVER_VERSION", "fixture-v1")
    client, _ = api_client
    health = client.get("/api/health").json()
    assert not health["ok"] and not health["available"]
    assert health["source"] == "fixture"
    response = client.post("/api/solve", json={}, headers={"Authorization": "Bearer "+signer()})
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


@pytest.mark.parametrize("configured_url", ["http://remote.supabase.co", "https://user:password@remote.supabase.co", "https://remote.supabase.co?redirect=elsewhere"])
def test_auth_rejects_insecure_project_configuration(api_client, signer, monkeypatch, configured_url):
    client, _ = api_client
    monkeypatch.setenv("SUPABASE_URL", configured_url)
    response = client.post("/api/solve", json={}, headers={"Authorization": "Bearer "+signer(iss=configured_url+"/auth/v1")})
    assert response.status_code == 503
    assert configured_url not in response.text


@pytest.mark.parametrize("project_url", ["http://localhost:54321", "http://127.0.0.1:54321", "http://[::1]:54321"])
def test_auth_allows_loopback_development(api_client, signer, monkeypatch, project_url):
    client, _ = api_client
    monkeypatch.setenv("SUPABASE_URL", project_url)
    response = client.post("/api/solve", json={}, headers={"Authorization": "Bearer "+signer(iss=project_url+"/auth/v1")})
    assert response.status_code == 200


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
