"""POST /api/explain: Gemini explains a finished run from facts computed here, never decides.

The model sees only the `facts` list built from the run, must cite fact ids, and every
number it writes is checked against those facts before anything is returned.
"""

import json
import logging
import os
import re
from collections import defaultdict
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

import httpx
from fastapi import APIRouter, Depends, HTTPException
from google import genai
from google.genai import errors, types
from pydantic import BaseModel, ValidationError

from api.auth import require_user
from solver.contract import CAPEX_YEARS, FIXED_OPEX_SHARE, VARIABLE_OPEX_USD_T, ContractModel, Scenario, Solution

DEFAULT_MODEL = "gemini-2.5-flash"
# Asked once, only when the main model is overloaded (429/503); both are stable Flash models.
FALLBACK_MODEL = "gemini-flash-latest"
BUSY_CODES = {429, 503, 504}
TIMEOUT_MS = 25_000
WITHHELD = "Explanation withheld: a number could not be verified against this run."
NO_KEY = "Explanations unavailable: no Gemini API key on the solver host"
GAP_TOL = 1e-9
AIRPORTS = ("BPN", "PNK", "TRK", "PKN")

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api", dependencies=[Depends(require_user)])

SYSTEM_PROMPT = """You explain a finished optimisation result to a SAF supply planner.
A MILP solver made every decision; you only explain what it found.
Rules:
- Use ONLY the facts provided. Copy every number verbatim from a fact value, including its units and format. Do not compute, round, add or convert numbers.
- Every point must cite the ids of the facts it uses in fact_ids.
- Unless the status fact says the run is optimal, describe it as "best found, gap X" using the gap fact.
- If any supply is stranded, mention it.
- Give no recommendations or opinions beyond the facts.
- headline: at most 20 words. points: 3 or 4, each at most 25 words. caveat: one short sentence on the main limit of this result, using only the facts."""


class ExplainRequest(ContractModel):
    scenario: Scenario
    solution: Solution
    baseline: Solution | None = None


class Point(BaseModel):
    text: str
    fact_ids: list[str]


class Explanation(BaseModel):
    headline: str
    points: list[Point]
    caveat: str


# ---------- Formatting: mirrors web/lib/format.ts so values match the UI ----------

def _num(value: float, dp: int) -> str:
    """Number.toLocaleString('en-US') with fixed decimals: rounds the shortest decimal form half up."""
    d = Decimal(repr(float(value))).quantize(Decimal(1).scaleb(-dp), rounding=ROUND_HALF_UP)
    return f"{d:,.{dp}f}"


def _fixed(value: float, dp: int) -> str:
    """Number.prototype.toFixed: rounds the exact binary value, ties up."""
    d = Decimal(float(value)).quantize(Decimal(1).scaleb(-dp), rounding=ROUND_HALF_UP)
    return f"{d:.{dp}f}"


def usd(value: float) -> str:
    a, sign = abs(value), "-" if value < 0 else ""
    if a >= 1e9:
        return f"{sign}${_num(a / 1e9, 2)}B"
    if a >= 1e6:
        return f"{sign}${_num(a / 1e6, 1)}M"
    if a >= 1e3:
        return f"{sign}${_num(a / 1e3, 1)}k"
    return f"{sign}${_num(a, 0)}"


def pct(fraction: float, dp: int = 1) -> str:
    return f"{_fixed(fraction * 100, dp)}%"


def kt(value: float, dp: int = 1) -> str:
    return f"{_num(value, dp)} kt"


def status_label(s: Solution) -> str:
    if s.status == "infeasible":
        return "No feasible network"
    if s.status == "heuristic":
        return "Heuristic baseline"
    if s.status == "no_solution":
        return "Could not find a network within the time limit"
    if s.status == "optimal" and s.gap is not None and abs(s.gap) <= GAP_TOL:
        return f"Optimal among {s.n_candidates} candidates"
    return "Best found, gap unknown" if s.gap is None else f"Best found, gap {pct(s.gap, 2)}"


def annual_total(s: Solution, yield_fraction: float) -> tuple[float, float, float, float, float]:
    """(annualised CapEx, fixed OpEx, variable OpEx, transport, total); mirrors web/lib/annual.ts."""
    annualised = s.annualised_capex_usd if s.annualised_capex_usd is not None else s.capex_usd / CAPEX_YEARS
    fixed = s.fixed_opex_usd if s.fixed_opex_usd is not None else s.capex_usd * FIXED_OPEX_SHARE
    variable = s.variable_opex_usd
    if variable is None:
        variable = 0.0
        for f in s.facilities:
            biomass_kt = f.throughput_kt if f.capacity_basis == "biomass_in" else f.throughput_kt / yield_fraction
            variable += biomass_kt * 1000 * VARIABLE_OPEX_USD_T[f.type][f.size]
    transport = s.logistics_annual_usd
    total = s.total_annual_usd if s.total_annual_usd is not None else annualised + fixed + variable + transport
    return annualised, fixed, variable, transport, total


# ---------- Facts ----------

def build_facts(scenario: Scenario, solution: Solution, baseline: Solution | None = None) -> list[dict]:
    s = solution
    facts: list[dict] = []

    def add(fact_id: str, label: str, value: str):
        facts.append({"id": fact_id, "label": label, "value": value})

    add("status", "Solver status", status_label(s))
    if s.status_reason:
        add("status_reason", "Status reason", s.status_reason)
    if s.gap is not None:
        add("gap", "MIP gap", pct(s.gap, 2))
    add("solve_seconds", "Solve time", f"{_fixed(s.solve_seconds, 1)} s")

    annualised, fixed, variable, transport, total = annual_total(s, scenario.yield_fraction)
    add("total_annual", "Total annual cost", usd(total) + "/yr")
    add("annualised_capex", "Annualised CapEx", usd(annualised) + "/yr")
    add("fixed_opex", "Fixed OpEx", usd(fixed) + "/yr")
    add("variable_opex", "Variable OpEx", usd(variable) + "/yr")
    add("transport", "Transport", usd(transport) + "/yr")
    add("capex_one_off", "One-off CapEx", usd(s.capex_usd))
    add("cost_basis", "Cost basis", f"CapEx straight-line over {CAPEX_YEARS} years; fixed OpEx {pct(FIXED_OPEX_SHARE, 0)} of CapEx per year")

    counts: dict[tuple[str, str], int] = defaultdict(int)
    for f in s.facilities:
        counts[(f.type, f.size)] += 1
    plural = {"depot": "depots", "refinery": "refineries"}
    for ftype in ("refinery", "depot"):
        for size in ("large", "small"):
            n = counts.get((ftype, size), 0)
            if n:
                add(f"count_{size}_{ftype}", f"{size.capitalize()} {plural[ftype]}", f"{n} {size} {ftype if n == 1 else plural[ftype]}")
    for f in sorted((f for f in s.facilities if f.type == "refinery"), key=lambda f: f.site_id):
        basis = "biomass in" if f.capacity_basis == "biomass_in" else "SAF out"
        add(f"refinery_{f.site_id}", f"Refinery {f.site_id}", f"{f.label}, {f.size}, {kt(f.throughput_kt)} {basis}")

    delivered: dict[str, float] = defaultdict(float)
    for flow in s.flows:
        if flow.leg == "refinery_airport":
            delivered[flow.to] += flow.kt
    served = [a for a in AIRPORTS if delivered.get(a, 0) > 0]
    add("airports_served", "Airports served", f"{len(served)} of {len(AIRPORTS)} airports" + (f" ({', '.join(served)})" if served else ""))
    for airport in AIRPORTS:
        add(f"saf_{airport}", f"SAF delivered to {airport}", kt(delivered.get(airport, 0.0)) + "/yr")
    add("saf_total", "Total SAF delivered", kt(sum(delivered.values())) + "/yr")

    for st in sorted(s.stranded, key=lambda st: st.site_id):
        add(f"stranded_{st.site_id}", f"Stranded at {st.site_id}", f"{st.label}: {kt(st.kt)}")
    add("stranded_total", "Total stranded supply", f"{kt(sum(st.kt for st in s.stranded))} at {len(s.stranded)} sites")

    add("audit", "Independent audit", "Passed" if s.validation.passed else "Failed")

    if baseline is not None:
        base_total = annual_total(baseline, scenario.yield_fraction)[4]
        saving = base_total - total
        add("baseline_total", "Greedy baseline total annual cost", usd(base_total) + "/yr")
        label = "Saving vs greedy baseline" if saving >= 0 else "Greedy baseline cheaper by"
        add("baseline_saving", label, usd(abs(saving)) + "/yr")
        if base_total:
            add("baseline_saving_pct", label + " (%)", pct(abs(saving) / base_total, 1))

    add("yield", "SAF yield", pct(scenario.yield_fraction, 1))
    add("road_factor", "Road factor", f"{scenario.road_factor:g}× great-circle distance")
    add("collection", "Supply collection", "All supply must be collected" if scenario.collection_policy == "all" else "Optional collection")
    add("capacity_basis", "Capacity basis", "Biomass input" if scenario.capacity_basis == "biomass_input" else "SAF output")
    demand = scenario.airport_demand(0.0)
    if len(set(demand.values())) == 1:
        each = next(iter(demand.values()))
        add("demand", "Airport demand", f"{kt(each, 0)} per airport, {kt(sum(demand.values()), 0)} total")
    else:
        add("demand", "Airport demand", ", ".join(f"{a} {kt(demand[a], 0)}" for a in AIRPORTS))
    return facts


# ---------- Grounding check ----------

# A number not glued to letters, digits or underscores (so KAL_SUP_12 is an id, not a number).
NUMBER = re.compile(r"(?<![A-Za-z0-9_.])\$?(\d[\d,]*(?:\.\d+)?)")


def numbers_in(text: str) -> set[Decimal]:
    """Numbers in text with $, commas, %, M/B/k and kt dropped: '$895.2M/yr' -> 895.2."""
    found = set()
    for match in NUMBER.finditer(text):
        try:
            found.add(Decimal(match.group(1).replace(",", "")).normalize())
        except InvalidOperation:
            continue
    return found


def verify(explanation: Explanation, facts: list[dict]) -> dict | None:
    """Return the grounded explanation, or None when it must be withheld."""
    ids = {f["id"] for f in facts}
    allowed = set().union(*(numbers_in(f["value"]) for f in facts))

    def grounded(text: str) -> bool:
        return numbers_in(text) <= allowed

    if not explanation.headline.strip() or not grounded(explanation.headline):
        return None
    points = [
        {"text": p.text, "fact_ids": list(dict.fromkeys(p.fact_ids))}
        for p in explanation.points
        if p.text.strip() and p.fact_ids and set(p.fact_ids) <= ids and grounded(p.text)
    ][:4]
    if len(points) < 2:
        return None
    caveat = explanation.caveat if grounded(explanation.caveat) else ""
    return {"headline": explanation.headline, "points": points, "caveat": caveat}


# ---------- Gemini ----------

_client: genai.Client | None = None


def get_client(api_key: str) -> genai.Client:
    """Built on first use, so the API starts and restarts without a key."""
    global _client
    if _client is None:
        _client = genai.Client(api_key=api_key, http_options=types.HttpOptions(timeout=TIMEOUT_MS))
    return _client


def ask_gemini(api_key: str, model: str, facts: list[dict]) -> Explanation:
    response = get_client(api_key).models.generate_content(
        model=model,
        contents="Facts from this run (JSON):\n" + json.dumps(facts, ensure_ascii=False),
        config=types.GenerateContentConfig(
            system_instruction=SYSTEM_PROMPT,
            response_mime_type="application/json",
            response_schema=Explanation,
        ),
    )
    if not response.text:
        raise ValueError("empty response")
    return Explanation.model_validate_json(response.text)


@router.post("/explain")
def explain(body: ExplainRequest) -> dict:
    # Read only GEMINI_API_KEY and pass it explicitly: the SDK would otherwise prefer GOOGLE_API_KEY.
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise HTTPException(503, NO_KEY)
    model = os.environ.get("GEMINI_MODEL", "").strip() or DEFAULT_MODEL
    facts = build_facts(body.scenario, body.solution, body.baseline)
    try:
        try:
            explanation = ask_gemini(api_key, model, facts)
        except errors.APIError as exc:
            if exc.code not in BUSY_CODES or model == FALLBACK_MODEL:
                raise
            log.warning("Gemini %s busy (%s); asking %s", model, exc.code, FALLBACK_MODEL)
            model = FALLBACK_MODEL
            explanation = ask_gemini(api_key, model, facts)
    except httpx.TimeoutException:
        log.warning("Gemini timed out after %d ms", TIMEOUT_MS)
        raise HTTPException(502, f"Gemini did not answer within {TIMEOUT_MS // 1000} s") from None
    except errors.ClientError as exc:
        log.warning("Gemini refused the request (%s)", exc.code)
        raise HTTPException(502, f"Gemini refused the request ({exc.code})") from None
    except errors.ServerError as exc:
        log.warning("Gemini server error (%s)", exc.code)
        raise HTTPException(502, f"Gemini server error ({exc.code})") from None
    except errors.APIError as exc:
        log.warning("Gemini API error (%s)", exc.code)
        raise HTTPException(502, f"Gemini API error ({exc.code})") from None
    except httpx.TransportError as exc:
        log.warning("Cannot reach Gemini (%s)", type(exc).__name__)
        raise HTTPException(502, "Cannot reach Gemini") from None
    except (ValidationError, ValueError):
        log.warning("Gemini returned no usable explanation")
        raise HTTPException(502, "Gemini returned no usable explanation") from None
    checked = verify(explanation, facts)
    if checked is None:
        return {"available": False, "reason": WITHHELD}
    return {"available": True, **checked, "facts": facts, "model": model, "verified": True}
