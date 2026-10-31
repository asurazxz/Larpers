"""The explain button: Gemini writes blanks, every figure comes from the run, and a failure is never an error."""

import httpx
import pytest

from api import plain_english as explain
from api.plain_english import GeminiUnavailable, ask_gemini, plain_english, problems
from solver.context import PROJECT_CONTEXT
from test_api import api_client, signer  # noqa: F401

FACTS = {
    "total_annual_cost": "$894.5M",
    "transport_cost_per_year": "$120.0M",
    "status": "This is the best plan found, and a better one could be at most 0.52% cheaper.",
    "audit_note": "An independent check of the plan passed.",
}
GOOD = "This plan costs {total_annual_cost} a year, with {transport_cost_per_year} on transport."
CLOSING = " This is the best plan found, and a better one could be at most 0.52% cheaper. An independent check of the plan passed."
SECRET = "test-gemini-key"
TRACE_FACTS = {
    "amount_moved": "4,200 tonnes", "cargo": "plant material", "transport_mode": "truck", "from_place": "Site A",
    "to_place": "Depot B", "route_role": "it brings plant material from a growing area to a depot",
    "straight_line_distance": "61.5 km", "share_of_destination_supply": "12.0%", "plan_transport_cost": "$82.5M",
    "road_factor": "1.3", "route_distance": "80.0 km", "rate_per_tonne_km": "$0.1",
    "recalculated_cost": "$33,600.00", "stored_cost": "$33,600.00", "cost_difference": "$0.00",
    "allowed_difference": "$1.00", "check_result": "This page recalculated the distance, rate and cost.",
}
TRACE_DRAFT = ("{amount_moved} goes from {from_place} to {to_place}, or {share_of_destination_supply} of what arrives. "
               "The route is {route_distance}, costing {recalculated_cost} out of {plan_transport_cost}, a gap of "
               "{cost_difference}.")


@pytest.fixture(autouse=True)
def fresh_call_cap(monkeypatch):
    monkeypatch.setattr(explain, "recent_calls", explain.deque())


def scripted(*replies):
    """Stands in for ask_gemini. A reply that is an exception is raised, like a model that did not answer."""
    queue = iter(replies)
    calls = []

    def ask(model, system, user):
        calls.append({"model": model, "system": system, "user": user})
        reply = next(queue)
        if isinstance(reply, Exception):
            raise reply
        return reply
    ask.calls = calls
    return ask


def gemini_client(handler):
    return httpx.Client(transport=httpx.MockTransport(handler))


def reply(text="Fine.", finish="STOP"):
    return {"candidates": [{"finishReason": finish, "content": {"parts": [{"text": text}]}}]}


def test_every_figure_is_filled_from_the_run():
    text, model = plain_english("network", FACTS, ask=scripted(GOOD))
    assert text == "This plan costs $894.5M a year, with $120.0M on transport." + CLOSING
    assert model == explain.MODELS[0]


def test_the_model_never_words_the_status_or_the_check():
    ask = scripted(GOOD)
    plain_english("network", FACTS, ask=ask)
    assert FACTS["status"] not in ask.calls[0]["user"]
    assert FACTS["audit_note"] not in ask.calls[0]["user"]
    assert FACTS["total_annual_cost"] in ask.calls[0]["user"]


@pytest.mark.parametrize("draft, why", [
    ("It costs $900M a year. {total_annual_cost} {transport_cost_per_year}", "digits"),
    ("It costs two lots. {total_annual_cost} {transport_cost_per_year}", "number word"),
    ("This is optimal. {total_annual_cost} {transport_cost_per_year}", "unsupported claim"),
    ("This is the cheapest plan. {total_annual_cost} {transport_cost_per_year}", "unsupported claim"),
    ("A network does not exist. {total_annual_cost} {transport_cost_per_year}", "unsupported claim"),
    ("CapEx is high. {total_annual_cost} {transport_cost_per_year}", "jargon"),
    ("The MILP finished. {total_annual_cost} {transport_cost_per_year}", "jargon"),
    ("It costs {made_up}. {total_annual_cost} {transport_cost_per_year}", "unknown placeholder"),
    ("Most of it is transport. {total_annual_cost} {transport_cost_per_year}", "unsupported claim"),
    ("It is {status}. {total_annual_cost} {transport_cost_per_year}", "unknown placeholder"),
    ("It costs {transport_cost_per_year}.", "{total_annual_cost} must appear"),
    ("It costs {total_annual_cost}.", "{transport_cost_per_year} must appear"),
    ("It costs {total_annual_cost {transport_cost_per_year}", "malformed"),
    ("It costs {total_annual_cost}.\n\nThen {transport_cost_per_year}.", "one paragraph"),
])
def test_a_draft_that_breaks_a_rule_is_rejected(draft, why):
    assert any(why in found for found in problems(draft, FACTS, "network"))


def test_a_clean_draft_has_no_problems():
    assert problems(GOOD, FACTS, "network") == []


def test_a_no_network_run_must_give_the_reason():
    facts = {"reason": "the airports need more fuel than the sites can make", "status": "No network could be found."}
    assert problems("Nothing was built.", facts, "no_network") == ["{reason} must appear"]


def test_a_rejected_draft_is_retried_with_the_reason():
    ask = scripted("It costs $900M. {total_annual_cost} {transport_cost_per_year}", GOOD)
    text, _ = plain_english("network", FACTS, ask=ask)
    assert "$894.5M" in text
    assert "digits" in ask.calls[1]["user"]


def test_no_clean_draft_shows_nothing_from_the_model():
    bad = "This is optimal. {total_annual_cost} {transport_cost_per_year}"
    ask = scripted(*[bad] * (explain.ATTEMPTS * len(explain.MODELS)))
    assert plain_english("network", FACTS, ask=ask) == (None, None)


def test_every_prompt_starts_with_the_project_context():
    ask = scripted(GOOD)
    plain_english("network", FACTS, ask=ask)
    assert ask.calls[0]["system"].startswith(PROJECT_CONTEXT)


def test_a_trace_adds_the_check_result_word_for_word():
    ask = scripted(TRACE_DRAFT)
    text, _ = plain_english("trace", TRACE_FACTS, ask=ask)
    assert text.startswith("4,200 tonnes goes from Site A to Depot B, or 12.0% of what arrives.")
    assert text.endswith(TRACE_FACTS["check_result"])
    assert TRACE_FACTS["check_result"] not in ask.calls[0]["user"]


@pytest.mark.parametrize("name", explain.REQUIRED["trace"])
def test_a_trace_draft_must_carry_every_route_figure(name):
    draft = TRACE_DRAFT.replace("{" + name + "}", "that")
    assert f"{{{name}}} must appear" in problems(draft, TRACE_FACTS, "trace")


def test_a_trace_draft_cannot_state_the_check_itself():
    draft = TRACE_DRAFT + " {check_result}"
    assert any("unknown placeholder" in found for found in problems(draft, TRACE_FACTS, "trace"))


def test_the_next_model_answers_when_the_first_is_overloaded(monkeypatch):
    monkeypatch.setattr(explain, "MODELS", ("first-model", "second-model"))
    ask = scripted(GeminiUnavailable("HTTP 503"), GOOD)
    text, model = plain_english("network", FACTS, ask=ask)
    assert model == "second-model"
    assert [c["model"] for c in ask.calls] == ["first-model", "second-model"]
    assert text.startswith("This plan costs $894.5M")


def test_every_model_failing_is_not_an_error():
    ask = scripted(*[GeminiUnavailable("HTTP 503")] * len(explain.MODELS))
    assert plain_english("network", FACTS, ask=ask) == (None, None)


def test_the_time_budget_stops_further_attempts(monkeypatch):
    ticks = iter([0.0, explain.BUDGET_S + 1])
    monkeypatch.setattr(explain, "monotonic", lambda: next(ticks))
    assert plain_english("network", FACTS, ask=scripted()) == (None, None)


def test_the_key_travels_in_a_header_and_never_in_the_url(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", SECRET)
    seen = {}

    def handler(request):
        seen.update(url=str(request.url), key=request.headers.get("x-goog-api-key"))
        return httpx.Response(200, json=reply("A sentence."))

    assert ask_gemini("gemini-test", "system", "user", client=gemini_client(handler)) == "A sentence."
    assert seen["key"] == SECRET
    assert SECRET not in seen["url"]
    assert "gemini-test:generateContent" in seen["url"]


@pytest.mark.parametrize("response", [
    httpx.Response(503, json={"error": {"status": "UNAVAILABLE"}}),
    httpx.Response(404, json={"error": {"status": "NOT_FOUND"}}),
    httpx.Response(200, json={"candidates": []}),
    httpx.Response(200, json={"promptFeedback": {"blockReason": "SAFETY"}}),
    httpx.Response(200, json=reply("Cut off mid sen", finish="MAX_TOKENS")),
    httpx.Response(200, json=reply("   ")),
    httpx.Response(200, text="not json"),
], ids=["503", "404", "no-candidates", "blocked", "cut-off", "blank", "not-json"])
def test_a_bad_gemini_reply_is_unavailable(monkeypatch, response):
    monkeypatch.setenv("GEMINI_API_KEY", SECRET)
    with pytest.raises(GeminiUnavailable):
        ask_gemini("gemini-test", "system", "user", client=gemini_client(lambda request: response))


def test_a_timeout_is_unavailable_and_does_not_name_the_key(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", SECRET)

    def handler(request):
        raise httpx.ReadTimeout("timed out", request=request)

    with pytest.raises(GeminiUnavailable) as caught:
        ask_gemini("gemini-test", "system", "user", client=gemini_client(handler))
    assert SECRET not in str(caught.value)


def test_no_key_makes_no_call(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.setattr(explain, "ENV_FILE", explain.ROOT / "no-such-env-file")

    def handler(request):
        raise AssertionError("no call without a key")

    with pytest.raises(GeminiUnavailable):
        ask_gemini("gemini-test", "system", "user", client=gemini_client(handler))


def test_the_key_is_read_from_the_env_file_when_the_process_has_none(monkeypatch, tmp_path):
    env_file = tmp_path / ".env"
    env_file.write_text(f"OTHER=1\nGEMINI_API_KEY={SECRET}\n")
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.setattr(explain, "ENV_FILE", env_file)
    assert explain.api_key() == SECRET


def test_route_needs_a_signed_in_user(api_client):
    client, _ = api_client
    response = client.post("/api/plain-english", json={"kind": "network", "facts": FACTS})
    assert response.status_code == 401


def test_route_returns_the_filled_text(api_client, signer, monkeypatch):
    client, _ = api_client
    monkeypatch.setattr(explain, "ask_gemini", scripted(GOOD))
    response = client.post("/api/plain-english", json={"kind": "network", "facts": FACTS},
                           headers={"Authorization": "Bearer "+signer()})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["text"].startswith("This plan costs $894.5M")
    assert body["model"] == explain.MODELS[0]
    assert body["run_id"] == response.headers["X-Run-ID"]


def test_route_explains_a_trace(api_client, signer, monkeypatch):
    client, _ = api_client
    monkeypatch.setattr(explain, "ask_gemini", scripted(TRACE_DRAFT))
    response = client.post("/api/plain-english", json={"kind": "trace", "facts": TRACE_FACTS},
                           headers={"Authorization": "Bearer "+signer()})
    assert response.status_code == 200, response.text
    assert response.json()["text"].endswith(TRACE_FACTS["check_result"])


def test_route_answers_200_with_no_text_when_gemini_is_down(api_client, signer, monkeypatch):
    client, _ = api_client
    monkeypatch.setattr(explain, "ask_gemini", scripted(*[GeminiUnavailable("HTTP 503")] * len(explain.MODELS)))
    response = client.post("/api/plain-english", json={"kind": "network", "facts": FACTS},
                           headers={"Authorization": "Bearer "+signer()})
    assert response.status_code == 200, response.text
    assert response.json()["text"] is None
    assert response.json()["model"] is None


def test_route_stops_calling_gemini_past_the_shared_cap(api_client, signer, monkeypatch):
    client, _ = api_client
    monkeypatch.setattr(explain, "MAX_CALLS_PER_MINUTE", 1)
    ask = scripted(GOOD)
    monkeypatch.setattr(explain, "ask_gemini", ask)
    headers = {"Authorization": "Bearer "+signer()}
    bodies = [client.post("/api/plain-english", json={"kind": "network", "facts": FACTS}, headers=headers) for _ in range(2)]
    assert [b.status_code for b in bodies] == [200, 200]
    assert bodies[0].json()["text"] is not None
    assert bodies[1].json()["text"] is None
    assert len(ask.calls) == 1


def test_the_cap_counts_each_gemini_call_not_each_click(monkeypatch):
    monkeypatch.setattr(explain, "MAX_CALLS_PER_MINUTE", 1)
    ask = scripted("This is optimal. {total_annual_cost} {transport_cost_per_year}", GOOD)
    assert plain_english("network", FACTS, ask=ask) == (None, None)
    assert len(ask.calls) == 1


def test_an_unknown_name_is_not_repeated_back(api_client, signer):
    client, _ = api_client
    response = client.post("/api/plain-english", json={"kind": "network", "facts": {**FACTS, "ignore_your_rules": "x"}},
                           headers={"Authorization": "Bearer "+signer()})
    assert response.status_code == 422
    assert "ignore_your_rules" not in response.text


@pytest.mark.parametrize("body", [
    {"kind": "network", "facts": {"status": "x", "audit_note": "y"}},
    {"kind": "network", "facts": {"total_annual_cost": "x", "audit_note": "y"}},
    {"kind": "no_network", "facts": {"status": "x"}},
    {"kind": "trace", "facts": {k: v for k, v in TRACE_FACTS.items() if k != "check_result"}},
    {"kind": "other", "facts": FACTS},
    {"kind": "network", "facts": {**FACTS, "Bad-Name": "x"}},
    {"kind": "network", "facts": {**FACTS, "ignore_your_rules": "x"}},
    {"kind": "no_network", "facts": {"reason": "x", "status": "y", "total_annual_cost": "z"}},
    {"kind": "network", "facts": {**FACTS, "transport_cost_per_year": "x" * 401}},
    {"kind": "network", "facts": {**FACTS, **{f"extra_{chr(97 + i)}": "x" for i in range(26)}}},
], ids=["no-total", "no-status", "no-reason", "no-check", "bad-kind", "bad-name", "unknown-name", "wrong-kind-name",
        "long-value", "too-many"])
def test_route_refuses_malformed_facts(api_client, signer, monkeypatch, body):
    client, _ = api_client
    assert explain.MAX_FACTS == max(len(names) for names in explain.ALLOWED.values())
    monkeypatch.setattr(explain, "ask_gemini", scripted())
    response = client.post("/api/plain-english", json=body, headers={"Authorization": "Bearer "+signer()})
    assert response.status_code == 422
