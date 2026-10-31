# Local solver API

Run from the repository root, using Python 3.12 or newer:

```sh
python data/prepare.py
uvicorn api.main:app --host 127.0.0.1 --port 8000
```

Set `SUPABASE_URL` in the process environment to the public project URL. The API
does not read `.env` files and needs no service key or signing secret. HTTPS is
required except for `localhost`, `127.0.0.1`, and `::1` development projects.
Bearer tokens must use RS256 or ES256 and have an expiry, subject, audience
`authenticated`, and the project's `/auth/v1` issuer. Public signing keys are
cached from `/auth/v1/.well-known/jwks.json`. For legacy HS256 projects, rotate to
asymmetric keys; this implementation intentionally has no symmetric-key branch.

CORS allows `http://localhost:3000`, `http://127.0.0.1:3000`, and the single origin
in `FRONTEND_URL`, if set. Send the Supabase access token in `Authorization:
Bearer ...`; cookies are not used. No wildcard origin or credentialed CORS is
enabled.

| Endpoint | Access | Body / result |
| --- | --- | --- |
| `GET /api/data` | Public | Sites, airports, distance matrices, data hash, scenario defaults |
| `GET /api/health` | Public | `ok`, `available`, solver/data availability, version and source |
| `POST /api/solve` | Signed in | Scenario JSON → independently audited Solution |
| `POST /api/solve/stream` | Signed in | Scenario JSON → NDJSON of the run as it happens, ending in the same audited Solution |
| `POST /api/baseline` | Signed in | Scenario JSON → audited greedy Solution |
| `POST /api/validate` | Public | `{ "scenario": ..., "solution": ... }` → flat AuditReport |

All JSON results and errors include `run_id`; every HTTP response also has an
`X-Run-ID` header, including CORS preflight responses. Infeasible solve results
return HTTP 200 with `status: "infeasible"` and no primal value. A numerical audit
failure stays visible in `validation`; it is never silently changed into a pass.
Invalid scenarios return 422. Missing or invalid access tokens return 401;
unconfigured authentication or missing prepared data returns 503.

If importing `solver.model` raises `ImportError`, the API uses the partial
contract fixture. Health then reports `ok: false`, `available: false`, and
`source: "fixture"`; returned solutions also remain labelled `fixture`. A fixture
is not an audited network or a live solver result. Restart the API after the real
solver becomes available.

`POST /api/solve/stream` sends one JSON object per line, each with `type` and `t`
(seconds since the start). `start` names the candidates and airports, `portfolio`
lists every refinery mix, `mix` reports a mix starting or finishing, `incumbent`
carries each improving network HiGHS finds with its facilities and flows, `bound`
reports a mix's lower bound and search nodes, and `phase` marks the polish and audit
steps. `tick` is a keepalive, sent after 2 s of silence. The last line is `result`,
holding the audited Solution, or `error`. Progress lines carry `best`, `lower_bound`,
`gap`, `settled`, `total` and `nodes` across the whole portfolio. Only `result` can
say optimal. Closing the connection ends the solve and its workers. Two streams can
run at once; a third gets a 429. Plain `POST /api/solve` is unchanged, and the
frontend falls back to it on a 404 or 405.

The default baseline is the approved single-assignment greedy network, with
split depot/refinery and refinery/airport legs when capacity requires them. It
reports `heuristic`, never a proof of optimality. A baseline failure means that
this greedy procedure could not construct a network, not that it proved the
MILP infeasible. Supply at excluded facility sites still counts.

Validation commands:

```sh
python -m solver.contract --check
python -m pytest tests/test_api.py -k auth
python -m pytest tests/test_audit.py tests/test_baseline.py tests/test_api.py
```

Tests generate RSA and EC keys only in memory and substitute the remote JWKS
client. They do not need Supabase credentials, browser login, or network access.
The pinned Starlette/HTTPX test stack currently emits an upstream deprecation
warning; tests continue using the repository's declared dependencies.

## Organiser values and overrides

`Scenario.parameters` holds the organisers' values as defaults, and any of them can be overridden. Send only what changes, such as `{"parameters": {"depot_large_kt": 350}}`; every other value stays official. Unknown names and impossible values such as a zero capacity return `422`.

| Group | Fields |
|---|---|
| Rates, USD/t/km | `rate_supply_depot`, `rate_depot_refinery`, `rate_refinery_airport` |
| Trucks, t | `truck_supply_depot_t`, `truck_depot_refinery_t`, `truck_refinery_airport_t` |
| Capacity, kt | `depot_small_kt`, `depot_large_kt`, `refinery_small_kt`, `refinery_large_kt` |
| CapEx, USD | `depot_small_capex_usd`, `depot_large_capex_usd`, `refinery_small_capex_usd`, `refinery_large_capex_usd` |
| Variable OpEx, USD/t in | `depot_small_var_usd_t`, `depot_large_var_usd_t`, `refinery_small_var_usd_t`, `refinery_large_var_usd_t` |
| Annualisation | `capex_years`, `fixed_opex_share` |

Yield, road factor, demand, collection, capacity basis and depot retention are already top-level `Scenario` fields, with organiser defaults. The model, audit and baseline all read the same values, and a run with overrides says "(custom parameters)" in `status_reason`.

## Our own settings

These settings did not come from the organisers. `POST /api/solve`, `POST /api/baseline` and the audit accept them as optional `Scenario` fields:

| Field | Default | Meaning |
|---|---|---|
| `haul_limit_km` | 214.29 | Longest straight-line supply haul |
| `refinery_candidates` | Frozen 20-site shortlist | Sites that may host a refinery. Onshore sites, PNK, PKN and BPN; never TRK |
| `depot_candidates` | All 69 onshore sites | Sites that may host a depot |
| `time_limit_s` | 90 | Solve budget, capped at 600 s by the solver. The web client gives up after 150 s |

`SOLVER_CORES` in the environment limits the solver on a shared or smaller machine.

An ineligible site is refused with `422` and the reason. A scenario left at these defaults keeps its `scenario_hash`, so stored runs stay valid. "Optimal among N candidates" is a claim about the list used.
