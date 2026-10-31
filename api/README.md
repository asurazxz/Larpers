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

## Our own settings

The organisers fix yield, capacities, costs, rates, road factor and demand. These settings are ours, so `POST /api/solve`, `POST /api/baseline` and the audit accept them as optional `Scenario` fields:

| Field | Default | Meaning |
|---|---|---|
| `haul_limit_km` | 214.29 | Longest straight-line supply haul |
| `refinery_candidates` | Frozen 20-site shortlist | Sites that may host a refinery. Onshore sites, PNK, PKN and BPN; never TRK |
| `depot_candidates` | All 69 onshore sites | Sites that may host a depot |
| `time_limit_s` | 90 | Solve budget, capped at 600 s by the solver. The web client gives up after 150 s |

`SOLVER_CORES` in the environment limits the solver on a shared or smaller machine.

An ineligible site is refused with `422` and the reason. A scenario left at these defaults keeps its `scenario_hash`, so stored runs stay valid. "Optimal among N candidates" is a claim about the list used.
