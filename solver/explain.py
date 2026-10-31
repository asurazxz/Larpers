"""Explanation paragraphs for stored runs. The solver decides; this only explains.

Run from the repo root, after solver.scenarios: python -m solver.explain [--slugs base,baseline]
The model writes prose with {named} placeholders and no figures of its own. Python fills every
value from the audited solution, so the model cannot misquote or compute a number. A draft that
breaks a rule is rejected, and a run with no clean draft gets no paragraph. Nothing here runs
as part of a solve, the key stays in .env, and web/ only reads the written file.
"""

import argparse
import json
import os
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

from solver.context import PROJECT_CONTEXT
from solver.scenarios import BUNDLE, ROOT, SOLVED, load_bundle, write_atomic

OUT = ROOT / "web" / "data" / "explanations.json"
MODEL = "gemini-3.6-flash"
SCHEMA_VERSION = 1
ATTEMPTS = 2
WORKERS = 4
MAX_WORDS = 90
MAX_TOKENS = 16000
TIMEOUT_MS = 120_000
HTTP_ATTEMPTS = 4
GAP_TOL = 1e-9

PLACEHOLDER = re.compile(r"\{([a-z_]+)\}")
NUMBER_WORDS = re.compile(
    r"\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|hundred|thousand"
    r"|million|billion|dozen|half|double|twice|triple|quarter)\b", re.I)
JARGON = re.compile(r"\b(capex|opex|milp|mip|annuali[sz]ed|haversine)\b", re.I)
# "Optimal" reaches the page only through status_label; the rest are claims no explanation can prove.
BANNED = re.compile(
    r"\b(optim\w*|cheapest|guarantee\w*|impossible|proven|proves?|does not exist|cannot exist|no solution exists)\b", re.I)

NOTES = {
    "our_assumptions": "the team's earlier assumptions, from before the organisers' 12:45 update",
}

SYSTEM = PROJECT_CONTEXT + """

You explain a finished plan for making sustainable aviation fuel in Kalimantan to someone with no \
background in finance, logistics or optimisation. An optimisation solver chose the plan and an independent audit \
checked it. You only explain what it decided.

You receive named values for one run. Write the paragraph with {name} placeholders wherever a value belongs, \
using the names exactly as given. The values are filled in afterwards, so the sentence must read naturally \
around each one.

Use everyday words: building costs, running costs, transport, fuel. Never write CapEx, OpEx, MILP or annualised. \
Never write a figure yourself: no digits and no number words, including "one" and "half". Do not calculate or \
compare anything beyond the values given. Do not give reasons the values do not state, and do not call the \
result the best or lowest possible. The {status} value says how sure we are, so it must appear.

Reply with the paragraph only: plain text, no more than three sentences and 60 words."""


class Declined(Exception):
    """The model stopped before finishing a paragraph."""


class RequestRefused(Exception):
    """The API refused the key or the request, so every other run would fail the same way."""


def usd(v):
    """Same text as usd() in web/lib/format.ts, so a paragraph matches the cost panel."""
    a, sign = abs(v), "-" if v < 0 else ""
    if a >= 1e9:
        return f"{sign}${a / 1e9:,.2f}B"
    if a >= 1e6:
        return f"{sign}${a / 1e6:,.1f}M"
    if a >= 1e3:
        return f"{sign}${a / 1e3:,.1f}k"
    return f"{sign}${a:,.0f}"


def kt(v):
    return f"{v:,.1f} kt"


def pct(fraction, dp=1):
    return f"{fraction * 100:.{dp}f}%"


def status_label(s):
    """Same text as statusLabel() in web/lib/format.ts. "Optimal" only when proven: status optimal and gap 0."""
    gap = s.get("gap")
    if s["status"] == "heuristic":
        return "Heuristic baseline"
    if s["status"] == "optimal" and gap is not None and abs(gap) <= GAP_TOL:
        return f"Optimal among {s['n_candidates']} candidates"
    return "Best found, gap unknown" if gap is None else f"Best found, gap {pct(gap, 2)}"


def scenario_note(entry):
    if entry.get("family") in NOTES:
        return NOTES[entry["family"]]
    parts = []
    for key, value in (entry.get("overrides") or {}).items():
        parts.append(", ".join(value) + " removed" if key == "excluded_ids" else f"{key} set to {value}")
    return "the case with " + "; ".join(parts) if parts else "the official base case"


def site_list(facilities):
    return ", ".join(f["label"] for f in facilities) or "none"


def refinery_sites(solution):
    return [f for f in solution["facilities"] if f["type"] == "refinery"]


def values(entry, runs):
    """Every value a paragraph may use, as display text taken from the audited solution."""
    s = entry["solution"]
    refineries = refinery_sites(s)
    depots = [f for f in s["facilities"] if f["type"] == "depot"]
    lines = {
        "the yearly share of building costs": s["annualised_capex_usd"],
        "fixed running costs": s["fixed_opex_usd"],
        "processing costs": s["variable_opex_usd"],
        "transport": s["logistics_annual_usd"],
    }
    largest = max(lines, key=lines.get)
    total = s["total_annual_usd"]
    out = {
        "scenario": scenario_note(entry),
        "status": status_label(s),
        "total_annual_cost": usd(total),
        "yearly_building_cost": usd(s["annualised_capex_usd"]),
        "fixed_running_cost": usd(s["fixed_opex_usd"]),
        "processing_cost": usd(s["variable_opex_usd"]),
        "transport_cost": usd(s["logistics_annual_usd"]),
        "largest_cost_line": largest,
        "largest_cost_share": pct(lines[largest] / total),
        "refinery_count": str(len(refineries)),
        "large_refinery_count": str(sum(f["size"] == "large" for f in refineries)),
        "small_refinery_count": str(sum(f["size"] == "small" for f in refineries)),
        "depot_count": str(len(depots)),
        "biomass_collected": kt(sum(f["kt"] for f in s["flows"] if f["leg"] == "supply_depot")),
        "saf_delivered": kt(sum(f["kt"] for f in s["flows"] if f["leg"] == "refinery_airport")),
        "unused_site_count": str(len(s["stranded"])),
        "unused_biomass": kt(sum(x["kt"] for x in s["stranded"])),
        "unused_reason": ", ".join(sorted({x["reason"] for x in s["stranded"]})) or "none",
    }
    base = runs.get("base")
    if base and entry["slug"] != "base" and base["solution"].get("total_annual_usd") is not None:
        base_total = base["solution"]["total_annual_usd"]
        before = {f["site_id"]: f for f in refinery_sites(base["solution"])}
        after = {f["site_id"]: f for f in refineries}
        out["change_from_base"] = f"{'+' if total >= base_total else ''}{usd(total - base_total)}"
        out["change_from_base_pct"] = f"{'+' if total >= base_total else ''}{pct((total - base_total) / base_total)}"
        out["refineries_added"] = site_list([f for k, f in after.items() if k not in before])
        out["refineries_removed"] = site_list([f for k, f in before.items() if k not in after])
    return out


def problems(template, vals):
    """Why a draft cannot be shown; empty when it can."""
    found = []
    names = set(PLACEHOLDER.findall(template))
    prose = PLACEHOLDER.sub("", template)
    if names - vals.keys():
        found.append("unknown placeholders: " + ", ".join(sorted(names - vals.keys())))
    if "status" not in names:
        found.append("{status} must appear")
    if re.search(r"\d", prose):
        found.append("digits outside placeholders")
    if "{" in prose or "}" in prose:
        found.append("malformed placeholder")
    if NUMBER_WORDS.search(prose):
        found.append(f"number word: {NUMBER_WORDS.search(prose).group()}")
    if BANNED.search(prose):
        found.append(f"unsupported claim: {BANNED.search(prose).group()}")
    if JARGON.search(prose):
        found.append(f"jargon: {JARGON.search(prose).group()}")
    if "\n" in template.strip():
        found.append("must be one paragraph")
    if len(template.split()) > MAX_WORDS:
        found.append(f"over {MAX_WORDS} words")
    return found


def render(template, vals):
    return PLACEHOLDER.sub(lambda m: vals[m.group(1)], template)


def prompt(vals, rejected=None):
    text = "Values for this run:\n" + json.dumps(vals, indent=1)
    if rejected:
        text += "\n\nYour last draft was rejected: " + "; ".join(rejected) + "."
    return text


def explain_run(entry, runs, call, clock=lambda: datetime.now(timezone.utc).isoformat(timespec="seconds")):
    """One checked paragraph record, or None when no draft passes."""
    vals = values(entry, runs)
    rejected = None
    for _ in range(ATTEMPTS):
        template, model = call(prompt(vals, rejected))
        rejected = problems(template, vals)
        if not rejected:
            s = entry["solution"]
            return {
                "slug": entry["slug"],
                "run_id": s["run_id"],
                "data_hash": s["data_hash"],
                "scenario_hash": s["scenario_hash"],
                "text": render(template, vals),
                "template": template,
                "values": vals,
                "model": model,
                "generated_at": clock(),
            }
    return None


def eligible(entry):
    """Finished, audited runs on the official cost basis. A stub, or a run with no annual total, has nothing to explain."""
    s = entry["solution"]
    return (entry.get("status") in SOLVED and not entry.get("stub") and s["validation"]["passed"]
            and s.get("total_annual_usd") is not None)


def is_current(record, entry):
    s = entry["solution"]
    return all(record.get(k) == s[k] for k in ("run_id", "data_hash", "scenario_hash"))


def make_call(client, model=MODEL):
    from google.genai import errors, types

    config = types.GenerateContentConfig(system_instruction=SYSTEM, max_output_tokens=MAX_TOKENS)

    def call(user):
        try:
            response = client.models.generate_content(model=model, contents=user, config=config)
        except errors.ClientError as exc:
            if exc.code == 429:
                raise
            raise RequestRefused(f"{exc.code} {exc.status}") from None
        candidate = (response.candidates or [None])[0]
        if candidate is None or candidate.finish_reason != types.FinishReason.STOP:
            raise Declined(f"stopped with {candidate.finish_reason if candidate else 'no candidate'}")
        return (response.text or "").strip(), response.model_version or model
    return call


def run(runs, explanations, call, slugs=None, fatal_errors=(), skip_errors=(), log=print):
    """Fills explanations for each run still missing one; returns the slugs that got none."""
    todo = {slug: e for slug, e in runs.items()
            if eligible(e) and slug not in explanations and (not slugs or slug in slugs)}
    failed = {}
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futures = {pool.submit(explain_run, e, runs, call): slug for slug, e in todo.items()}
        for future in as_completed(futures):
            slug = futures[future]
            try:
                record = future.result()
            except fatal_errors:
                raise
            except (Declined, *skip_errors) as exc:
                failed[slug] = str(exc)
                continue
            if record is None:
                failed[slug] = f"no clean draft in {ATTEMPTS} attempts"
                continue
            explanations[slug] = record
            log(f"  {slug}: {record['text']}")
    return failed


def main():
    parser = argparse.ArgumentParser(description="Write checked explanation paragraphs for stored runs.")
    parser.add_argument("--bundle", default=str(BUNDLE))
    parser.add_argument("--out", default=str(OUT))
    parser.add_argument("--slugs", default="", help="comma-separated; default every eligible run")
    parser.add_argument("--model", default=MODEL, help="another Gemini model, if this one is overloaded")
    args = parser.parse_args()

    import httpx
    from dotenv import load_dotenv
    from google import genai
    from google.genai import errors, types

    load_dotenv(ROOT / ".env")
    if not os.environ.get("GEMINI_API_KEY"):
        raise SystemExit("Set GEMINI_API_KEY in .env first")
    runs = load_bundle(args.bundle).get("runs", {})
    wanted = {s.strip() for s in args.slugs.split(",") if s.strip()}
    if wanted - runs.keys():
        parser.error("not in the bundle: " + ", ".join(sorted(wanted - runs.keys())))
    out = Path(args.out)
    stored = load_bundle(out).get("runs", {})
    explanations = {slug: r for slug, r in stored.items() if slug in runs and is_current(r, runs[slug])}

    client = genai.Client(api_key=os.environ["GEMINI_API_KEY"], http_options=types.HttpOptions(
        timeout=TIMEOUT_MS, retry_options=types.HttpRetryOptions(attempts=HTTP_ATTEMPTS)))
    try:
        failed = run(runs, explanations, make_call(client, args.model), slugs=wanted, fatal_errors=(RequestRefused,),
                     skip_errors=(errors.APIError, httpx.HTTPError))
    except RequestRefused as exc:
        raise SystemExit(f"Gemini refused the request ({exc}); no new paragraphs") from None
    finally:
        write_atomic(out, {
            "schema_version": SCHEMA_VERSION,
            "label": "Stored explanations of stored runs. Every figure is filled from the solution.",
            "runs": dict(sorted(explanations.items())),
        })
    skipped = sum(not eligible(e) for e in runs.values())
    print(f"\n{len(explanations)} paragraphs in {out}; {len(failed)} failed; "
          f"{skipped} of {len(runs)} runs skipped (not solved, not audited or no annual total)")
    for slug, reason in sorted(failed.items()):
        print(f"  {slug}: {reason}")
    if not explanations:
        raise SystemExit("No paragraphs written. Run python -m solver.scenarios on the official parameters first.")


if __name__ == "__main__":
    main()
