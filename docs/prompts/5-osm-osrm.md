# Prompt: OpenStreetMap basemap + OSRM routing

Paste everything below the line into a fresh Claude Code session at the repo root.

---

Add OpenStreetMap and OSRM routing to this project in three parts, each landing as its own commit on a branch `damien/osm-osrm`. Before starting, read `CLAUDE.md`, `docs/NEXT.md`, `docs/ASSUMPTIONS.md`, `data/prepare.py`, `solver/inputs.py`, `solver/contract.py`, `solver/audit.py`, the distance code in `solver/model.py` (around lines 90-105 and 405-420), and `web/app/Map.tsx`. If something you read contradicts this prompt, stop and ask me before going on.

## What already exists (don't rebuild it)

- `data/reference/osrm_table_84.json` is an 84×84 OSRM `/table` response (distances in metres, `sources[i].distance` = snap distance), with ids in the same order as `data/processed/` nodes. `data/prepare.py::road_matrix` turns it into `road_km`, adding the snap distance at each offshore end. `solver/inputs.py` loads it as `inputs.road_km`. Today it is used **only as a reference**, and every cost uses `hav_km × road_factor` (1.3 official).
- `web/app/Map.tsx` uses react-leaflet with an offline `borneo.json` land layer. It has optional CARTO Voyager tiles, off by default and off on stage, and draws every flow as a straight two-point `Polyline`.
- `docs/NEXT.md` lists `road_matrix` (a `distance_basis` field) and "real OSRM routes" as post-freeze ideas. This work implements them, so move them out of NEXT.md once done.

## Ground rules

- **No live OSRM calls from the app, API or solver.** All OSRM access goes through one offline fetch script whose output is committed to `data/reference/`. `prepare.py` stays offline. The presenter's laptop must work with no network.
- The OSRM base URL comes from env `OSRM_URL` and defaults to the public demo `https://router.project-osrm.org`. Throttle requests to at most 1 per second, cache every response on disk so a rerun resumes, and set a descriptive User-Agent. A self-hosted server is an optional drop-in: document in `data/reference/README` (or CREDIT.txt) how to run `osrm-backend` in Docker on the Geofabrik Kalimantan extract (check the exact URL under `asia/indonesia/` before writing it down), with the `car` profile, or `truck` if one is available.
- The public demo uses the **car** profile. Say so wherever OSRM numbers appear (popup, Provenance, ASSUMPTIONS.md). It is not a truck network and it under-maps plantation tracks.
- Keep the defaults on `distance_basis="factor"` and road factor 1.3. The organisers' 12:45 update sets 1.3 × great-circle, so OSRM is an alternative scenario and never the base case.
- Follow `CLAUDE.md`: `data/raw/` is read-only, 4-space indent in Python and TS, `solver/audit.py` must not import `solver/model.py`, say "optimal" only at MIP gap 0, select airports by IATA code, and no AI attribution in commits.
- Tarakan (TRK) is an island. Its last leg is a barge at 0.08 USD/t/km, and trucks cannot reach it. Check what `osrm_table_84.json` holds for TRK pairs (ferry, a snap to the mainland, or nonsense) before using it anywhere.

## Part 1: OSM basemap (frontend only)

1. In `Map.tsx`, add a basemap choice: `none` (offline land layer only, the default), `osm` (`https://tile.openstreetmap.org/{z}/{x}/{y}.png`) and `carto` (the existing layer). Keep the offline `borneo.json` land pane underneath in every mode so a tile failure still shows land.
2. OSM attribution must show whenever `osm` or `carto` is on: "© OpenStreetMap contributors", linked to https://www.openstreetmap.org/copyright. Respect the OSM tile usage policy (no prefetching, `maxZoom` 19).
3. Put the toggle wherever the existing tile switch is controlled (find the `showTiles` prop and its caller). Don't add a new panel.
4. Check: `cd web && npm run build` passes, and the static fallback build (`web/scripts/build-static.mjs`) still works with tiles off.

## Part 2: Road-following flow lines (display only)

1. Write `data/fetch_osrm_routes.py`, an online one-off script that is never run by `prepare.py`. It calls OSRM `/route/v1/driving/{lon,lat};{lon,lat}?overview=simplified&geometries=polyline6` for a set of node pairs and writes `data/reference/osrm_routes.json`, which records `{ "profile", "osrm_url", "fetched_at", "routes": { "FROM|TO": { "distance_m", "polyline6", "snap_from_m", "snap_to_m" } } }`. Use node coordinates from `data/processed/`, the same points the table used.
2. Pair set: every directed pair that appears as a flow in any run in `web/data/bundle.json`, plus every (shortlisted refinery → airport) and (onshore depot → shortlisted refinery) pair, so live solves usually hit too. Skip TRK legs, which are drawn as a straight dashed barge line. Print how many pairs there are and the estimated time before fetching.
3. Add a small step, either in `data/prepare.py` or a separate `web/scripts/` step that matches how `sites.json` is produced, that writes `web/data/routes.json` as `{ "FROM|TO": [[lat, lon], ...] }`, decoded and rounded to 5 decimals. Keep it outside `bundle.json` and the solution contract: geometry is display data keyed by node pair, and the frontend still knows nothing about the solver. Report the file size, and simplify further if it is over ~1 MB.
4. In `Map.tsx`, draw each flow with its route geometry when `routes.json` has the pair (try `A|B`, then reversed `B|A`). Otherwise draw the straight line as today, dashed. Draw offshore snap segments and TRK barge legs dashed too. Click, highlight, dim and width behaviour stays exactly the same.
5. The popup distance row stays as the cost basis (`hav × factor = km`). Add an "OSRM road (car)" row from `flow.road_km` when it is present, so the drawn line and the costed number are never confused.
6. Credit OSRM and OSM in `web/components/Provenance.tsx` and `data/reference/CREDIT.txt`.

## Part 3: Solve on OSRM distances

1. Add `distance_basis: Literal["factor", "osrm"] = "factor"` to `Scenario` in `solver/contract.py`, and record it on each `Flow` (or on the solution, whichever the contract already does for `road_factor`). Regenerate `contracts/solution.schema.json` and update `web/lib/contract.ts` to match.
2. In `solver/model.py`, under `osrm`, leg distance = `inputs.road_km[a, b]` (snap included) instead of `hav × road_factor`. Keep the haul limit on straight-line km (214 km): it is our stated assumption and must not move silently. For TRK legs, use whatever the TRK check in the ground rules showed is defensible. My default is barge = haversine × road_factor at 0.08 even under `osrm`, written down in `docs/ASSUMPTIONS.md`. Make sure `km`, `cost_usd`, the objective and `road_km` stay consistent on every flow.
3. Make `solver/audit.py` recompute the `osrm` distance independently from `inputs.road_km` (not from model code) and check it against `flow.km`.
4. Update `solver/baseline.py` so the baseline uses the same basis as the scenario it is compared with.
5. Add a stored run `road_matrix` (official parameters, `distance_basis="osrm"`) to `solver/scenarios.py` and regenerate `web/data/bundle.json`. In the UI, label it clearly as "OSRM car road km, not the official 1.3 factor". Report how the network differs from the base case (opened sites, objective delta, gap) in the PR description, and use "optimal" only if the gap is 0.
6. `api/main.py` must accept `distance_basis`. Check that its infeasibility precheck still holds.

## Tests and done

- Add tests: `routes.json` keys are valid node pairs and coordinates are in the Kalimantan bbox. `distance_basis="osrm"` solves and passes audit. Audit fails on a tampered `km` under `osrm`. Default scenarios are unchanged: the base-case objective is byte-identical to `main`.
- `python -m pytest tests/`, `python -m solver.model`, `python -m solver.scenarios` and `cd web && npm run build` all pass. Show me the outputs.
- Update `docs/ASSUMPTIONS.md` (car profile, snap handling, TRK rule, haul limit still straight-line), `docs/DECISIONS.md` (one line per choice that conflicts with an earlier decision) and `docs/NEXT.md` (remove what's now done, keep the truck profile and plantation tracks as future work).
- Commit each part separately, push the branch and open a PR. Don't merge.

Ask me before: changing any default value, changing the base-case objective, fetching more than ~3,000 routes from the public server, or adding a new dependency (a polyline decoder is fine in Python; on the web side, decode at build time so no runtime dependency is needed).
