> **Work only on your own branch: `jingyuan/solver`. Never commit directly to `main`, except the bootstrap in Task 1.**

# Jing Yuan: solver and integration lead

You are the agent for Jing Yuan.

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

Install these before you start. Allow 5 minutes at most. If one fails, skip it and keep going. Skills are personal tools, so install them to your home folder and never commit them to the repo. They run with your agent's permissions, so install only these, then restart Claude Code.

```bash
SKILLS_DIR=~/.claude/skills
add_skill() { tmp=$(mktemp -d); git clone --depth 1 -q "https://github.com/$1" "$tmp" && mkdir -p "$SKILLS_DIR" && cp -R "$tmp/$2" "$SKILLS_DIR/"; rm -rf "$tmp"; }
add_skill obra/superpowers skills/systematic-debugging
add_skill obra/superpowers skills/test-driven-development
add_skill obra/superpowers skills/verification-before-completion
add_skill obra/superpowers skills/dispatching-parallel-agents
add_skill mattpocock/skills skills/engineering/diagnosing-bugs
add_skill cursor/plugins cursor-team-kit/skills/thermo-nuclear-code-quality-review
```

| Skill | Source | Use it when |
|---|---|---|
| `test-driven-development` | Superpowers | Writing the known-answer tests in `tests/test_model.py` before the model |
| `systematic-debugging` | Superpowers | A solve is infeasible, slow or returns a wrong cost |
| `diagnosing-bugs` | Matt Pocock Skills, your Notion list | A bug survives one fix attempt |
| `dispatching-parallel-agents` | Superpowers | Splitting independent work such as tests and candidate rebuilds |
| `verification-before-completion` | Superpowers | Before you report a gate as passed |
| `thermo-nuclear-code-quality-review` | Your Notion list | Reviewing `solver/model.py` once before the 14:00 freeze. It is strict, so act only on real defects |

Your own Claude Code also has `/code-review` for pull requests. Use it on each pull request before merging. `cursor/plugins` shows no license on GitHub, so keep that skill to personal use.

## Your tasks

Work from `/Users/jingyuan/Desktop/Larpers` on Python 3.12 or newer. The presenter's laptop defaults to Jing Yuan's. Denzel asks the Airbus mentor about the refinery capacity basis and whether 6,800 kt is per year; apply the answer and log it.

### 1. Bootstrap (gate 12:30, on `main`)

1. Run `git init -b main`, then `git check-ignore .env`. Stop if it prints nothing.
2. Keep `resource/*.pdf` in the repo. Teammates need the official rubric.
3. Write `requirements.txt`: pulp==2.9.0, highspy==1.15.1, numpy==2.5.4, pandas==3.1.0, pyarrow==26.0.0, python-dotenv==1.2.4, pytest==9.2.0, global-land-mask==1.0.0. No psycopg: Supabase holds no data. Install fastapi, uvicorn, pydantic, pyjwt[crypto] and httpx in a fresh venv, and pin what `pip freeze` reports.
4. Create empty `solver/__init__.py` and `api/__init__.py`. Commit. Run `gh repo create larpers --private --source=. --push`.
5. Invite the team. Jing Yuan sends `.env` values privately, only to whoever needs them. Run `git switch -c jingyuan/solver`.

Accept: `git ls-files | grep -E '(^|/)\.env'` prints nothing; `pip check` passes; `gh repo view --json visibility` says PRIVATE.

### 2. `solver/model.py` (gate 13:20)

1. Write the Part A section 3 formulation in the docstring first.
2. Port `prototype/v2.py`, reading data through `load_inputs()`. Use `resolve(scenario, inputs=None, candidates=None, rates=RATE)` for test injection. Take only `cap_in` from `prototype/m.py`; its shares and defaults are stale.
3. Use `hav_km × road_factor`; `road_km` is display only. Keep `HAUL_HAV_KM = 300 / 1.4`: a flat 214 drops arc KAL_SUP_06–KAL_SUP_76 (214.15 km).
4. Add independent `D[a]` from `demand_kt`; surplus `e_k` in yield balance and SAF capacity, costless; `r` in depot balance; `capacity_basis`; `collection_policy`; `excluded_ids`, which remove candidates, not supply.
5. Preserve every cut. Compute depot cover as ⌈ΣP/150⌉, collection=all only.
6. Return infeasible with a stated reason when ΣD exceeds y·r·ΣP, or a site has no depot in range under collection=all.

Until Task 3, solve mix L only, labelled "Best found".

Accept: `python -m solver.model` prints objective, status, gap and bound.

### 3. Portfolio engine (gate 13:45, in `solver/model.py`)

1. Ask Damien to add `portfolios[]` to `Solution`. Enumerate every (nL, nS) with nL+nS ≤ N by ascending CapEx, including (0, 0).
2. Skip if capacity is short. Required: SAF basis y·r·ΣP (all) or ΣD (optional); biomass basis r·ΣP or ΣD/y.
3. Skip if refinery CapEx plus depot floor exceeds the best total. The floor is ⌈Q/150⌉ × $2.25M, with Q = ΣP (all, $103.5M) or ΣD/(y·r) (optional); never hardcode it.
4. Solve the rest in `ProcessPoolExecutor` with `threads=2`, `gapRel=0.0`, within `min(time_limit_s, 90)` total. Workers return plain dicts. Re-test skips at each dispatch and against the final best.
5. Read status, gap and bound from `prob.solverModel`, per `docs/proposals/operations-research.md`. Serialise `inf` as null.
6. Return the best, listing every mix in `portfolios[]`. Claim "Optimal among N candidates" only if every feasible mix is proven or validly skipped. Otherwise "Best found, gap X%", using the lowest unresolved bound.

Accept: `python -m solver.model --horizon 5` finishes inside 90 s and lists every mix.

### 4. `solver/candidates.py` (gate 14:00)

1. Define `PROTOTYPE_SHORTLIST`: v2's `SHORT` plus four airports (29). Default to it until step 3.
2. Rebuild from the 69 onshore sites plus 4 airports at 1.9: union of production-weighted k-means (k=12, 20, fixed seed) snapped to candidates, incumbents from L, L+S and S+S+S solved on all 73 at H=1, 5, 10, and all airports.
3. Freeze `SHORTLIST`. Record the method in the docstring, disclosing the incumbents. Shrink it if proof misses 90 s.
4. Report how H=1 and H=5 change from $1,393.5M and $2,554.3M in `docs/DECISIONS.md`.

Accept: `python -m solver.candidates` prints N, no sea sites, all four airports.

### 5. `tests/test_model.py` (gates 13:20 and 14:00)

- Zero-freight microcase: exactly $482.25M.
- Run A, mix L, old shortlist: about $1,393.5M, `abs=1e6`.
- Each `D[a]` delivered.
- Excess demand: infeasible, reason stated.
- Zero demand, optional: nothing opens.
- On proven runs, more candidates never raise cost and higher rates never lower it.

Accept: `python -m pytest tests/test_model.py -q`.

### 6. Integration lead (gates 13:45 to 15:30)

1. Merge pull requests in dependency order: contract, data, model, audit, baseline, API, web.
2. Lead the 13:45 live slice.
3. Run Denzel's `solver.sensitivity` and `solver.scenarios` on your machine, on the frozen shortlist, for the final stored-run sweep. Agree with him how the bundle reaches `main`.
4. Update `CLAUDE.md` and `docs/DECISIONS.md`.
5. Run the 15:15 cold start from a fresh clone.
6. Make the repo public, then submit by 15:30.

Accept: `git log -p --all | grep -qFf <(cut -d= -f2- .env | grep .) && echo LEAK` prints nothing; visibility says PUBLIC.

## Done means

- [ ] Private repo bootstrapped, `.env` untracked
- [ ] `resolve()` handles every scenario field
- [ ] Every mix reported within 90 s, honestly labelled
- [ ] Shortlist frozen, disclosed, impact logged
- [ ] All `tests/` pass
- [ ] Final bundle merged
- [ ] Cold start passed, repo public, submitted
