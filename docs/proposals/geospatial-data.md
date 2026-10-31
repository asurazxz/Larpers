# Geospatial Data Engineer proposal (brief Section 5.2)

Measured on our 80 sites and 4 airports at 11:40. Scripts and outputs are in the scratchpad. OSRM here means the public demo server, on OSM roads. Cost figures for North Kalimantan hold the rest of the network fixed, so the solver's numbers replace them once it runs.

## Changes to the plan, in priority order

1. **Default circuity should be 1.9, not 1.4.** On our own coordinates, 1.4 is below the 10th percentile of real road ratios. Logistics at 1.4 reads about 26% low.
2. **The 600 km depot→refinery prune breaks single-refinery plans.** On model km, no refinery candidate is reachable from all 80 sites. See Q3.
3. **11 Ketapang sites are in the sea** (966 kt, 14% of biomass). They must not be depot or refinery candidates, or the map will show a refinery offshore.
4. **Tarakan is an island.** Every tonne to TRK ends on a ferry, which the cost table does not price.
5. **Open blocker:** `CLAUDE.md` points to `docs/DECISIONS.md` for the 1,088 vs 1,087 kt resolution, and that entry does not exist. It decides whether North Kalimantan is served. See Q3.

## Q1. Haversine × circuity or road distance?

**Use haversine × circuity in the solver. Commit one OSRM table as an independent check.**

- The solver uses `km = hav_km × circuity`. A judge can reproduce it with a calculator, it responds to a slider, and it needs no network.
- One OSRM table call returned all 84 × 84 road distances, with no null cells. Commit it as `data/reference/osrm_table_84.json`, credit "© OpenStreetMap contributors", and never call it at runtime.
- Every flow carries `road_km` from that table, so the trace drawer shows model km beside road km.
- Add one stored scenario, `road_matrix`, that solves on OSRM km instead. "Does the network change on real roads?" is a strong honest-evaluation result for one matrix swap.

**Measured circuity** (64 nodes that snap within 5 km of a road, 1,954 pairs of 25 km or more):

| Haversine band | Pairs | Median | p10 | p90 |
|---|---:|---:|---:|---:|
| 25–100 km | 231 | 1.74 | 1.44 | 2.47 |
| 100–300 km | 450 | 1.87 | 1.65 | 2.20 |
| 300–600 km | 678 | 1.88 | 1.69 | 2.15 |
| 600+ km | 595 | 2.08 | 1.83 | 2.56 |
| **All** | **1,954** | **1.91** | **1.66** | **2.36** |

- The median across all 3,486 pairs, unfiltered, is 1.88.
- **Recommendation:** base 1.9, sweep {1.4, 1.9, 2.3}. Keep 1.4 only as the literature case. The brief's range of 1.2–2.0 sits mostly below what we measured.
- **Limit:** OSM under-maps plantation and logging tracks, so the ratio is biased high, most of all on short supply→depot legs. Treat 1.9 as fair for trunk legs and conservative for the first mile. The Domain expert should confirm this.

**With a day:** self-host OSRM on a Geofabrik extract with a truck profile, add plantation tracks, price river and coastal barge legs separately, and draw real route geometry.

**`distances.npz`** holds `node_ids` (84, fixed order: 80 sites then PNK, PKN, BPN, TRK), `hav_km` and `road_km`.

- Circuity is never baked in. Applied at load, it lets the slider work without a rebuild.
- Airports are in the matrix, so open question 10.1 needs no rebuild either way.
- Earth radius is 6371.0088 km. Round `hav_km` to 0.01 km and airport coordinates to 4 dp in `prepare.py`, so the solver and the browser's recomputation agree.

## Q2. Solution serialisation contract

This is a superset of the brief's fields, flat, with no join needed. It incorporates the full-stack proposal's requests (`slug`, `family`, `status`, `solved_at`, `stranded`, facility coordinates).

Coordinates use named `lat` and `lon`, never arrays, to avoid the GeoJSON `[lon, lat]` vs Leaflet `[lat, lon]` swap. Node ids are `KAL_SUP_nn`, an IATA code, or `CENTROID` for the baseline refinery, which is not a candidate site.

**`facilities[]`**
```json
{
    "site_id": "KAL_SUP_10",
    "label": "KAL_SUP_10, Kutai Kartanegara",
    "type": "refinery",
    "size": "small",
    "lat": -0.6682,
    "lon": 116.8524,
    "capacity_kt": 500,
    "capacity_basis": "saf_out",
    "throughput_kt": 277.1,
    "utilisation": 0.554,
    "capex_usd": 480000000
}
```
`capacity_basis` is `biomass_in` for depots and `saf_out` for refineries. Values are illustrative.

**`flows[]`**
```json
{
    "leg": "depot_refinery",
    "commodity": "biomass",
    "from": "KAL_SUP_18",
    "to": "KAL_SUP_10",
    "from_lat": 2.61,
    "from_lon": 117.2423,
    "to_lat": -0.6682,
    "to_lon": 116.8524,
    "from_label": "KAL_SUP_18, Bulungan",
    "to_label": "KAL_SUP_10, Kutai Kartanegara",
    "kt": 188.97,
    "hav_km": 367.09,
    "circuity": 1.9,
    "km": 697.471,
    "rate_usd_per_t_km": 0.12,
    "cost_usd": 15816131.38,
    "truck_t": 30,
    "trips": 6299,
    "road_km": 710.6
}
```
- `leg` is `supply_depot`, `depot_refinery` or `refinery_airport`. `commodity` is `biomass` or `saf`.
- `truck_t` is the PDF large truck for the leg: 9, 30 or 32 t.
- Keep 0 km co-located flows so mass adds up. The map skips drawing them.
- Each row above is checkable by hand: 188.97 × 1000 × 0.12 × (367.09 × 1.9) = 15,816,131.38.

**`stranded[]`** (new): `{site_id, label, lat, lon, kt, reason}`, drawn as hollow markers.

**Missing from the brief's 6.2, needed:**

| Table | Add | Why |
|---|---|---|
| `flows` JSON | `hav_km`, `circuity`, `rate_usd_per_t_km`, coordinates, labels, `commodity`, `road_km`, `truck_t`, `trips` | Yes, circuity and km basis were missing. Without them a cost cannot be retraced, and `kt` is ambiguous between biomass and SAF |
| `facilities` JSON | `lat`, `lon`, `label`, `capacity_kt`, `capacity_basis`, `capex_usd`, `utilisation` | No join, and CapEx traces per row |
| `solutions` | `status`, `solved_at`, `stranded jsonb`, `cost_by_leg jsonb`, `totals jsonb` (biomass kt, stranded kt, SAF kt, trips), `schema_version int`, `data_hash text` | "Optimal" only when status and gap support it. The hash ties a result to the input files |
| `scenarios` | `slug text unique not null`, `family text` | Stable UI key. Include `north_kalimantan` as a family |
| `sites` | `is_onshore boolean`, `is_candidate boolean`, `data_flag text` | See synthetic-data section |
| `robustness` | `lat`, `lon`, `label` | Airport candidates cannot foreign-key to `sites`, so denormalise |
| `solutions.scenario_id` FK | `on delete cascade` | Scenario re-runs stay idempotent |

Keep `airports.demand_share` as the display default only, and put the split actually used in `scenarios.params`, because sweeps vary it. Use the corrected split, not the brief's.

**`validate_solution()` runs before every write, and a failure blocks the load:**
- Each flow's `cost_usd` equals `kt × 1000 × rate × km`.
- `logistics_usd` is the sum of emitted `cost_usd`, within 1e-6 of the solver's value.
- `capex_usd` is the sum of facility `capex_usd`, and `objective_usd` is their total.
- Mass balances at each node, with yield at refineries, and throughput does not exceed capacity.
- Every id resolves, and every flow has coordinates.
- Biomass collected plus stranded equals 6,800 kt.

Round `kt` to 3 dp first, then compute cost from the rounded value, so displayed numbers reconcile exactly. Size is about 45 KB per solution, so fetch by slug.

**GeoJSON:** only for the static fallback, generated from these same records (`to_geojson(solution)`). It uses `LineString` in `[lon, lat]`, with properties copied. Arcs are straight lines, so label them "schematic, not road geometry".

**RLS:** I accept the SQL block in the full-stack proposal and will run it as part of the schema. Tables created over SQL have RLS off, so it must run before the publishable key ships.

## Q3. North Kalimantan: what the sites really are

**They are a tiny, self-contained supply pocket next to a customer, and far from any plant.** "Stranded" is the wrong word for the geography. The real issue is scale mismatch.

| Fact | Value |
|---|---|
| Sites | KAL_SUP_18 (92.89 kt), KAL_SUP_70 (96.08 kt), 32 km apart, 59 road km |
| To TRK | 88 and 57 km haversine |
| Nearest other supply | 304 km haversine, **689 road km** (circuity 2.27) |
| To BPN | 433 and 465 km haversine, 783 and 788 road km |
| SAF equivalent | 30.2 kt at 16%, 6% of a small refinery, 2.8% of output |

Three consequences:

- **189 kt exceeds a small depot.** It needs two small depots or one large, $4.5M either way. Two small depots at their own sites should win, because they avoid about $0.56M of supply→depot haul. That is a sanity test for the solver.
- **Biomass passes the airport it could have served.** It goes about 700+ km south, then SAF comes back north to TRK. Under full-production demand, TRK needs 82–103 kt at the `CLAUDE.md` splits, more than Bulungan's 30 kt, so that SAF has to travel anyway.
- **The 57 km to TRK is not truckable.** OSRM's 115 km route from KAL_SUP_70 includes a 63 km Ancam–Tarakan ferry, 12.6 h of a 13.5 h trip. Any flow to TRK has this leg. We price it at the 0.08 truck rate and must say so.

**Options, at circuity 1.9:**

| Option | Road km (model) | Cost | Result |
|---|---|---|---|
| Serve via central refinery (KAL_SUP_27) | 1,496 / 1,543 | $34.5M haul + $4.5M depots = **$39.0M**, $206/t biomass | OSRM says 1,917 / 1,922 km, $43.5M haul |
| Serve via East refinery (KAL_SUP_10) | 697 / 758 | $16.5M + $4.5M = **$21.0M**, $111/t biomass | OSRM agrees, $16.2M haul |
| Local small refinery | 0 | **$480M** at 6% utilisation | Saves $38M of haul and SAF hop against the central option. Payback 12.6 years if logistics recurs yearly |
| Strand both sites | n/a | Saves $21–39M, loses 30.2 kt SAF | Honest only if labelled |

The same pair of sites costs nearly twice as much without an East refinery. So Bulungan's fate follows the refinery decision. It is not a separate decision.

**Treatment:**

1. **Base case: serve them.** Hard collection, depots in Bulungan, no silent stranding. This matches the PDF's 6,800 kt.
2. **Protect their arcs from pruning (blocker for OR).** At 300 km, these sites reach only each other at any circuity, so a Bulungan depot is forced. At 600 km depot→refinery:
    - On haversine km, only 3 of 80 candidates are reachable by all sites (KAL_SUP_21, 52, 56, all labelled Paser). The central KAL_SUP_27 is cut at 787 and 812 km.
    - On ×1.4 or ×1.9 km, **none** are, so one refinery is infeasible under hard collection.
    - **Fix:** prune on `hav_km` only, so arcs do not change as the slider moves, and exempt all arcs from depots at sites 18 and 70. Tested for reachability only: 33 single-refinery candidates become reachable, including KAL_SUP_27.
3. **Add three stored scenarios (family `north_kalimantan`):** `nk_served` (base), `nk_excluded` (both sites removed, demand scaled), `nk_local_refinery` (small refinery forced at KAL_SUP_70). Their deltas are the failure case in solver numbers.
4. **Stranding penalty:** any penalty below roughly **$111–206/t biomass** makes the solver drop these sites. So do not run a penalty in the base case. Report the delta as the "price of Bulungan" instead.
5. **Interaction with the 1 kt overflow (needs the orchestrator):** at yield 0.16, one large refinery cannot take 6.25 kt of biomass. With single assignment the smallest possible strand is a whole site, 22.84 kt (KAL_SUP_40). If stranding is allowed, a Bulungan site is an obvious candidate to go, and a $480M second refinery is the alternative. Bulungan should not become the release valve by accident. Whichever way this is resolved, it needs logging first.

**Replace pitch beat 6:** "Bulungan's 189 kt sits beside Tarakan airport, but no refinery pays back on 30 kt of SAF. So it trucks 700-plus km past the airport it could serve, for $X M. That is what full collection costs here. Pertamina can tell us if a barge beats it."

## Parquet on Python 3.14

**pyarrow works; no alternative is needed.** All of these installed together in a clean venv on 3.14.6 (arm64). `pip check` passed, a parquet round trip worked, and a small MILP solved through `pulp.HiGHS`.

```text
pulp==2.9.0
highspy==1.15.1
numpy==2.5.4
pandas==3.1.0
pyarrow==26.0.0
psycopg[binary]==3.3.6
python-dotenv==1.2.4
pytest==9.2.0
global-land-mask==1.0.0
```

- `global-land-mask` is 2.5 MB, needs no network, and computes `is_onshore` in `prepare.py`.
- Wheels exist for Python 3.14 on Linux x86_64 and Windows, and for Python 3.12 on macOS arm64.
- **numpy 2.5.4 found no 3.11 wheel on macOS arm64**, while the same query succeeded for 3.12. The second machine must use Python 3.12 or newer, and any Render or Railway service should do the same. The brief's "Python 3.11" will fail on these pins.

## Python to Supabase

**Use a direct Postgres connection: `psycopg` with `DATABASE_URL`.**

- It can run DDL and RLS statements, which the REST client cannot.
- It loads a batch in one transaction, so a failed run cannot leave a half-populated scenario grid on stage.
- It avoids an extra client dependency. Use `psycopg.types.json.Jsonb` for the JSONB columns.

| Variable | Use |
|---|---|
| `DATABASE_URL` | Loader, schema and `scenarios.py` |
| `SUPABASE_DB_PASSWORD` | Not used in code; assumed to be already in the URL |
| `SUPABASE_SECRET_KEY` | Not used. Fallback only if Postgres is unreachable (REST upsert) |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | Web only, under `NEXT_PUBLIC_` names |

**Check at 12:00, not yet tested as instructed:** Supabase's direct host is IPv6-only by default, and I have not seen the URL's form. If `SELECT 1` fails on venue Wi-Fi, switch `DATABASE_URL` to the Session pooler URI. On the Transaction pooler (6543), set `prepare_threshold=None`. A password with special characters must be URL-encoded.

**Split the scripts.** `data/prepare.py` is offline and needs no secrets, so tests and cold start work without `.env`. A separate `data/load.py` writes to Supabase. The brief combines them.

**`tests/test_data.py` covers:**
- 80 rows, sum 6800.0 kt, unique ids, and `kt × 1000 == tonnes`.
- Four airports by IATA, each inside the Kalimantan bounding box. BTJ is absent, which catches the Sultan Iskandar Muda trap.
- `airports.dat` read with explicit column names, `dtype=str` for codes, `keep_default_na=False` and `\N` as null.
- North Kalimantan pinned at 681 and 706 km from the centroid, 88 and 57 km from TRK, 304+ km from other sites.
- Exactly 69 onshore sites.

## Is the data synthetic?

**Almost certainly generated, though we cannot prove it. Treat supply sites as synthetic.** Airports are real (OpenFlights), and all four snap within 0.6 km of a road.

| Evidence | Finding | Strength |
|---|---|---|
| Sites in the sea | **11 of 80 are off land on the GLOBE 1 km mask** and outside simplified admin polygons (geoBoundaries): 03, 22, 31, 32, 37, 43, 50, 58, 62, 69, 80. All Ketapang, 965.72 kt. Up to 32 km offshore, and OSRM snaps up to 47 km. KAL_SUP_58 is borderline at 3.9 km | Strong |
| Tonnage shape | Nothing between 35.94 and 87.72 kt. 70 sites fit uniform 87.72–99.90 (KS D 0.148, 5% critical value 0.163). 10 sites step almost evenly from 22.84 to 35.94 | Strong |
| Totals | Sum is exactly 6,800.00 and fits the PDF's "20–100 kt" | Moderate |
| Missing fields | No crop, year or source | Moderate |
| Districts | All 8 province–district pairs are valid and plausible. 58 of 80 fall in their labelled regency. 10 land sites fall 0.4–10.9 km into a neighbouring one, which may be polygon simplification | Weak |

So the district labels look real and the points look generated around them.

**How to handle it:**
- Keep given coordinates and tonnages, because the PDF outranks everything and all 6,800 kt counts as supply. Do not move points silently.
- Set `is_candidate = is_onshore`. That leaves 69 candidates, 10 of them in Ketapang.
- Draw offshore sites hollow. Offshore road km are understated by the snap distance, so `road_km` should add it.

**Label for the assumptions slide, UI footer and README:**

> Biomass sites are organiser-supplied and treated as synthetic: the tonnages look generated, and 11 of 80 sites (966 kt, 14%) plot in the sea off Ketapang, so those are supply only, not facility candidates. Results show how the method behaves, not where to buy land. A real plan needs mill-level data. Airports are real (OpenFlights). Road checks use OpenStreetMap, which under-maps plantation tracks.

## Needs from other roles

- **Orchestrator:** log the 1,087 kt resolution, and rule on circuity 1.9 and offshore candidate exclusion.
- **OR:** prune on `hav_km` with the Bulungan exemption, take candidates from `is_candidate`, and add the three North Kalimantan scenarios and `road_matrix`.
- **Domain:** confirm 1.9 and find a barge rate for the TRK and Bulungan limits. Check the ferry claim before citing it, since it rests on one OSM route.
- **Full-stack:** render `stranded` and `road_km`. Update the circuity buttons, because the proposal's 1.2 / 1.4 / 2.0 no longer matches. Keep a 0.01 km tolerance in the browser's check.
