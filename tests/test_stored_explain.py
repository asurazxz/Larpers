import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from solver import explain
from solver.context import PROJECT_CONTEXT
from solver.explain import Declined, RequestRefused, explain_run, is_current, make_call, problems, render, run, status_label, usd, values

ROOT = Path(__file__).resolve().parent.parent
TEMPLATE = "In {scenario}, the network costs {total_annual_cost} a year. Status: {status}."


def facility(site_id, kind="refinery", size="large", label=None):
    return {"site_id": site_id, "label": label or f"{site_id} Ketapang", "type": kind, "size": size}


def solution(total=900e6, gap=0.0, status="optimal", refineries=("KAL_SUP_01",), scenario_hash="s1", run_id="r1"):
    return {
        "run_id": run_id, "data_hash": "d1", "scenario_hash": scenario_hash, "status": status, "gap": gap,
        "n_candidates": 20,
        "facilities": [facility(r) for r in refineries] + [facility("KAL_SUP_40", "depot", "small")],
        "flows": [{"leg": "supply_depot", "kt": 6000.0}, {"leg": "refinery_airport", "kt": 1200.0}],
        "stranded": [{"kt": 800.0, "reason": "not needed for demand"}], "surplus": [], "validation": {"passed": True},
        "annualised_capex_usd": 400e6, "fixed_opex_usd": 80e6, "variable_opex_usd": 320e6,
        "logistics_annual_usd": 100e6, "total_annual_usd": total,
    }


def entry(slug="base", family="base", overrides=None, **kwargs):
    s = solution(**kwargs)
    return {"slug": slug, "family": family, "status": s["status"], "stub": False, "overrides": overrides or {}, "solution": s}


def scripted(*drafts):
    replies = iter(drafts)
    prompts = []

    def call(user):
        prompts.append(user)
        return next(replies), "test-model"
    call.prompts = prompts
    return call


def test_every_prompt_carries_the_project_context():
    from api.explain import SYSTEM_PROMPT
    from api.plain_english import SYSTEM as BUTTON_SYSTEM

    for prompt in (explain.SYSTEM, BUTTON_SYSTEM, SYSTEM_PROMPT):
        assert prompt.startswith(PROJECT_CONTEXT)
    assert "Kalimantan" in PROJECT_CONTEXT and "Airbus" in PROJECT_CONTEXT


def test_render_fills_every_figure_from_the_solution():
    e = entry()
    vals = values(e, {"base": e})
    assert problems(TEMPLATE, vals) == []
    assert render(TEMPLATE, vals) == (
        "In the official base case, the network costs $900.0M a year. Status: Optimal among 20 candidates.")


def test_values_match_the_solution_arithmetic():
    e = entry()
    vals = values(e, {"base": e})
    assert vals["largest_cost_line"] == "the yearly share of building costs"
    assert vals["largest_cost_share"] == "44.4%"
    assert vals["biomass_collected"] == "6,000.0 kt"
    assert vals["saf_delivered"] == "1,200.0 kt"
    assert vals["unused_site_count"] == "1"
    assert vals["unused_biomass"] == "800.0 kt"
    assert vals["unused_reason"] == "not needed for demand"


def test_comparison_with_base():
    base = entry(total=900e6)
    other = entry("no_refinery_KAL_SUP_01", "disruption", {"excluded_ids": ["KAL_SUP_01"]}, total=990e6,
                  refineries=("KAL_SUP_02",), scenario_hash="s2", run_id="r3")
    runs = {"base": base, other["slug"]: other}
    assert "change_from_base" not in values(base, runs)
    vals = values(other, runs)
    assert vals["change_from_base"] == "+$90.0M"
    assert vals["change_from_base_pct"] == "+10.0%"
    assert vals["refineries_added"] == "KAL_SUP_02 Ketapang"
    assert vals["refineries_removed"] == "KAL_SUP_01 Ketapang"
    assert vals["scenario"] == "the case with KAL_SUP_01 removed"


@pytest.mark.parametrize("draft, expected", [
    ("Costs $900M. {status}.", "digits"),
    ("{status} across 6 refineries.", "digits"),
    ("{status} across six refineries.", "number word"),
    ("{status}, roughly half of it transport.", "number word"),
    ("{status} and {made_up_value}.", "unknown placeholders"),
    ("The total is {total_annual_cost}.", "{status} must appear"),
    ("{status}. This is the optimal network.", "unsupported claim"),
    ("{status}. This is the cheapest network.", "unsupported claim"),
    ("{status}. A cheaper plan does not exist.", "unsupported claim"),
    ("{status}. The total is {Total}.", "malformed placeholder"),
    ("{status}. Most of it is CapEx.", "jargon"),
    ("{status}. The annualised figure is {total_annual_cost}.", "jargon"),
    ("{status}.\n\nA second paragraph.", "one paragraph"),
    ("{status} " + "word " * 100, "over 90 words"),
])
def test_rejected_drafts(draft, expected):
    e = entry()
    assert any(expected in p for p in problems(draft, values(e, {"base": e})))


@pytest.mark.parametrize("status, gap, expected", [
    ("optimal", 0.0, "Optimal among 20 candidates"),
    ("optimal", 0.003, "Best found, gap 0.30%"),
    ("best_found", 0.005, "Best found, gap 0.50%"),
    ("best_found", None, "Best found, gap unknown"),
    ("heuristic", None, "Heuristic baseline"),
])
def test_status_label_says_optimal_only_at_gap_zero(status, gap, expected):
    assert status_label({"status": status, "gap": gap, "n_candidates": 20}) == expected


@pytest.mark.parametrize("value, expected", [
    (1.64e9, "$1.64B"), (894.46e6, "$894.5M"), (12_300, "$12.3k"), (950, "$950"), (-90e6, "-$90.0M"),
])
def test_usd_matches_the_web_format(value, expected):
    assert usd(value) == expected


def test_retry_tells_the_model_why_and_keeps_the_clean_draft():
    e = entry()
    call = scripted("Costs $900M.", TEMPLATE)
    record = explain_run(e, {"base": e}, call)
    assert record["template"] == TEMPLATE
    assert record["model"] == "test-model"
    assert "digits outside placeholders" in call.prompts[1]
    assert is_current(record, e)


def test_run_with_no_clean_draft_gets_no_paragraph():
    e = entry()
    explanations = {}
    failed = run({"base": e}, explanations, scripted("Costs $900M.", "Still 6 sites."), log=lambda _: None)
    assert explanations == {}
    assert "no clean draft" in failed["base"]


def test_declined_run_is_recorded_not_raised():
    e = entry()

    def call(_):
        raise explain.Declined("stopped with refusal")
    explanations = {}
    assert run({"base": e}, explanations, call, log=lambda _: None) == {"base": "stopped with refusal"}


def test_fatal_error_stops_the_job():
    e = entry()

    def call(_):
        raise PermissionError("bad key")
    with pytest.raises(PermissionError):
        run({"base": e}, {}, call, fatal_errors=(PermissionError,), skip_errors=(OSError,), log=lambda _: None)


@pytest.mark.parametrize("change", [
    {"status": "infeasible"},
    {"stub": True},
])
def test_unfinished_runs_are_never_explained(change):
    e = {**entry(), **change}
    explanations = {}
    assert run({"base": e}, explanations, scripted(), log=lambda _: None) == {}
    assert explanations == {}


def test_failed_audit_and_old_cost_basis_are_never_explained():
    failed_audit, old_basis = entry(), entry()
    failed_audit["solution"]["validation"]["passed"] = False
    old_basis["solution"]["total_annual_usd"] = None
    for e in (failed_audit, old_basis):
        explanations = {}
        assert run({"base": e}, explanations, scripted(), log=lambda _: None) == {}
        assert explanations == {}


def test_rerun_makes_a_stored_paragraph_stale():
    e = entry()
    record = explain_run(e, {"base": e}, scripted(TEMPLATE))
    assert is_current(record, e)
    assert not is_current(record, entry(run_id="r9"))
    assert not is_current(record, entry(scenario_hash="s9"))


class FakeModels:
    def __init__(self, outcome):
        self.outcome = outcome

    def generate_content(self, **kwargs):
        if isinstance(self.outcome, Exception):
            raise self.outcome
        return self.outcome


def fake_client(outcome):
    return SimpleNamespace(models=FakeModels(outcome))


def fake_response(reason, text="{status}."):
    pytest.importorskip("google.genai")
    from google.genai import types

    return SimpleNamespace(candidates=[SimpleNamespace(finish_reason=types.FinishReason[reason])], text=text,
                           model_version="gemini-test")


def client_error(code, status):
    pytest.importorskip("google.genai")
    from google.genai import errors

    return errors.ClientError(code, {"error": {"code": code, "status": status, "message": "x"}})


def test_make_call_returns_the_text_and_the_model_that_served_it():
    assert make_call(fake_client(fake_response("STOP")))("hi") == ("{status}.", "gemini-test")


@pytest.mark.parametrize("reason", ["SAFETY", "MAX_TOKENS", "RECITATION"])
def test_make_call_never_keeps_an_unfinished_reply(reason):
    with pytest.raises(Declined):
        make_call(fake_client(fake_response(reason)))("hi")


def test_make_call_with_no_candidate_is_declined():
    pytest.importorskip("google.genai")
    with pytest.raises(Declined):
        make_call(fake_client(SimpleNamespace(candidates=None, text=None, model_version=None)))("hi")


@pytest.mark.parametrize("code, status", [(400, "INVALID_ARGUMENT"), (403, "PERMISSION_DENIED"), (404, "NOT_FOUND")])
def test_bad_key_or_request_stops_the_job(code, status):
    with pytest.raises(RequestRefused):
        make_call(fake_client(client_error(code, status)))("hi")


def test_rate_limit_is_left_to_fail_one_run():
    with pytest.raises(type(client_error(429, "RESOURCE_EXHAUSTED"))):
        make_call(fake_client(client_error(429, "RESOURCE_EXHAUSTED")))("hi")


def test_stored_paragraphs_still_match_their_runs():
    bundle = json.loads((ROOT / "web" / "data" / "bundle.json").read_text())["runs"]
    stored = json.loads((ROOT / "web" / "data" / "explanations.json").read_text())["runs"]
    for slug, record in stored.items():
        if slug in bundle and is_current(record, bundle[slug]):
            assert values(bundle[slug], bundle) == record["values"]
            assert problems(record["template"], record["values"]) == []
            assert render(record["template"], record["values"]) == record["text"]


def test_no_decision_code_reads_the_explanation():
    for name in ("model.py", "audit.py", "baseline.py", "scenarios.py", "sensitivity.py", "candidates.py"):
        assert "explain" not in (ROOT / "solver" / name).read_text()
