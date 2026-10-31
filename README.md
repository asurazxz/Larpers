# Larpers: Kalimantan SAF network planner

Autonomous SG 2026, Airbus Challenge #3. A supply planner edits a scenario, presses Run, and gets a new network of depots and refineries from a mixed-integer model on the official 80 biomass sites. A separate audit checks every result, and a greedy baseline is shown beside it. Stored runs are a labelled fallback when no solver is running.

A solver makes every decision. No language model is in the decision path.

## Setup from cold

Needs Python 3.12 or newer and Git. From the repo root, one command creates the environment and builds the processed data.

macOS or Linux:

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt && .venv/bin/python data/prepare.py
```

Windows (Git Bash):

```bash
py -3 -m venv .venv && .venv/Scripts/python -m pip install -r requirements.txt && .venv/Scripts/python data/prepare.py
```

`data/prepare.py` validates the raw files, then writes `data/processed/` and prints the `data_hash`. It runs offline and needs no `.env`.

Activate the environment (`source .venv/bin/activate`, or `source .venv/Scripts/activate` on Windows) before the commands below. Run everything from the repo root.

## Run

| What | Command |
|---|---|
| Tests | `python -m pytest tests/` |
| Base case solve | `python -m solver.model` |
| Greedy baseline | `python -m solver.baseline` |
| Stored runs into `web/data/bundle.json` | `python -m solver.scenarios` (`--tiers T1` for the first tier only; `--fresh` ignores runs already stored) |
| Robustness by district | `python -m solver.sensitivity` |
| Solver API | `uvicorn api.main:app --port 8000` |
| Web | `cd web && npm install && npm run dev` |

`python -m solver.scenarios --stub --out /tmp/stub.json` checks the pipeline without a solver. It refuses to write inside `web/`, so stub output never looks like a stored run.

A rerun reuses a stored run only when its data hash, its full scenario and the solver version (a hash of the `solver/` sources) all match. Anything else is solved again.

Google sign-in is needed only for live solves through the API. Stored runs open without logging in. Auth setup is in [docs/AUTH.md](docs/AUTH.md).

## Data provenance

| Data | Source | Notes |
|---|---|---|
| 80 biomass sites, 6,800 kt | Organisers, `data/raw/kalimantan_80_locations_6800kt_full_range.csv` | Read-only |
| Cost table, rates, truck sizes | Airbus Challenge #3 PDF, p. 3 | `resource/` |
| Official parameters (yield, demand, OpEx, capacity basis, road factor) | Organisers' update, 31 Oct 12:45: `resource/Autonomous SG 2026_Summary of Updates.pdf` p. 2 and `data/raw/challenge3_parameters.xlsx` | Base scenario |
| Airports PNK, PKN, BPN, TRK | OpenFlights, `data/raw/airports.dat` | Selected by IATA code only |
| Road distances, 84 × 84 | OSRM table on OpenStreetMap, `data/reference/osrm_table_84.json` | © OpenStreetMap contributors. Bundled; never called at runtime |
| Onshore test | `global-land-mask` | 69 onshore sites are facility candidates |

`data/processed/hashes.json` holds SHA-256 hashes of the raw files and distance arrays. Every result carries that `data_hash`, which ties it to these inputs. Every input is marked official, assumed or computed in [docs/ASSUMPTIONS.md](docs/ASSUMPTIONS.md).

> Biomass sites are organiser-supplied and treated as synthetic: the tonnages look generated, and 11 of 80 sites (966 kt, 14%) plot in the sea off Ketapang, so those are supply only, not facility candidates. Results show how the method behaves, not where to buy land. A real plan needs mill-level data. Airports are real (OpenFlights). Road checks use OpenStreetMap, which under-maps plantation tracks.

## Limits

- **Base scenario is the organisers' 12:45 update.** Yield 0.20 t SAF per t biomass, road factor 1.3 on great-circle distance, depots lose no mass, one-year basis. Our earlier assumptions (yield 15%, road factor 1.9, production-derived demand) are one labelled sensitivity run, `earlier_assumptions`.
- **Demand is 300 kt SAF per airport** (PNK, PKN, BPN, TRK), 1,200 kt in total, which needs 6,000 kt of biomass. Collection is optional, so which of the 6,800 kt to skip is a solver decision.
- **Capacity is biomass intake.** Depots 150 and 300 kt, refineries 500 and 1,087 kt in per year.
- **The objective is annualised.** CapEx over 20 years with no interest, fixed OpEx at 5% of CapEx, variable OpEx per tonne of biomass in, and transport. A result shows `opex` as "not_provided" until the solver includes the OpEx terms; check a run's `opex` field before quoting a total as the official objective.
- **Tarakan (TRK) is an island.** The last leg is a barge at 0.08 USD/t/km with no extra fixed cost, as the organisers state. There are no other ports or sea legs.
- **Ours, not official:** the 214 km straight-line supply haul limit, the refinery candidate shortlist, split flows and the 69 onshore candidate sites. The OSRM road table is a reference check, not the cost basis.
- **"Optimal" holds among the refinery candidates searched**, and only at gap 0. Otherwise a result says "Best found, gap X%". A time-limited run that finds nothing says "could not find", not "does not exist". With at least six large refineries needed for 6,000 kt, solves are slower than before.
- **Annual totals only.** Moisture, seasonality and storage are not modelled.
- **Bulungan** (KAL_SUP_18, KAL_SUP_70) sits next to Tarakan airport and far from other supply. The solver serves it or skips it, and the stored run shows which. That is our main failure case.

Assumptions, judge Q&A and the post-freeze list are in [docs/ASSUMPTIONS.md](docs/ASSUMPTIONS.md), [docs/QA.md](docs/QA.md) and [docs/NEXT.md](docs/NEXT.md).

## Team setup (Supabase, login only)

Supabase provides Google login only. Solution data stays in the committed `web/data/bundle.json`.

Prereqs: Node.js 18+ (for `npx`), Git. Docker Desktop only if you want a local database.

1. Accept the Supabase org invite (check your email), then log in to the CLI:
   ```sh
   npx supabase login
   ```
2. Link this repo to the shared cloud project:
   ```sh
   npx supabase link --project-ref cpfymmjjpdmidhtlzgbt
   ```
   (Project: Larpers, Singapore — https://supabase.com/dashboard/project/cpfymmjjpdmidhtlzgbt)
3. Copy `.env.example` to `.env` and fill in the keys (ask in the group chat — never commit `.env`).

### Database workflow

The schema lives in `supabase/migrations/` so everyone's database matches the repo.

```sh
git pull                                    # get teammates' migrations first
npx supabase migration new add_some_table   # creates supabase/migrations/<timestamp>_add_some_table.sql
# write SQL in that file
npx supabase db push                        # apply new migrations to the cloud project
git add supabase/migrations && git commit   # push so others get it
```

Rules:
- **Don't create or alter tables in the Dashboard UI.** If you did, run `npx supabase db pull` and commit the generated migration.
- **Never edit a migration that's already been pushed** — write a new one instead.
- Say in the chat before running `db push` so two people don't push conflicting migrations at once.
- Enable Row Level Security on every table that the frontend reads.
- `SUPABASE_SECRET_KEY` bypasses RLS: use it only in backend code/scripts.

### Auth

- Google sign-in (Google Cloud Console setup, Supabase config, Next.js/Vite code, admin role):
  [docs/AUTH.md](docs/AUTH.md)
- Writing RLS policies for new tables: [docs/RLS.md](docs/RLS.md)
