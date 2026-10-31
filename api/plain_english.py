"""Plain-English wording for the run on screen, written by Gemini when someone presses the button.

The solver decides; this only words what it decided. The browser sends the run's figures as display
text, Gemini writes sentences with {named} blanks and no figures of its own, and every value is filled
in here, so the model cannot misquote or compute a number. How sure we are and what the audit found
are added word for word, so the model cannot reword them. A draft that breaks a rule is rejected.
If no clean draft arrives in time the answer is empty, and the browser shows its fixed wording.
"""

import json
import logging
import os
import re
from collections import deque
from pathlib import Path
from threading import Lock
from time import monotonic
from typing import Annotated, Literal

import httpx
from dotenv import dotenv_values
from pydantic import Field, model_validator

from solver.context import PROJECT_CONTEXT
from solver.contract import ContractModel

ROOT = Path(__file__).resolve().parents[1]
ENV_FILE = ROOT / ".env"
URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
# Lite answers in 1 to 2 s. 3.6 took 18 to 25 s and stopped at MAX_TOKENS; 3.5, 3.7 and 3.8 timed out (31 Oct, 15:03 SGT).
MODELS = ("gemini-3.5-flash-lite",)
ATTEMPTS = 2
TIMEOUT_S = 8.0
BUDGET_S = 15.0
MAX_WORDS = 100
MAX_CALLS_PER_MINUTE = 30

Kind = Literal["network", "no_network", "trace"]
REQUIRED = {
    "network": ("total_annual_cost",),
    "no_network": ("reason",),
    "trace": ("amount_moved", "from_place", "to_place", "share_of_destination_supply", "route_distance",
              "recalculated_cost", "plan_transport_cost", "cost_difference"),
}
CLOSING = {"network": ("status", "audit_note"), "no_network": ("status",), "trace": ("check_result",)}
COST_LINES = ("build_cost_per_year", "upkeep_cost_per_year", "processing_cost_per_year", "transport_cost_per_year")
# The only names the page sends (web/lib/explain.ts, web/lib/traceFacts.ts), so this route cannot carry a free-form prompt.
ALLOWED = {
    "network": {*REQUIRED["network"], *CLOSING["network"], *COST_LINES, "upfront_build_cost", "build_cost_years",
                "refineries", "depots", "fuel_delivered", "saving_against_simple_plan",
                "saving_share_of_simple_plan", "extra_cost_against_simple_plan"},
    "no_network": {*REQUIRED["no_network"], *CLOSING["no_network"]},
    "trace": {*REQUIRED["trace"], *CLOSING["trace"], "cargo", "transport_mode", "route_role",
              "straight_line_distance", "road_factor", "rate_per_tonne_km", "stored_cost", "allowed_difference"},
}

PLACEHOLDER = re.compile(r"\{([a-z_]+)\}")
NUMBER_WORDS = re.compile(
    r"\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|hundred|thousand"
    r"|million|billion|dozen|half|double|twice|triple|quarter)\b", re.I)
# "Optimal" reaches the page only through the status value; the rest are claims no explanation can prove.
BANNED = re.compile(
    r"\b(optim\w*|cheapest|lowest|best|most|guarantee\w*|impossible|proven|proves?|does not exist|cannot exist"
    r"|no solution exists)\b", re.I)
JARGON = re.compile(r"\b(capex|opex|milp|mip|heuristic|baseline|primal|solver|audit\w*)\b", re.I)

SYSTEM = PROJECT_CONTEXT + """

You explain one planning result to a person with no background in logistics, finance or mathematics. You only say \
what the result means.

You receive named values. Write with {name} placeholders wherever a value belongs, using only the names listed. \
The values are filled in afterwards, so each sentence must read naturally around them.

Use everyday words, and never write CapEx, OpEx, MILP, heuristic, baseline, solver or audit. Say "plant material" \
and "sustainable aviation fuel", with no other names for them. Never write a figure yourself: no digits and no \
number words, including "one" and "half". Do not calculate or compare anything beyond the values given, and do not \
give reasons the values do not state. Never call anything the best, lowest, cheapest or optimal, do not say how \
good the plan is, and never say "most": say "the largest share".

Reply with one plain-text paragraph only, at most four sentences and 80 words."""

TASK = {
    "network": "Start with what the plan costs a year, which is {total_annual_cost}. Then give each part of that cost with its "
               "amount: {build_cost_per_year} is the up-front build cost of {upfront_build_cost} spread evenly over "
               "{build_cost_years} years, {upkeep_cost_per_year} is yearly upkeep, {processing_cost_per_year} is "
               "handling and processing the plant material, and {transport_cost_per_year} is moving the plant "
               "material and the fuel. Then say what it builds and delivers with {refineries}, {depots} and "
               "{fuel_delivered}. If saving_against_simple_plan is listed, write exactly: It costs "
               "{saving_against_simple_plan} a year less than a simple rule-of-thumb plan, a saving of "
               "{saving_share_of_simple_plan}. If extra_cost_against_simple_plan is listed, write exactly: It costs "
               "{extra_cost_against_simple_plan} a year more than a simple rule-of-thumb plan. Do not say how sure "
               "we are or whether the plan was checked; that is added afterwards.",
    "no_network": "Say why no network was built with {reason}, and say there is no cost to show because nothing was "
                  "built. Do not say how sure we are; that is added afterwards.",
    "trace": "Explain this route to someone seeing it for the first time, and say how it fits into the bigger plan. "
             "Say that {amount_moved} of {cargo} goes by {transport_mode} each year from {from_place} to {to_place}, "
             "and what this step does: {route_role}. Say it carries {share_of_destination_supply} of what reaches "
             "{to_place}. Then explain the distance: the straight line between them is {straight_line_distance}, and "
             "it is multiplied by {road_factor} because real routes are not straight, giving {route_distance}. Then "
             "explain the cost: the amount times the distance times {rate_per_tonne_km} per tonne for each km gives "
             "{recalculated_cost} a year, out of {plan_transport_cost} a year of transport across the whole plan. The "
             "plan has {stored_cost} stored, a gap of {cost_difference} against an allowed {allowed_difference}. Do "
             "not say whether the check passed; that is added afterwards.",
}

FactName = Annotated[str, Field(pattern=r"^[a-z_]+$", max_length=40)]
FactText = Annotated[str, Field(min_length=1, max_length=400)]


class GeminiUnavailable(Exception):
    """Gemini gave no usable reply. The message names the cause and never the key."""


class ExplainRequest(ContractModel):
    kind: Kind
    facts: dict[FactName, FactText]

    @model_validator(mode="after")
    def has_required_facts(self):
        if missing := [name for name in (*REQUIRED[self.kind], *CLOSING[self.kind]) if name not in self.facts]:
            raise ValueError("facts must include " + ", ".join(missing))
        if unknown := sorted(self.facts.keys() - ALLOWED[self.kind]):
            raise ValueError("unknown facts: " + ", ".join(unknown))
        return self


class ExplainResponse(ContractModel):
    run_id: str
    text: str | None
    model: str | None


recent_calls = deque()
calls_lock = Lock()


def allow_call() -> bool:
    """A cap shared by all users, so no signed-in client can spend the key without limit."""
    now = monotonic()
    with calls_lock:
        while recent_calls and now - recent_calls[0] > 60:
            recent_calls.popleft()
        if len(recent_calls) >= MAX_CALLS_PER_MINUTE:
            return False
        recent_calls.append(now)
        return True


def api_key() -> str:
    """The process environment, else this one value from the root .env. Server side only."""
    return os.getenv("GEMINI_API_KEY", "").strip() or (dotenv_values(ENV_FILE).get("GEMINI_API_KEY") or "").strip()


def ask_gemini(model, system, user, client=None) -> str:
    key = api_key()
    if not key:
        raise GeminiUnavailable("GEMINI_API_KEY is not set")
    body = {
        "systemInstruction": {"parts": [{"text": system}]},
        "contents": [{"role": "user", "parts": [{"text": user}]}],
        "generationConfig": {"temperature": 0.3, "maxOutputTokens": 2048},
    }
    try:
        response = (client or httpx).post(
            URL.format(model=model), headers={"x-goog-api-key": key}, json=body, timeout=TIMEOUT_S)
    except httpx.HTTPError as exc:
        raise GeminiUnavailable(type(exc).__name__) from None
    if response.status_code != 200:
        raise GeminiUnavailable(f"HTTP {response.status_code}")
    try:
        candidate = response.json()["candidates"][0]
        text = "".join(part.get("text", "") for part in candidate["content"]["parts"]).strip()
    except (ValueError, KeyError, IndexError, TypeError):
        raise GeminiUnavailable("no text in the reply") from None
    if candidate.get("finishReason") != "STOP" or not text:
        raise GeminiUnavailable(f"finished with {candidate.get('finishReason')}")
    return text


def visible(facts, kind) -> dict:
    """The values the model may place. The closing sentences are not among them."""
    return {name: value for name, value in facts.items() if name not in CLOSING[kind]}


def problems(template, facts, kind) -> list[str]:
    """Why a draft cannot be shown; empty when it can."""
    found = []
    shown = visible(facts, kind)
    names = set(PLACEHOLDER.findall(template))
    prose = PLACEHOLDER.sub("", template)
    if names - shown.keys():
        found.append("unknown placeholders: " + ", ".join(sorted(names - shown.keys())))
    needed = (*REQUIRED[kind], *(line for line in COST_LINES if line in shown))
    found += [f"{{{name}}} must appear" for name in needed if name not in names]
    if re.search(r"\d", prose):
        found.append("digits outside placeholders")
    if "{" in prose or "}" in prose:
        found.append("malformed placeholder")
    for pattern, label in ((NUMBER_WORDS, "number word"), (BANNED, "unsupported claim"), (JARGON, "jargon")):
        if match := pattern.search(prose):
            found.append(f"{label}: {match.group()}")
    if "\n" in template.strip():
        found.append("must be one paragraph")
    if len(template.split()) > MAX_WORDS:
        found.append(f"over {MAX_WORDS} words")
    return found


def render(template, facts, kind) -> str:
    filled = PLACEHOLDER.sub(lambda match: facts[match.group(1)], template)
    return " ".join((filled, *(facts[name] for name in CLOSING[kind])))


def prompt(facts, kind, rejected=None) -> str:
    text = TASK[kind] + "\n\nValues for this run:\n" + json.dumps(visible(facts, kind), indent=1)
    if rejected:
        text += "\n\nYour last draft was rejected: " + "; ".join(rejected) + "."
    return text


def plain_english(kind, facts, ask=None) -> tuple[str | None, str | None]:
    """(text, model) from the first clean draft, or (None, None) when Gemini gives none in time."""
    ask = ask or ask_gemini
    deadline = monotonic() + BUDGET_S
    for model in MODELS:
        rejected = None
        for _ in range(ATTEMPTS):
            if monotonic() >= deadline:
                return None, None
            try:
                template = ask(model, SYSTEM, prompt(facts, kind, rejected))
            except GeminiUnavailable as exc:
                logging.getLogger(__name__).warning("Gemini %s: %s", model, exc)
                break
            rejected = problems(template, facts, kind)
            if not rejected:
                return render(template, facts, kind), model
    return None, None
