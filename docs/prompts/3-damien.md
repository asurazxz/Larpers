> **Work only on your own branch: `damien/contract-audit-api`. Never commit directly to `main`.**

# Damien: contract, audit, baseline, API

You are the agent for Damien.

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
add_skill fastapi/fastapi fastapi/.agents/skills/fastapi
add_skill obra/superpowers skills/test-driven-development
add_skill obra/superpowers skills/verification-before-completion
add_skill openai/skills skills/.curated/security-best-practices
```

| Skill | Source | Use it when |
|---|---|---|
| `fastapi` | FastAPI project | Building `api/main.py`, including auth dependencies and error handling |
| `test-driven-development` | Superpowers | Writing the corrupted-solution tests before `solver/audit.py` |
| `security-best-practices` | OpenAI | Reviewing token checks, CORS and secrets in `api/` once it works |
| `verification-before-completion` | Superpowers | Before you report a gate as passed |

## Your tasks

Codex does not load `CLAUDE.md` automatically, so read it now. Then read `docs/COMBINED_PROPOSAL.md` Part A sections 3 and 5, Q2 of `docs/proposals/geospatial-data.md`, and `baseline()` in `prototype/v2.py`.

Do one task at a time; commit when its command passes. You need no secrets, browser or Supabase access; do not open `.env`. Do not touch `web/`, `data/` or `solver/model.py`. Ask Jing Yuan to add any package to `requirements.txt`.

### 1. Contract. Gate 12:50. Commit first.

Files: `solver/contract.py`, `contracts/solution.schema.json`, `contracts/fixture_solution.json`.

1. `Scenario`, `extra="forbid"`, defaults in brackets: `demand_kt` (null = full-production preset, else four airports), `yield` as an alias (0.15), `depot_retention` (1.0), `road_factor` (1.9), `horizon_years` (1), `collection_policy` `all`|`optional` (`all`), `capacity_basis` `saf_output`|`biomass_input` (`saf_output`), `excluded_ids` ([]), `time_limit_s` (90).
2. Bad values raise typed errors, never silent defaults: yield, r in (0, 1]; road factor, horizon ≥ 1; demand ≥ 0; time limit > 0. Add `scenario_hash()`: SHA-256 of canonical JSON.
3. `Solution`: the section 5 result fields plus `portfolios[]`. `status` is `optimal`|`best_found`|`infeasible`|`heuristic`; `bound` and `gap` are nullable; `opex` is literal `"not_provided"`; `validation` is `AuditReport` (`passed`, `max_residuals`, `failures`), defined here.
4. Facility and flow fields follow Q2, except: `road_factor` replaces `circuity`; `from` needs an alias, as a keyword; drop `CENTROID`; keep `kt` unrounded, since 3 dp rounding breaks the 1e-6 audit. `truck_t` is 9, 30, 32 by leg; `trips = ceil(kt × 1000 / truck_t)`.
5. `python -m solver.contract` writes the schema by alias. `--check` validates the hand-made fixture (real ids, one flow per leg, one stranded, one surplus) and fails on a stale schema.

Acceptance: `python -m solver.contract --check`

### 2. Audit. Gate 13:20.

Files: `solver/audit.py`, `tests/test_audit.py`.

`audit(scenario, solution, *, inputs=None) -> AuditReport`, defaulting to `load_inputs()`. Tolerance 1e-6 kt; $0.01 for costs. Return per-family maximum residuals and failures. Checks:

- No negative flows; every id resolves; site outflow ≤ supply, equal under `all`.
- Depot balance with r; refinery yield: y × in = out + surplus.
- Capacity on the selected basis; depots on biomass in; one size per site; every airport demand met.
- Facilities at candidates only (refineries also at airports), no sea sites.
- Rate per leg; every cost recomputed, from `km = hav_km × road_factor`, plus CapEx; totals equal.
- Each arc `kt > 0`; a 0 km co-located arc is valid.

Tests: tiny inputs, one valid solution, one hand-corrupted failing copy per check, and an `ast` scan rejecting `solver.model` and `pulp` imports.

Acceptance: `python -m pytest tests/test_audit.py`

### 3. Baseline. Gate 13:20.

Files: `solver/baseline.py`, `tests/test_baseline.py`.

1. `baseline(scenario, *, inputs=None) -> Solution` with full flows, `status="heuristic"`, `bound` and `gap` null. Port the prototype exactly. Until `solver/inputs.py` merges, build inputs from `data/raw` in the test.
2. The limit is `300 / 1.4` km haversine, not literal 214. The prototype's last `else` branch (KAL_SUP_03, KAL_SUP_43) lacks a limit check: add one. An unreachable site is stranded under `optional`, `infeasible` under `all`.
3. Apply r, yield, road factor, demand (excess is surplus, shortfall is `infeasible`) and `excluded_ids` (no facility; biomass still counts).
4. If one large refinery is short on the selected basis, take the cheapest (nL, nS), nL ≥ 1. Added units go to onshore sites nearest BPN, small first. Depots use the nearest refinery with room, splitting overflow; airports fill likewise.

Regression at defaults: 26 depots, CapEx $879.8M, logistics $577.7M, total $1,457.5M (each ±0.05), refinery KAL_SUP_45, longest haul within the limit. Yield 0.16 gives L + S, small at KAL_SUP_77. Both pass audit. One-depot-per-site is its only difference from the MILP: waive no check; assert one supply flow per site.

Acceptance: `python -m pytest tests/test_baseline.py`

### 4. API. Gate 13:45.

Files: `api/main.py`, `api/auth.py`, `api/stub_resolve.py`, `tests/test_api.py`.

1. Thin FastAPI wrapper with the five endpoints. CORS: localhost plus `FRONTEND_URL`. Every response carries a `run_id`.
2. `/api/solve` runs `resolve`, then `audit`, then returns. Audit failures appear in `validation`. Infeasible returns 200 with `status="infeasible"`, not a 500.
3. `/api/health` reports availability and solver version.
4. On `ImportError` from `solver.model`, use the stub `resolve`, returning the fixture.
5. Auth: PyJWT `PyJWKClient` on `{SUPABASE_URL}/auth/v1/.well-known/jwks.json` with caching, RS256 and ES256 only, requiring expiry and audience `authenticated`. Note in `api/auth.py`: for a legacy HS256 project, rotate to asymmetric keys or add a `SUPABASE_JWT_SECRET` branch.
6. Test with a locally generated key pair and a patched client: valid 200; missing, expired, tampered 401.

Acceptance: `python -m pytest tests/test_api.py -k auth`

### 5. API tests. Gate 13:45.

File: `tests/test_api.py`.

Bad yield, unknown site in `excluded_ids` and negative demand each give 422. Determinism: post one scenario twice; equal `scenario_hash`, with `primal` and each flow's `kt` within tolerance.

Acceptance: `python -m pytest tests/test_api.py`

## Done means

- [ ] `python -m solver.contract --check && python -m pytest tests/test_audit.py tests/test_baseline.py tests/test_api.py` passes.
- [ ] You changed only owned paths and committed no secrets.
- [ ] You reported at each gate what works, what fails and what you skipped.
