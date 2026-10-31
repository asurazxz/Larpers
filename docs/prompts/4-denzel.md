> **Work only on your own branch: `denzel/data-evidence`. Never commit directly to `main`.**

# Denzel: data and evidence

You are the agent for Denzel.

Codex does not load `CLAUDE.md` automatically. Open and read it in full before anything else.

## Team rules (same for all four)

**Goal.** Airbus Challenge #3: a Kalimantan SAF network planner. A planner edits a scenario, presses Run, and gets a new solved network from a MILP on the official 80 sites, independently audited and compared with a greedy baseline, with stored runs as a labelled fallback. Login uses Google.

**Read first:** `CLAUDE.md`, then `docs/COMBINED_PROPOSAL.md`. They override `resource/CHALLENGE3_ORCHESTRATOR_PROMPT.md` wherever they differ. Do not take numbers from the original brief without checking `CLAUDE.md`.

**Approved base settings:** yield 15%; road factor 1.9; horizon H = 1, shown beside H = 5; collect all biomass; depot retention r = 1; refinery capacity = SAF output, with a biomass-input toggle; demand derived from production, split BPN 55.8, PNK 31.7, TRK 7.5, PKN 5.0, editable per airport; 69 onshore facility candidates; supply-leg haul limit 214 km straight-line; no depot→refinery limit; split flows allowed; rates 0.10, 0.12, 0.08 USD/t/km.

**File ownership.** Edit only your own paths. If you need a change elsewhere, ask the owner.

| Owner | Branch | Owns |
|---|---|---|
| Jing Yuan | `jingyuan/solver` | `solver/model.py`, `solver/candidates.py`, `tests/test_model.py`, `requirements.txt`, `CLAUDE.md`, `docs/DECISIONS.md`, `prototype/` |
| Jun Sheng | `junsheng/web` | `web/**`, `fallback/**` |
| Damien | `damien/contract-audit-api` | `solver/contract.py`, `solver/audit.py`, `solver/baseline.py`, `api/**`, `contracts/**`, `tests/test_audit.py`, `tests/test_baseline.py`, `tests/test_api.py` |
| Denzel | `denzel/data-evidence` | `data/prepare.py`, `data/reference/**`, `solver/inputs.py`, `solver/sensitivity.py`, `solver/scenarios.py`, `tests/test_data.py`, `tests/test_scenarios.py`, `README.md`, `docs/ASSUMPTIONS.md`, `docs/QA.md`, `docs/PITCH.md`, `docs/NEXT.md`, `slides/**` |

**Interfaces.** Build against these and do not wait for each other.

- `solver/contract.py` (Damien): pydantic `Scenario` and `Solution`. Its JSON Schema is `contracts/solution.schema.json`, with a sample at `contracts/fixture_solution.json`.
- `solver/inputs.py` (Denzel): `load_inputs() -> Inputs`, with sites, airports, `node_ids`, `hav_km`, `road_km` and the `is_candidate` flag.
- `solver/model.py` (Jing Yuan): `resolve(scenario: Scenario) -> Solution`.
- `solver/baseline.py` (Damien): `baseline(scenario: Scenario) -> Solution`.
- `solver/audit.py` (Damien): `audit(scenario: Scenario, solution: Solution) -> AuditReport`. It must not import `solver/model.py`.
- `web/data/bundle.json` (Denzel generates, Jun Sheng reads): stored runs keyed by slug.
- `api/main.py` (Damien): `GET /api/data`, `GET /api/health`, `POST /api/solve`, `POST /api/baseline`, `POST /api/validate`. Solve and baseline need a signed-in user; the other three are public.

Until a dependency merges, use a stub or `contracts/fixture_solution.json`.

**Git.** Clone the repo Jing Yuan shares, create your branch from `main`, commit small, push often, and open a pull request into `main` at each gate. Jing Yuan merges. Rebase on `main` after each merge. Never commit `.env`, `web/.env.local` or any key. Secrets are shared privately, never in chat logs, commits or prompts.

**Gates (SGT, today).**

| By | What must be true |
|---|---|
| 12:30 | Repo on GitHub with `main` bootstrapped; everyone on their branch |
| 12:50 | Contract and fixture merged; data pipeline merged |
| 13:20 | `resolve()`, audit and baseline merged; map renders from the fixture; login works |
| 13:45 | One full live run on localhost: UI → API → solver → audit → map |
| 14:00 | **Scope freeze.** New ideas go in `docs/NEXT.md` |
| 14:15 | Stored bundle v1 merged |
| 14:30 | Vercel live; `fallback/` built |
| 15:00 | Full rehearsal |
| 15:15 | Cold start passes on a second machine |
| 15:30 | **Submitted.** No code changes afterwards |

**Honesty rules.** A solver makes every decision, with no LLM in the decision path. Say "Optimal among N candidates" only when proven. Otherwise say "Best found, gap X%". A stored run is always labelled stored. Do not present JY's six-site figures ($516.4M, 1.567%) as Kalimantan results. Prototype figures are for checking and stay off slides until rerun on the final shortlist.

**When blocked** for more than 10 minutes, tell Jing Yuan, and keep working on something else. Report at each gate what works, what fails, and what you skipped.

## Skills

Install these before you start. Allow 5 minutes at most. If one fails, skip it and keep going. Skills are personal tools, so install them to your home folder and never commit them to the repo. They run with your agent's permissions, so install only these, then restart Codex. Type `/skills` to confirm they loaded, or `$` to call one by name.

```bash
SKILLS_DIR=~/.agents/skills
add_skill() { tmp=$(mktemp -d); git clone --depth 1 -q "https://github.com/$1" "$tmp" && mkdir -p "$SKILLS_DIR" && cp -R "$tmp/$2" "$SKILLS_DIR/"; rm -rf "$tmp"; }
add_skill obra/superpowers skills/test-driven-development
add_skill obra/superpowers skills/verification-before-completion
add_skill anthropics/skills skills/pptx
add_skill openai/skills skills/.curated/pdf
```

| Skill | Source | Use it when |
|---|---|---|
| `test-driven-development` | Superpowers | Writing `tests/test_data.py` before `data/prepare.py` |
| `pptx` | Anthropic | Building the slide deck in `slides/` |
| `pdf` | OpenAI | Checking the exported slide PDF before submission |
| `verification-before-completion` | Superpowers | Before you report a gate as passed, or quote any number in the pitch |

Check the license note in the `pptx` skill folder: Anthropic's document skills are source-available, not open source.

## Your tasks

Do one task per turn. Move on only when its acceptance command passes. After `pip install`, use no network, browser, `.env` or secrets. Never touch `solver/model.py`, or `web/` other than `web/data/bundle.json`. If `requirements.txt` lacks `global-land-mask==1.0.0`, ask Jing Yuan.

### 1. `data/prepare.py` (gate 12:50)

1. Copy `prototype/osrm_table_84.json` to `data/reference/`, with `CREDIT.txt`: "© OpenStreetMap contributors". Never call OSRM at runtime.
2. Validate raw files as in task 3; raise on failure. Read `airports.dat` with explicit column names, `dtype=str` for codes, `keep_default_na=False`, `\N` as null. Select by IATA only. Round coordinates to 4 dp.
3. In `data/processed/`, write `distances.npz`, no pickle: `node_ids` (asserted equal to OSRM `ids`), `hav_km` (radius 6371.0088 km, rounded to 0.01), `road_km` (`osrm.distances` ÷ 1000, plus the `sources[i].distance` snap for sea sites).
4. Write `sites.parquet`: `site_id,province,district,label,kt,tonnes,lat,lon,is_onshore,is_candidate,data_flag`. Take `is_onshore` from `global_land_mask`; `is_candidate=is_onshore`; `data_flag` is `offshore` or `ok`. If the mask disagrees with task 3's 11 sites, stop and report.
5. Write `airports.parquet`: `iata,name,city,lat,lon,demand_share`. Write `hashes.json`: SHA-256 of raw files and array bytes (not npz bytes), plus `data_hash`.

Accept: `python data/prepare.py && test -f data/processed/hashes.json`

### 2. `solver/inputs.py` (gate 12:50)

Frozen dataclass `Inputs` per the shared interface, plus `data_hash`. `load_inputs()` reads `data/processed/` only, applies no circuity, and names `data/prepare.py` if files are missing.

Accept: `python -c "from solver.inputs import load_inputs as l; i=l(); assert i.is_candidate.sum()==69 and i.road_km.shape==(84,84)"`

### 3. `tests/test_data.py` (gate 12:50)

Test: 80 rows, 6,800.0 kt, unique ids, kt × 1000 == tonnes. Four airports inside lat −5..8, lon 108..120; BTJ absent. Exactly 69 onshore; sea sites exactly 03, 22, 31, 32, 37, 43, 50, 58, 62, 69, 80. KAL_SUP_18 and 70 round to 681 and 706 km from the tonnage-weighted centroid, 88 and 57 km from TRK. `test_iskandar_name_filter_fails`: an "Iskandar" filter returns only BTJ and PKN.

Accept: `python -m pytest tests/test_data.py -q`

### 4. `solver/sensitivity.py`, `solver/scenarios.py`, `tests/test_scenarios.py` (gate 14:15)

Define runs as `RunSpec(slug,family,tier,overrides)`, mapped to Damien's `Scenario`. Run in order, so a time cut drops the last tier only:

- **T1:** base, baseline, 16% step, H=5, H=10, each open refinery removed.
- **T2:** yield {13, 15, 15.98, 16, 17, 19%} × road {1.4, 1.9, 2.3}; district lost (no refinery) for Ketapang and Kutai Kartanegara; top 10 depots by throughput removed; optional collection at 16%.
- **T3:** remaining open depots removed; biomass-input capacity; wet 6% yield.
- **Not stored:** `nk_excluded`, `nk_local_refinery` and `road_matrix` need scenario fields that do not exist. Put them in `docs/NEXT.md`. Report the base run's Bulungan cost instead.
- **Stress set, tier T1, required:** 20 random scenarios with a fixed seed, plus one deliberately infeasible case. Print and store solved count, worst solve time and worst gap, and put them in `docs/ASSUMPTIONS.md`.

- Every run goes through audit; a failed audit is not written. Infeasible is a stored result.
- Inject `resolve_fn`, `baseline_fn`, `audit_fn`. `--stub` uses a stub `resolve` and needs `--out` outside `web/`, so stub output never looks stored.
- After each run, atomically replace `web/data/bundle.json`, keyed by slug, with `slug,family,status,solved_at,data_hash,precomputed`. Resume skips slugs with a matching hash.
- Robustness, in `sensitivity.py`: regime (refinery size mix) first, then refineries k of n by district, bands all, most (k≥n/2), some, labelled precomputed.
- Print a run count table. Jing Yuan runs the final sweep.

Accept: `python -m pytest tests/test_scenarios.py -q`, with fakes covering tier order, failed audit, resume and bands.

### 5. `README.md` (gate 15:15)

One-command setup from cold on Python 3.12+; how to run solver, API and web; data provenance; the synthetic label verbatim from `docs/proposals/geospatial-data.md`; limits.

Accept: after `rm -rf .venv data/processed`, the README command exits 0, then `grep -q "treated as synthetic" README.md`.

### 6. Docs (gate 15:00)

- `docs/ASSUMPTIONS.md`: ledger marking each input official, assumed or computed.
- `docs/QA.md`: Why not HEFA? Why 15%? Who pays? Moisture and seasonality? Why would Pertamina trust this? Where does it break? Why one depot per site is not used?
- `docs/PITCH.md`: 3-minute script with stage timings. Open with the user and decision. Show the failure case: Bulungan unless Denzel confirms Tarakan. Use final bundle numbers only, as `[bundle:slug.field]` until it lands. Drop every claim in "Claims to drop" (`docs/PROPOSALS.md` Part 1). Say "solved" and "stored", never "live" for stored runs.
- `docs/NEXT.md`.

Accept: `! grep -inE '765M|Boeing|designer built|6,800 kt to four|every number traces|760 km|strand it|commit to green|every SEA SAF|0\.19 t/t|only published work|not Kalimantan|\[bundle:' docs/PITCH.md`. Then read the script and confirm that "live" appears only for a real solve.

### Denzel does these personally, not you

- Today: ask an Airbus mentor whether refinery capacity is SAF output or biomass input, and whether 6,800 kt is per year. Send Jing Yuan the answer immediately.
- By 13:30: confirm the Tarakan 63 km ferry from a second source, then tell Jun Sheng whether to use it. Otherwise Bulungan is the failure case.
- Open each source before citing it.
- By 15:00: build at most 8 slides in `slides/`, exported to PDF, with an assumptions slide, baseline number and failure case. Rehearse.
- 15:15: run the pre-submission checklist (`resource/CHALLENGE3_ORCHESTRATOR_PROMPT.md`, line 243).

## Done means

- [ ] All six acceptance commands pass.
- [ ] Bundle holds audited runs only; pitch numbers match it.
- [ ] Mentor answer and ferry decision sent.
- [ ] Slides exported; rehearsal and checklist done.
