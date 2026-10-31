> **Work only on your own branch: `junsheng/web`. Never commit directly to `main`.**

# Web app, login and fallback

You are the agent for Jun Sheng.

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
add_skill anthropics/skills skills/frontend-design
add_skill anthropics/skills skills/webapp-testing
add_skill vercel-labs/agent-skills skills/react-best-practices
add_skill vercel-labs/agent-skills skills/web-design-guidelines
add_skill supabase/agent-skills skills/supabase
add_skill obra/superpowers skills/systematic-debugging
add_skill obra/superpowers skills/verification-before-completion
```

| Skill | Source | Use it when |
|---|---|---|
| `frontend-design` | Anthropic | Setting the look of the map screen and panels |
| `react-best-practices` | Vercel | Writing or reviewing React and Next.js components |
| `supabase` | Supabase | Building Google sign-in and session handling |
| `webapp-testing` | Anthropic | Testing Run, sign-in, disrupt and the stored fallback in a real browser. It needs Playwright |
| `web-design-guidelines` | Vercel, your Notion list | Auditing the screen once before the 14:00 freeze |
| `systematic-debugging` | Superpowers | Login, API or map failures |
| `verification-before-completion` | Superpowers | Before you report a gate as passed |

Optional: [Context7](https://github.com/upstash/context7), from your Notion list, gives current docs for Next.js 16 and Supabase. Follow its README, and skip it if setup takes more than 5 minutes.

## Your tasks

Base: `docs/proposals/full-stack.md` and `docs/COMBINED_PROPOSAL.md` Part A sections 4-6. These amendments override both:

- **Supabase is login only.** Remove the table reads, RLS SQL, `fetchBundle`, `NEXT_PUBLIC_DATA_SOURCE`, `snapshot.mjs` and `check-rls.mjs`. Data comes only from `web/data/bundle.json` (Denzel generates it) and live API responses. Start from `contracts/fixture_solution.json`.
- **Live mode.** When `NEXT_PUBLIC_SOLVER_API_URL` is set and `/api/health` is ok, the scenario panel has real editable inputs and Run: four airport demands, yield, road factor, horizon, collection, capacity basis, facility exclusions. Timeout 150 s, real spinner. Otherwise show stored-run radio buttons and hide Run. `/api/health` decides the badge; a stored run stays labelled stored.
- **Sweep options.** Yield 13, 15, 15.98, 16, 17, 19%; road factor 1.4, 1.9, 2.3; H 1, 5, 10.
- **Costs.** Separate rows: CapEx, annual logistics, OpEx "not provided", total horizon cost. Show every contract solver state: status, primal, bound, gap, candidates, each portfolio. Show the audit result from `solution.validation` beside the total.
- **Failure band.** Tarakan ferry row only once Denzel confirms a second source, otherwise Bulungan; horizon flip about 2.1 years; capacity step at 15.985%; not modelled. No hard-coded result numbers: every value comes from the run. Those two figures are checks, not strings. Missing values show "not in this run".
- **Keep.** Next 16.4.3, React 19.3.1, react-leaflet 5, static export, offline land layer, relative `assetPrefix`, one page, arc-click trace, blue and orange robustness bands labelled k of n at district level, the map symbols table under Your tasks.
- **Sea sites** render hollow, supply only.

### 1. Human setup
**Gate:** 13:00. **Files:** none. Jing Yuan grants Supabase access. Jun Sheng does this himself; give him these steps and wait.
1. Create a Google Cloud OAuth client with the Supabase callback as its redirect URI. Add test accounts while the consent screen is in testing.
2. Add client ID and secret to the Supabase Google provider.
3. Register localhost and production redirect URLs (production once task 7 creates it).

**Accept:** provider enabled; the client secret is nowhere in `web/`.

### 2. Scaffold and map
**Gate:** 13:20. **Files:** `web/package.json`, `web/.nvmrc`, `web/next.config.mjs`, `web/.env.example`, `web/app/page.tsx`, `web/app/Map.tsx`, `web/lib/contract.ts`, `web/data/borneo.json`.
1. Pin versions from full-stack.md, `--save-exact`, Node 22.
2. Generate `contract.ts` from `contracts/solution.schema.json`.
3. Copy the fixture into `web/data/`; Vercel's root is `web`.
4. Load Map with `ssr: false`; use `CircleMarker` and `preferCanvas`.

**Accept:** `next build` passes; `out/index.html` shows the fixture map over `file://`.

### 3. Google login
**Gate:** 13:20. **Files:** `web/lib/auth.ts`, `web/lib/api.ts`, `web/components/AuthButton.tsx`.
1. Use Supabase Auth, `flowType: 'pkce'`, publishable key; add sign-in and sign-out.
2. Send the session JWT as `Authorization: Bearer` on API calls.
3. On expiry or 401, refresh and retry once, then ask for sign-in, keeping inputs.

**Accept:** stored runs open signed out; Run while signed out asks for sign-in; an expired token recovers.

### 4. Live run slice
**Gate:** 13:45, with Damien's API. **Files:** `web/components/ScenarioPanel.tsx`, `web/components/Header.tsx`, `web/lib/api.ts`.
1. Build requests from the schema; keep `depot_retention` at 1 and `time_limit_s` at 90. The 150 s browser timeout stays higher so a full run can return.
2. Poll `/api/health`. Call solve and baseline; render through the stored-run path.
3. On failure, stay on the current run and say so.

**Accept:** a changed input gives new run ID and flows; arcs match nonzero flows; shown cost equals the validator's; stopping the API flips the badge.

### 5. Evidence panels
**Gate:** 14:00. **Files:** `web/components/CostPanel.tsx`, `Provenance.tsx`, `FailureBand.tsx`, `Trace.tsx`.
1. Build costs, baseline saving and provenance.
2. Trace recomputes km and cost in the browser using the run's road factor.
3. Keep the failure band permanently visible.

**Accept:** switching runs changes every value; a corrupted cost visibly fails the trace.

### 6. Disruption and robustness
**Gate:** 14:00. **Files:** `web/lib/view.ts`, `web/components/SweepPicker.tsx`, `Disrupt.tsx`, `Robustness.tsx`.
1. Use one `View` state; grey missing combinations "not pre-run".
2. Label disruption "site unavailable at design stage". Re-solve live through `excluded_ids`.
3. Show delta against base, or "No feasible network".

**Accept:** both outcomes render; no green or amber; bands read k of n.

### 7. Vercel and fallback
**Gate:** 14:30. **Files:** `web/package.json`, `fallback/**`.
1. Vercel: Root Directory `web`, publishable values only. No solver URL, so the public URL shows stored runs and says login unlocks no solve.
2. Add `build:static`: blank Supabase and solver variables, copy `out/` to `fallback/`, labelled stored, no login. Rebuild after bundle v1.
3. Test sign-in from a second Google account on localhost and Vercel.
4. Safari may block https-to-localhost calls, so run the live demo on localhost web.

**Accept:** private-window Vercel opens a stored run; `fallback/index.html` works by double-click offline.

### Map symbols

Every marker and line must come from the run data.

| Layer | Visual | Click shows |
|---|---|---|
| Biomass site | Small green point | Availability, site ID, quantity used |
| Sea site (supply only) | Hollow green point | As above, plus "offshore, not a facility candidate" |
| Small / large depot | Amber circle, larger when large | Site, capacity, throughput, inbound and outbound flow |
| Small / large refinery | Cyan square, larger when large | Site, SAF output, utilisation, airport links |
| Airport | White aircraft marker | Demand, delivered kt, contributing refineries |
| Site → depot | Thin green line | kt/year and cost |
| Depot → refinery | Amber line | kt/year and cost |
| Refinery → airport | Cyan line | SAF kt/year and cost |
| Excluded facility | Crossed-out marker | Why it is excluded |

## Done means

- [ ] Sign-in and sign-out work on localhost and Vercel, second account included
- [ ] One live run passes: edit, Run, audit, map, new run ID
- [ ] Disruption, robustness, sweep and trace work
- [ ] Stopping the API flips the badge; stored runs stay labelled stored
- [ ] Costs, solver states, audit and failure rows all come from the run
- [ ] `fallback/` passes the double-click test
- [ ] No secret in `web/`; a pull request at each gate
