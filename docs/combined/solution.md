# Combined solution: SAF network planner

**Proposal for team vetting.** Only Google login is confirmed. Prototype costs are provisional and not quoted. JY's six-site figures are not Kalimantan results and are not quoted either.

## 1. Combined solution

A planner edits a Kalimantan SAF scenario, presses Run, and gets a new network from a MILP solve on the official 80 sites, independently audited and compared with a greedy baseline. Damien supplies the product contract, JY the analysis and exhibits, and our expert work the corrected data and a formulation reaching gap 0 per refinery portfolio. Live solves run on the presenter's laptop behind Google sign-in, and anyone can open labelled stored runs without logging in.

## 2. What each contributes

Solver base: `v2.py` (PuLP 2.9 + HiGHS), throwaway code in a temp scratchpad, with its `m.py` import. JY's and Damien's originals are not accessible. If JY's code turns up, reuse its exhibits and tests only.

| Capability | Source | Status |
|---|---|---|
| Google login | Team, confirmed | To build |
| Run workflow, typed API, validator, negative tests, OpEx "not provided" | Damien | To build |
| Four independent D[a] | Damien | To build; prototype splits one total |
| Collection switch, H input, solver states | Damien | In prototype; UI to build |
| Map symbology | Damien | Comparison exhibits only |
| MILP core | JY | In prototype |
| Greedy baseline | JY | Partial: one large refinery only |
| Disruption, sensitivity grid, selection frequency, frozen replay, "where this fails", candidate disclaimer | JY | To build |
| Capacity discontinuity and pitch exhibits | JY | Regenerate on real data |
| Corrected rates, road factor 1.9, 11 sea sites as supply only, split flows, cuts plus per-portfolio solve, HiGHS proof status | Ours | In prototype |
| Flat JSON, arc-click trace | Ours | To build |
| No LLM in decisions | Ours | Rule |

## 3. Combined model

**Sets:** 80 sites i, 69 onshore depots j, N refinery candidates k (prototype 29, airports included), 4 airports a.

**Variables:** x_ij in [0,1], f_jk ≥ 0 biomass, g_ka ≥ 0 SAF, e_k ≥ 0 surplus SAF at the gate, zD and zR binary.

**Minimise** Σ CapEx · z + H · 1000 · [ 0.10 Σ d_ij P_i x_ij + 0.12 Σ d_jk f_jk + 0.08 Σ d_ka g_ka ]. OpEx shows as "not provided".

| Constraint | Form |
|---|---|
| Collection policy | Σ_j x_ij = 1 (all) or ≤ 1 (optional) |
| Depot balance, retention r | r · Σ_i P_i x_ij = Σ_k f_jk |
| Depot capacity | Σ_i P_i x_ij ≤ Σ_s C_D,s zD_j,s |
| Yield balance | y · Σ_j f_jk = Σ_a g_ka + e_k |
| Refinery capacity | SAF basis: Σ_a g_ka + e_k ≤ Σ_s C_R,s zR_k,s. Biomass basis: Σ_j f_jk ≤ same |
| Demand | Σ_k g_ka = D_a |
| Arcs | Supply leg haversine ≤ 214 km; no depot→refinery limit |
| Cuts | One size per site, x-link, f-link, depot cover (all only), Σ zL = nL, Σ zS = nS |

**Base case, all editable:** y 15%, road factor 1.9, H = 1 with 5 and 10 alongside, collection all, SAF basis, r = 1 (our placeholder). Demand preset D_a = s_a · y · r · ΣP gives BPN 569.2, PNK 323.3, TRK 76.5, PKN 51.0 kt, a gateway scenario, not forecast offtake.

**Not yet in prototype:** r, capacity basis, e_k. Without e_k, collection all with demand below production is infeasible.

**Proof rule:** "Optimal among N candidates" needs every feasible portfolio proven, or skipped because its CapEx alone exceeds the best total. At H = 5 the prototype ranks three small refineries first, so one proven portfolio proves nothing overall. The base case now meets this rule: one large and large + small are both proven, S and S + S cannot fit 1,020 kt, and every other mix costs more in CapEx alone. It holds only among the 29 shortlisted candidates, and that shortlist still needs rebuilding at road factor 1.9.

## 4. Product workflow

1. Open the link. A labelled stored run shows, with no login.
2. On the live laptop, sign in with Google and edit the scenario.
3. Press Run. Solver, validator and baseline return a new run ID.
4. Read the map, costs, saving, status, bound and gap. Click an arc to trace it.
5. Remove a facility, re-solve, and read the delta or "No feasible network".

## 5. Architecture and API

`data/raw → prepare → solver (FastAPI) → validator → flat JSON → static web`. Stored runs are a committed JSON bundle.

| Mode | Login | Solve | Badge |
|---|---|---|---|
| Laptop, Level 3 + FastAPI | Google | Live, P0 | LIVE SOLVE |
| Public URL, Level 2 | Google | Stretch, after ten consecutive successes | STORED RUN |
| `file://`, Level 4 | None; OAuth cannot work | None | STORED RUN, no login |

`/api/health` decides the badge. Stored runs stay labelled stored even when health is green.

| Access (proposed) | Endpoints |
|---|---|
| Public | GET /api/data, GET /api/health, POST /api/validate |
| Signed-in, else 401 | POST /api/solve |
| Team to decide | POST /api/baseline, which also uses compute |

**Input:** `demand_kt` (four airports), `yield`, `depot_retention`, `road_factor`, `horizon_years`, `collection_policy`, `capacity_basis`, `excluded_ids`, `time_limit_s`.

**Result:** `run_id`, `source`, `data_hash`, `scenario_hash`, `status`, `primal`, `bound`, `gap`, `n_candidates`, `solve_seconds`, `facilities[]`, `flows[]`, `stranded[]`, `surplus[]`, `capex_usd`, `logistics_annual_usd`, `opex`, `total_horizon_usd`, `validation`.

### Login (confirmed requirement)

| Item | Position |
|---|---|
| Method | Supabase Auth, Google provider, client-side PKCE. A static export has no Next server, so NextAuth-style server routes do not fit |
| Supabase | Required for auth. Data stays in the committed bundle. **Team decision:** whether solution tables also live in Supabase |
| Access (team to confirm) | Stored runs need no login. POST /api/solve needs a signed-in user, and FastAPI verifies the Supabase JWT server-side. The judges' link survives a login failure |
| Fallbacks | Level 3 needs its localhost redirect URL registered. Level 4 runs stored runs without login, labelled as such |

**Team setup:** (1) create a Google Cloud OAuth client, whose redirect URI is the Supabase callback; (2) add its ID and secret to the Supabase provider settings; (3) register production and localhost redirect URLs in Supabase. Never put the client secret in `web/`.

**Risks:** sign-in needs network, so sign in before the pitch and check token lifetime. Until hosted solve passes, login unlocks nothing on the public URL, and the UI should say so.

## 6. Scope

| P0 | Acceptance test |
|---|---|
| Real data validated | 80 unique IDs, 6,800 kt, four airports by IATA, hashes; bad input rejected |
| MILP with D[a], collection switch | Zero-freight microcase gives $482.25M; D[a] delivered; excess demand infeasible with bound; zero demand under optional opens nothing |
| Validator | Recomputes nodes, capacities and costs without solver imports; corrupted result fails |
| Baseline | Same scenario hash and H; feasible; passes validator |
| Live re-solve and map | Changed input gives new run ID and flows; arcs match nonzero flows; displayed cost equals validator's; stopping the API flips the badge |
| Google login | Sign in and sign out work; unauthenticated solve returns 401; stored runs open signed out; secret key never in `web/` |

**P1:** disruption, labelled "site unavailable at design stage", not an outage; proof panel.

**P2 but required:** sensitivity sweep, stored and labelled.

**Off the critical path:** 3D maps, fleet dispatch, LLM layer, live external road routing.

## 7. Where we deliberately differ

| Source | Difference | Why |
|---|---|---|
| Damien | Collection all, yield 15%, not optional and 30% | PDF's 6,800 kt; review recommendation |
| JY | Split flows, road factor 1.9 | Gap 0; measured on 1,954 pairs |
| JY | `v2.py`, not SciPy code | JY's code is inaccessible |
| Comparison | Drops "no 80-site run", "reuse JY first" | Out of date |
| Comparison | Sweep kept | About 4 minutes of compute (estimate); the Judge needs it |
| Comparison | Auth is P0 | Confirmed team requirement |
| `CLAUDE.md` | Live solve P0; Supabase not the data path | Update the file if accepted |
| OR | No stranding penalty | D[a] with optional collection needs no invented price |
| Full-Stack | Editable when live; timeout above 30 s | Prototype portfolios took 24–54 s each |
