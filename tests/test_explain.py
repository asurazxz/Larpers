"""POST /api/explain: facts, grounding check and failure paths. Gemini is always mocked."""

import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from api import explain, plain_english
from solver.contract import Scenario, Solution
from test_api import api_client, signer  # noqa: F401  (pytest fixtures)

FIXTURE = Path(__file__).resolve().parents[1] / "contracts" / "fixture_solution.json"


def fixture_solution() -> Solution:
    return Solution.model_validate_json(FIXTURE.read_text())


def fact_map(facts):
    return {f["id"]: f["value"] for f in facts}


def body(baseline=False):
    solution = fixture_solution().model_dump(mode="json", by_alias=True)
    out = {"scenario": Scenario().model_dump(mode="json", by_alias=True), "solution": solution}
    if baseline:
        out["baseline"] = solution
    return out


class FakeModels:
    def __init__(self, payload):
        self.payload = payload
        self.calls = []

    def generate_content(self, **kwargs):
        self.calls.append(kwargs)
        return SimpleNamespace(text=json.dumps(self.payload))


def use_fake_gemini(monkeypatch, payload):
    models = FakeModels(payload)
    monkeypatch.setattr(explain, "_client", None)
    monkeypatch.setattr(explain.genai, "Client", lambda **kwargs: SimpleNamespace(models=models))
    monkeypatch.setenv("GEMINI_API_KEY", "unit-test-key")
    return models


def test_facts_from_fixture_solution():
    s = fixture_solution()
    facts = explain.build_facts(Scenario(), s)
    values = fact_map(facts)
    assert len({f["id"] for f in facts}) == len(facts)
    assert values["status"] == "Heuristic baseline"
    assert values["capex_one_off"] == "$767.3M"  # as the UI rounds it (toLocaleString), not banker's rounding
    assert values["annualised_capex"] == "$38.4M/yr"
    assert values["transport"] == "$6.8M/yr"
    assert values["total_annual"].endswith("M/yr")
    assert values["count_large_refinery"] == "1 large refinery"
    assert values["count_small_depot"] == "1 small depot"
    assert values["refinery_KAL_SUP_45"].startswith("KAL_SUP_45, Kotawaringin Timur, large, 13.5 kt")
    assert values["saf_BPN"] == "10.0 kt/yr"
    assert values["saf_PNK"] == "0.0 kt/yr"
    assert values["airports_served"] == "1 of 4 airports (BPN)"
    assert values["stranded_KAL_SUP_03"] == "KAL_SUP_03, Ketapang: 96.4 kt"
    assert values["stranded_total"] == "96.4 kt at 1 sites"
    assert values["audit"] == "Failed"
    assert values["yield"] == "20.0%"
    assert values["road_factor"] == "1.3× great-circle distance"
    assert values["demand"] == "300 kt per airport, 1,200 kt total"
    assert "baseline_total" not in values
    with_base = fact_map(explain.build_facts(Scenario(), s, s))
    assert with_base["baseline_saving"] == "$0/yr" and with_base["baseline_saving_pct"] == "0.0%"


def grounded_payload(facts):
    v = fact_map(facts)
    return {
        "headline": f"Heuristic network costs {v['total_annual']} with {v['count_large_refinery']}.",
        "points": [
            {"text": f"One-off CapEx is {v['capex_one_off']}, annualised to {v['annualised_capex']}.", "fact_ids": ["capex_one_off", "annualised_capex"]},
            {"text": f"BPN receives {v['saf_BPN']}; {v['airports_served']}.", "fact_ids": ["saf_BPN", "airports_served"]},
            {"text": f"{v['stranded_total']} of supply is stranded.", "fact_ids": ["stranded_total"]},
        ],
        "caveat": "The independent audit failed, so treat this as illustrative.",
    }


def test_grounding_accepts_verbatim_numbers():
    facts = explain.build_facts(Scenario(), fixture_solution())
    out = explain.verify(explain.Explanation.model_validate(grounded_payload(facts)), facts)
    assert out is not None and len(out["points"]) == 3
    assert explain.numbers_in("$1,234.5M/yr and 0.77% at KAL_SUP_12") == explain.numbers_in("1234.5 kt, 0.770")


def test_grounding_rejects_invented_number():
    facts = explain.build_facts(Scenario(), fixture_solution())
    payload = grounded_payload(facts)
    payload["points"][0]["text"] = "Building it costs $999.9M up front."
    out = explain.verify(explain.Explanation.model_validate(payload), facts)
    assert out is not None and len(out["points"]) == 2  # the invented point is dropped
    payload["points"][1]["fact_ids"] = ["no_such_fact"]
    assert explain.verify(explain.Explanation.model_validate(payload), facts) is None  # fewer than 2 survive
    payload = grounded_payload(facts)
    payload["headline"] = "Saves 42% versus the baseline."
    assert explain.verify(explain.Explanation.model_validate(payload), facts) is None  # headline fails


def test_explain_success_and_withheld(api_client, signer, monkeypatch):  # noqa: F811
    client, _ = api_client
    facts = explain.build_facts(Scenario(), fixture_solution())
    models = use_fake_gemini(monkeypatch, grounded_payload(facts))
    response = client.post("/api/explain", json=body(), headers={"Authorization": "Bearer " + signer()})
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["available"] and data["verified"] and data["model"] == explain.DEFAULT_MODEL
    assert {f["id"] for f in data["facts"]} == {f["id"] for f in facts}
    config = models.calls[0]["config"]
    assert config.response_mime_type == "application/json" and config.response_schema is explain.Explanation

    bad = grounded_payload(facts)
    bad["headline"] = "This network saves $12.3B."
    use_fake_gemini(monkeypatch, bad)
    response = client.post("/api/explain", json=body(), headers={"Authorization": "Bearer " + signer()})
    assert response.status_code == 200
    assert response.json() == {"available": False, "reason": explain.WITHHELD}


def test_explain_without_key_is_503(api_client, signer, monkeypatch):  # noqa: F811
    client, _ = api_client
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.setattr(plain_english, "ENV_FILE", plain_english.ROOT / "no-such-env-file")
    monkeypatch.setattr(explain.genai, "Client", lambda **kwargs: pytest.fail("no client without a key"))
    response = client.post("/api/explain", json=body(baseline=True), headers={"Authorization": "Bearer " + signer()})
    assert response.status_code == 503
    assert response.json()["detail"] == explain.NO_KEY


def test_explain_reads_the_key_from_the_env_file(api_client, signer, monkeypatch, tmp_path):  # noqa: F811
    client, _ = api_client
    facts = explain.build_facts(Scenario(), fixture_solution())
    env_file = tmp_path / ".env"
    env_file.write_text("OTHER=1\nGEMINI_API_KEY=key-from-env-file\n")
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.setattr(plain_english, "ENV_FILE", env_file)
    monkeypatch.setattr(explain, "_client", None)
    keys = []

    def fake_client(**kwargs):
        keys.append(kwargs["api_key"])
        return SimpleNamespace(models=FakeModels(grounded_payload(facts)))

    monkeypatch.setattr(explain.genai, "Client", fake_client)
    response = client.post("/api/explain", json=body(), headers={"Authorization": "Bearer " + signer()})
    assert response.status_code == 200, response.text
    assert keys == ["key-from-env-file"]
    assert "key-from-env-file" not in response.text


def test_explain_api_error_is_502(api_client, signer, monkeypatch):  # noqa: F811
    client, _ = api_client
    facts = explain.build_facts(Scenario(), fixture_solution())
    asked = []

    class Busy:
        def __init__(self, fallback_ok):
            self.fallback_ok = fallback_ok

        def generate_content(self, **kwargs):
            asked.append(kwargs["model"])
            if kwargs["model"] == explain.FALLBACK_MODEL and self.fallback_ok:
                return SimpleNamespace(text=json.dumps(grounded_payload(facts)))
            raise explain.errors.ServerError(503, {"error": {"code": 503, "message": "high demand", "status": "UNAVAILABLE"}})

    monkeypatch.setenv("GEMINI_API_KEY", "unit-test-key")
    for fallback_ok, status in ((True, 200), (False, 502)):
        asked.clear()
        monkeypatch.setattr(explain, "_client", None)
        monkeypatch.setattr(explain.genai, "Client", lambda **kwargs: SimpleNamespace(models=Busy(fallback_ok)))
        response = client.post("/api/explain", json=body(), headers={"Authorization": "Bearer " + signer()})
        assert response.status_code == status, response.text
        assert asked == [explain.DEFAULT_MODEL, explain.FALLBACK_MODEL]
        assert "unit-test-key" not in response.text
        if status == 200:
            assert response.json()["model"] == explain.FALLBACK_MODEL


def test_explain_requires_auth(api_client):  # noqa: F811
    client, _ = api_client
    response = client.post("/api/explain", json=body())
    assert response.status_code == 401
    assert response.headers["WWW-Authenticate"] == "Bearer"
