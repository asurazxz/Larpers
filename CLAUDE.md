# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Larpers' entry for Airbus Challenge #3 (Kalimantan SAF supply chain network design) at Autonomous SG 2026: a two-echelon capacitated facility location MILP behind a map UI. Scope freezes at 14:00 SGT on 31 Oct 2026, submission target is 15:30, hard deadline is 16:00.

- `docs/COMBINED_PROPOSAL.md`: the approved plan. It overrides the brief wherever they differ.
- `docs/prompts/`: each member's task list, file ownership and gates.
- `resource/CHALLENGE3_ORCHESTRATOR_PROMPT.md`: the original brief, background only.
- `resource/Autonomous SG 2026_Airbus Track.pdf`: the official problem (Challenge #3, pp. 3-4) and judging rubric (pp. 7-8).
- `resource/Autonomous SG 2026_NUS Hackers.pdf`: a different track. Not used.

## Source of truth

The Airbus PDF outranks `data/raw/`, which outranks the brief. The brief has errors, verified against the PDF and raw data. Do not reuse these brief values:

| Item | Brief says | Correct |
|---|---|---|
| Refinery→airport cost | 0.15 USD/t/km | **0.08** USD/t/km (PDF p. 3). Other legs are right: 0.10, 0.12 |
| Truck sizes (small/large) | 10, 20, 40 t | 3/9 t, 18/30 t, 16/32 t per leg. Affects trip counts only |
| Airport demand split | PNK 56%, BPN 31%, TRK 8%, PKN 5% | PNK and BPN are transposed. The brief's own pax figures give BPN 44.5, PNK 39.8, TRK 9.5, PKN 6.2 (BPN at 4.7M) or BPN 55.8, PNK 31.7, TRK 7.5, PKN 5.0 (BPN at 7.4M) |
| North Kalimantan sites | "760 km from everything" | KAL_SUP_18 and KAL_SUP_70 are 681 and 706 km from the centroid, 88 and 57 km from TRK airport, and 304+ km from any other supply site |
| One large refinery at 16% yield | 6,800 × 0.16 "≈ 1,087" fits | 1,088 kt exceeds 1,087 kt. Break-even yield is 0.15985. Default yield is 15%, with 16% stored to show the step |
| Road factor | 1.4 | 1.9, measured on 1,954 pairs. Sweep 1.4, 1.9 and 2.3 |
| Facility candidates | All 80 sites | 69 onshore sites. 11 Ketapang sites plot in the sea and are supply only |

The evidence pack in brief Section 4 is unverified; check a source before citing it in a judged claim.

## Commands

These are the planned entry points from the brief's definition of done. Check that a file exists before relying on it. Run everything from the repo root.

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
python data/prepare.py                  # validate raw data, write data/processed/
python -m solver.model                  # base case: objective, MIP gap, solve time
python -m solver.baseline               # greedy baseline objective
python -m solver.sensitivity            # assumption sweeps, selection frequency
python -m solver.scenarios              # stored runs into web/data/bundle.json
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
- Select airports by IATA code (PNK, PKN, BPN, TRK), never by name or city. "Iskandar" also matches Banda Aceh, "Sepinggan" is absent from the file, and Tarakan's city is misspelled "Taraken".
- A solver decides everything. Any LLM layer only explains a finished solution.
- Every displayed number must trace to the cost table and a recomputable distance. Say "optimal" only when the MIP gap is 0, and "could not find" rather than "does not exist".
- Use 4-space indentation in Python and TypeScript.
- `.env` holds Supabase secrets (`SUPABASE_SECRET_KEY`, `DATABASE_URL`, `SUPABASE_DB_PASSWORD`) and must never be committed or printed. Only the publishable key may reach `web/`, exposed under a `NEXT_PUBLIC_` name.
- After 14:00, new ideas go in `docs/NEXT.md`, not the build. Record every expert conflict in `docs/DECISIONS.md` with a one-line reason.
