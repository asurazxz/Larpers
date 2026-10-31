# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Larpers' entry for Airbus Challenge #3 (Kalimantan SAF supply chain network design) at Autonomous SG 2026: a two-echelon capacitated facility location MILP behind a map UI. Scope freezes at 14:00 SGT on 31 Oct 2026, team submission target is 15:30, submissions close at 16:15. Time discipline is scored on the first valid submission.

- `docs/COMBINED_PROPOSAL.md`: the approved plan. It overrides the brief wherever they differ.
- `docs/prompts/`: each member's task list, file ownership and gates.
- `resource/CHALLENGE3_ORCHESTRATOR_PROMPT.md`: the original brief, background only.
- `resource/Autonomous SG 2026_Summary of Updates.pdf`: the organisers' 12:45 update ("Read this first" and the Airbus Challenge #3 section). The judging rubrics are unchanged.
- `resource/Autonomous SG 2026_Airbus Track.pdf`: the official problem (Challenge #3, pp. 3-4) and judging rubric (pp. 7-8).

## Source of truth

Order of authority: the organisers' 12:45 update (`resource/Autonomous SG 2026_Summary of Updates.pdf` and its two official data files, `data/raw/challenge3_parameters.xlsx` and `data/raw/challenge3_airports_4.csv`), then the Airbus PDF, then the rest of `data/raw/`, then the brief. Nothing outranks the update, and it also overrides `docs/COMBINED_PROPOSAL.md`. The brief has errors, verified against these sources. Do not reuse these brief values:

| Item | Brief says | Correct |
|---|---|---|
| Refinery→airport cost | 0.15 USD/t/km | **0.08** USD/t/km (PDF p. 3). Other legs are right: 0.10, 0.12 |
| Truck sizes (small/large) | 10, 20, 40 t | 3/9 t, 18/30 t, 16/32 t per leg. Cost per tonne-km is the same for both sizes (update), so this affects trip counts only |
| Airport demand | PNK 56%, BPN 31%, TRK 8%, PKN 5% | **300 kt** SAF per airport per year, 1,200 kt total (update). Passenger-share splits no longer apply |
| North Kalimantan sites | "760 km from everything" | KAL_SUP_18 and KAL_SUP_70 are 681 and 706 km from the centroid, 88 and 57 km from TRK airport, and 304+ km from any other supply site |
| Capacity and yield | One large refinery fits: 6,800 × 0.16 "≈ 1,087" | Capacity is **biomass intake** for depots and refineries, so that sum no longer applies. Yield is **0.20** and depots lose no mass (update). Demand needs 6,000 kt of biomass, not all 6,800 kt, and at least 6 refineries |
| Cost basis | OpEx not modelled | One-year basis. CapEx straight-line over 20 years, no interest. Fixed OpEx 5% of CapEx per year. Variable OpEx per tonne in: depot $5/$4, refinery $60/$55, small/large (update) |
| Road factor | 1.4 | **1.3** × great-circle distance (update). 1.9 was our own measurement on 1,954 pairs, kept only as a sensitivity |
| Tarakan access | Not covered | Island: last leg is a barge at 0.08 USD/t/km, no extra fixed cost. Trucks cannot reach it (update) |
| Facility candidates | All 80 sites | Anywhere on land in Kalimantan (update). Depot candidates are the 69 onshore sites. 11 Ketapang sites plot in the sea and are supply only |

The evidence pack in brief Section 4 is unverified; check a source before citing it in a judged claim.

The solver keeps a 214 km straight-line supply-leg haul limit and one facility of each type per site as our stated assumptions; neither is official. Judges accept reasonable assumptions stated clearly in the demo.

## Commands

These are the planned entry points from the brief's definition of done. Check that a file exists before relying on it. Run everything from the repo root.

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
python data/prepare.py                  # validate raw data, write data/processed/
python -m solver.model                  # base case: objective, MIP gap, solve time
python -m solver.baseline               # greedy baseline objective
python -m solver.sensitivity            # assumption sweeps, selection frequency
python -m solver.scenarios              # stored runs into web/data/bundle.json
python -m solver.explain                # stored paragraphs into web/data/explanations.json, after scenarios
uvicorn api.main:app --port 8000        # local solver API
python -m pytest tests/                 # all tests
python -m pytest tests/test_data.py::test_name   # single test
cd web && npm run dev                   # frontend
```

## Toolchain

- Use Python 3.12 or newer. The pinned numpy has no 3.11 wheel on macOS arm64.
- Pin `pulp==2.9.0` with `highspy==1.15.1`. Both were tested on 3.14.6 and solve a small MILP through `pulp.HiGHS`.
- PuLP 2.9 reports "Optimal" on a time-limited HiGHS run. Read status, gap and bound from `prob.solverModel` instead.
- Unpinned `pip install pulp` installs 4.x, which removed `LpVariable(...)`, `LpVariable.dicts`, `LpStatus` and `prob.status`.

## Architecture

Data flows one way, and the frontend knows nothing about the solver:

```
data/raw → data/prepare.py → data/processed/ → solver/ → solver/audit.py → flat JSON → web/ (static Next.js)
```

- `solver/model.py` holds the MILP and `resolve(scenario) -> Solution`. `solver/contract.py` defines both types, and that JSON is the only contract between solver and frontend.
- `solver/audit.py` checks every result independently and must not import from `solver/model.py`.
- Live solve through FastAPI (`api/main.py`) on the presenter's laptop is P0. Stored runs in `web/data/bundle.json` are the labelled fallback and are never called live.
- Supabase provides Google login only. Solution data stays in the committed bundle.
- The static double-click fallback must exist by 14:30 regardless.

## Rules

- `data/raw/` is read-only.
- Select airports by IATA code (PNK, PKN, BPN, TRK), never by name or city. In `airports.dat`, "Iskandar" also matches Banda Aceh and "Sepinggan" is absent. Tarakan's city is misspelled "Taraken" in `airports.dat` and in `challenge3_airports_4.csv`.
- A solver decides everything. Any LLM layer only explains a finished solution.
- Every displayed number must trace to the cost table and a recomputable distance. Say "optimal" only when the MIP gap is 0, and "could not find" rather than "does not exist".
- Use 4-space indentation in Python and TypeScript.
- `.env` holds Supabase secrets (`SUPABASE_SECRET_KEY`, `DATABASE_URL`, `SUPABASE_DB_PASSWORD`) and must never be committed or printed. Only the publishable key may reach `web/`, exposed under a `NEXT_PUBLIC_` name.
- After 14:00, new ideas go in `docs/NEXT.md`, not the build. Record every expert conflict in `docs/DECISIONS.md` with a one-line reason.
- Commit messages and PR descriptions carry no AI attribution: no AI `Co-Authored-By` trailer and no "Generated with" line. `.claude/settings.json` turns this off for every member's Claude Code.
