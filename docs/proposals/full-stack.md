# Full-Stack Proposal (Section 5.3)

Spiked in the scratchpad at 11:35. "Verified" below means I built or ran it. Nothing touched Supabase or Vercel, so everything about them is untested.

## Core decision

`web/` is a client-only single-page app, built with `output: 'export'`. It has no server components fetching data, no API routes, no middleware and no `next/image`. It renders from one `Bundle` JSON object, loaded once at page load. After that every click is in-memory, so wifi can drop mid-demo with no effect.

Levels 2, 3 and 4 run the same code. They differ by one env var.

## Versions (exact, `--save-exact`, npm with lockfile)

| Package | Pin | Note |
|---|---|---|
| next | **16.4.3** | Deviation from the brief, see below |
| react, react-dom | 19.3.1 | |
| react-leaflet | 5.0.0 | v5 needs React 19; v4.2.1 needs React 18 |
| leaflet | 1.9.4 | |
| @supabase/supabase-js | 2.118.0 | |
| tailwindcss | 3.4.19 | v3 config, not v4 |
| postcss, autoprefixer | 8.5.32, 10.6.2 | |
| typescript | 5.9.3 | |
| @types/react, @types/node, @types/leaflet | 19.3.0, 22.20.5, 1.9.22 | |

Node 22 (`engines` and `.nvmrc`). Recharts dropped: two stacked bars are about 30 lines of divs, one less dependency.

**Why not Next 14.** `next@14.2.35` installs and builds, and it is the newest 14.x. `npm audit` reports it **critical**, with 25 advisories on `next`, fixed only in the 15.5 line or later. 16.4.3 reports **0 vulnerabilities**; 15.5.28 still reports 2 (postcss).

The honest case is narrow. Those advisories are server-side (Image Optimization, Server Actions, rewrites, middleware), and a static export runs no Next server in production, so they are not reachable. I still prefer 16 for two reasons: the repo is public and a judge may run `npm audit`, and I could not confirm whether Vercel refuses vulnerable Next versions at deploy time. The docs search was inconclusive, and finding out at 14:30 is the wrong time.

**Rollback costs about a minute.** The same spike code also built and rendered on `next@14.2.35` + React 18.3.1 + `react-leaflet@4.2.1`. Only pins change. If anything in 16 costs more than 15 minutes, revert.

Spike results:

| Check | Next 14.2.35 | Next 16.4.3 |
|---|---|---|
| `next build` with `output: 'export'` | pass | pass |
| Leaflet renders from `file://`, no server, no tiles | pass, screenshot checked | pass, DOM checked |
| Leaflet renders over http | pass | not run |
| Tailwind 3.4.19 CSS compiled | not run | pass (build only, not re-rendered) |

Fake bundle size: 25 scenarios × 2 kinds × 110 flows = 541 KB, imported straight into the JS.

## Q1. Map: react-leaflet + Leaflet canvas renderer

- **Why:** 80 sites + 4 airports + arcs is small. Arc count is about 110: 80 site arcs, at least 23 depot arcs (6,800 / 300), and a few airport arcs. deck.gl and MapLibre add WebGL and style-spec risk for no gain here. Leaflet with `preferCanvas` rendered this load in the spike.
- **SSR trap:** `app/page.tsx` is `'use client'` and imports the map through `dynamic(() => import('./Map'), { ssr: false })`. Use `CircleMarker` only, which avoids Leaflet's broken default-icon paths under bundlers.
- **Base layer needs no network.** Natural Earth 1:50m land from the `world-atlas` package (public domain), clipped to Borneo and neighbouring coasts, committed as `web/data/borneo.json`. Size 166 KB, 11,871 points. Airport and province labels are ours, drawn as Leaflet tooltips. The 1:10m file is 1.4 MB and not worth it.
- **Tiles are optional and off on stage.** A `B` key toggles CARTO `voyager_nolabels` for Q&A. No API key needed (HTTP 200 checked at 11:36), but attribution is required, and I have not read CARTO's usage terms. Half-loaded tiles on flaky wifi look worse than none, so the land layer is the default look.
- **If tiles fail:** nothing happens. Land sits in a custom pane below `tilePane`, so it shows through. Levels 2 to 4 look identical.
- Map is fixed to Kalimantan bounds. Arc width is proportional to kt, colour is by leg.

## Q2. Disrupt

**The state is one value, not independent controls:**

```ts
type View =
    | { kind: 'base' }
    | { kind: 'grid'; yieldValue: number; circuity: number }
    | { kind: 'disrupt'; slug: string };
```

Disruptions are solved only at base assumptions, and the grid has no disruptions. The cross-product does not exist, so selecting one clears the other, and the UI says "Disruptions are solved at base assumptions only".

**Precomputed mode.**
- Runs available: each open refinery removed, and the top 10 depots by throughput removed (Section 6.3).
- Click an open facility on the map or in the list. Depots with no stored run are greyed out with "not pre-run", never silently mapped to the nearest stored result.
- Result shows the removed facility as a hollow red ×, changed arcs highlighted, unchanged arcs dimmed, cost delta against the base optimal, and how many sites moved.
- Baseline comparison is hidden in disrupt mode. The comparison there is against the base optimal.
- An infeasible run shows "No feasible network under this disruption", as a result rather than an error.

**Demo risk for OR.** The 80 candidates are dense, so removing one refinery site may just open the site next door, giving a tiny delta and a dull map. Please add one or two "district lost" scenarios (for example, no refinery in Ketapang), and pick the demo disruption after looking at the stored results.

**Live mode (stretch).** A separate "Run live solve" button, shown only if `NEXT_PUBLIC_SOLVER_API_URL` is set and the ten-in-a-row gate passed. `POST /solve` returns the same `Solution` JSON into the same renderer. A real spinner shows, with a 30 s timeout. On failure it stays on the stored run and says so.

## Sliders: not sliders

A continuous slider implies interpolation we do not have. The control is **a segmented radio group with one button per solved value**, built from the distinct values in stored `params`, so a 2×2 fallback grid needs no code change. Example: `Yield: 13% | 16% | 19%`, `Circuity: 1.2 | 1.4 | 2.0`, titled "Stored runs".

Honest labelling, all always on screen:
- Header badge: `PRE-SOLVED: N stored runs, no solver running`. Flips to `LIVE SOLVE` only for a real live result, using the returned `solve_seconds`.
- Provenance strip: run slug, solve time, MIP gap, data source.
- No fake spinner, no "re-solving" text, no artificial delay. A short crossfade only.
- Status text comes from one function: `Optimal` only when the stored gap is 0 (tolerance 1e-9), otherwise `Best found, gap x%`. If HiGHS stops at its default gap, the label will say so.

**I reject Section 6.3's "Looks live, is not".** It contradicts honest labelling. Pitch beats 4 and 5 need rewording: "click a refinery off, network reroutes" becomes "here is the stored re-solve", and "slide yield" becomes "step through the solved yields".

## Q3. Single screen (designed for 1280×720, minimum 18 px text, light theme for a lit room)

```
+------------------------------------------------------------------------------------------------+
| Kalimantan SAF Network Planner              [ PRE-SOLVED: N stored runs, no solver running ]   |
| Run: base, yield 16%, circuity 1.4 | solved HH:MM, S.S s, gap 0 | Data: Supabase | Trace N/N ok |
+-------------------------------------------------------------+----------------------------------+
|                                                             | COST (USD)                       |
|  MAP, about 65% width, fixed to Kalimantan                  | Optimal   $X.XXB   Optimal, gap 0|
|                                                             | Baseline  $Y.YYB   greedy        |
|                              (!) N. Kalimantan   # TRK      | Saving    $Z.ZZM   N.N%          |
|      # PNK                                                  |  Opt  [RRRRRRRDDLLLl]            |
|         o--o                                                |  Base [RRRRRRRRDDLLLLl]          |
|          \  \===[depot]                                     |  refinery, depot, leg 1, 2, 3    |
|           \=====[REFINERY]==========\                       +----------------------------------+
|        o--[depot]====/               \===# BPN              | ASSUMPTIONS (stored runs)        |
|              \                                              | Yield     [13%] [16%] [19%]      |
|      # PKN    o                                             | Circuity  [1.2] [1.4] [2.0]      |
|                                                             +----------------------------------+
|  Legend: leg colours, arc width = kt, marker size = capacity| DISRUPT (at base assumptions)    |
|  Click an arc or facility: trace drawer opens over map      | [Refinery A] [Refinery B]        |
|  "kt x km x $/t/km = $, recomputed OK"                      | [Top 10 depots v]    [Reset]     |
|                                                             +----------------------------------+
|                                                             | ROBUSTNESS  [Off] [Depot] [Ref]  |
|                                                             | k of n runs: all / most / some   |
+-------------------------------------------------------------+----------------------------------+
| WHERE THIS FAILS (1) N. Kalimantan, 189 kt: ships N km at $/t vs mean $/t. Click to show.      |
| (2) Refinery count flips with yield: 1,087 kt cap, break-even 15.985%  (3) No OpEx, seasons, roads |
+------------------------------------------------------------------------------------------------+
```

Everything is on one screen with no tabs or scrolling, so nobody hunts for a control on stage. Pitch beats run top to bottom on the right panel, then the bottom band.

**Traceability.** Clicking any arc recomputes haversine × circuity from lat/lon in the browser and `kt × 1000 × km × rate`, using the PDF rates 0.10, 0.12, 0.08. It compares both with the stored `km` and `cost_usd`. The header shows how many arcs pass. Low cost, and it serves the 20% trust criterion directly.

**Robustness.** Show "9 of 9 runs", not "100%". Nine runs cannot support a continuous scale, so my answer to open question 5 is three bins (all / most / some) labelled with k of n. Use blue and orange rather than green and amber, for colour-blind viewers and washed-out projectors.

## Failure-case display (required, Section 9)

A permanent bottom band, never behind a click. Each row states the failure and how the user would know.

1. **North Kalimantan.** KAL_SUP_18 and KAL_SUP_70, 189 kt, 2.8% of biomass. They are 681 and 706 km from the centroid and 304+ km from any other supply site, yet 88 and 57 km from TRK. Do not use the brief's "760 km from everything". The row is computed from the selected run: where they ship, km, $/t against the network mean, or stranded kt if the model allows stranding. Clicking rings both sites and opens the trace. How you know: their $/t stands out in the run.
2. **Refinery capacity cliff.** 6,800 × yield passes 1,087 kt at 15.985%, so the default 16% sits just past the break-even. The row reports refinery count across stored yields, computed from data. How you know: the count changes as you step yield. Final wording waits on the resolution, which CLAUDE.md points to but `docs/DECISIONS.md` does not yet contain.
3. **Not modelled.** OpEx, seasonality, moisture, road network. Text must match `docs/ASSUMPTIONS.md`. How you know: orange sites are the ones that depend on unverified inputs.

Per-run states also show here: infeasible runs and any non-zero MIP gap.

## Supabase access

The frontend uses the publishable key only (`anon` role). Run once after the tables exist. Owned by Data, since it is part of the schema.

```sql
do $$
declare t text;
begin
    foreach t in array array['sites','airports','scenarios','solutions','robustness'] loop
        execute format('alter table public.%I enable row level security', t);
        execute format('revoke all on public.%I from anon, authenticated', t);
        execute format('grant select on public.%I to anon, authenticated', t);
        execute format('create policy %I on public.%I for select to anon, authenticated using (true)', t || '_read', t);
    end loop;
end $$;
```

- The revoke matters. RLS alone makes a blocked delete return 0 rows silently; revoking gives a hard `42501` error, so the test below can tell the difference.
- Do not use `force row level security`. The loader connects through `DATABASE_URL` as owner or with the secret key, and needs to keep writing.
- Any table added later needs the same four lines.
- `web/scripts/check-rls.mjs` (run at 12:15): with the publishable key, select must return rows on all five tables, and insert, update and delete must each return `42501`.

**Env.** `web/` does not read the root `.env`. Generate the file without printing it, from the repo root:

```bash
{ grep '^SUPABASE_URL=' .env; grep '^SUPABASE_PUBLISHABLE_KEY=' .env; } | sed 's/^/NEXT_PUBLIC_/' > web/.env.local
```

| Variable | `web/.env.local` | Vercel (Production and Preview) |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | yes |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | yes | yes |
| `NEXT_PUBLIC_DATA_SOURCE` | `supabase` | `supabase` |
| `NEXT_PUBLIC_SOLVER_API_URL` | stretch only | stretch only |

`SUPABASE_SECRET_KEY`, `DATABASE_URL` and `SUPABASE_DB_PASSWORD` never go in `web/` or Vercel. `NEXT_PUBLIC_` values are inlined at build, so a change needs a redeploy. Add `web/.env.example` with names only (`.gitignore` already allows it and already ignores `web/.env.local`). Add `out/` to `.gitignore`. Vercel: Root Directory `web`, Node 22.

## Fallback ladder: one code path

`web/scripts/snapshot.mjs` (`npm run snapshot`) reads the five tables with the publishable key, validates them, and writes `web/data/bundle.json`, which is committed. It aborts if a flow names an unknown node. The app imports that file statically, so there is no fetch and it works on `file://`.

```ts
export async function loadBundle(): Promise<Loaded> {
    if (process.env.NEXT_PUBLIC_DATA_SOURCE !== 'supabase') {
        return { bundle: snapshot, source: 'snapshot' };
    }
    try {
        const { fetchBundle } = await import('./supabase');
        return { bundle: await fetchBundle(AbortSignal.timeout(2500)), source: 'supabase' };
    } catch {
        return { bundle: snapshot, source: 'snapshot' };
    }
}
```

`fetchBundle` must throw on `error` and on any empty table. supabase-js returns `{ data: null, error }` instead of throwing (verified: aborted at 1,505 ms on an unreachable host), and a bad policy returns an empty list with no error. The source is decided once at load and never swaps mid-demo. The header states which one is in use.

| Level | How | Data source |
|---|---|---|
| 2. Vercel | deploy | Supabase, snapshot if unreachable |
| 3. Local | `npm run dev` | Same |
| 4. Static | `npm run build:static`, copied to `/fallback`, committed | Snapshot only, Supabase code not loaded |
| 1. Live | Level 2 plus solver URL | Same as 2, plus real solves |

Level 4 is `NEXT_PUBLIC_DATA_SOURCE=snapshot next build` with `assetPrefix: './'`. **The relative prefix is required:** the default absolute `/_next` paths rendered nothing on `file://`, while `./` rendered a working map. Use it in all builds, and keep the app to one route, because the relative path only holds at root.

Level 4 needs almost no extra work and exceeds the brief, since it carries every stored run, not just the base case and one disruption. Double-click `fallback/index.html`, about 3 MB, no npm and no server. Build it at 12:30 from the fixture so it exists early, and re-run after each solve. Keep one screenshot in the slides as a last resort.

## Needs from other roles

**Data (schema changes):**
- `scenarios.slug text unique not null` and `family text` (`base`, `grid`, `disrupt_refinery`, `disrupt_depot`). UUIDs give the UI no lookup key.
- `solutions.status text` (`optimal`, `feasible`, `infeasible`), `solved_at timestamptz`, `stranded jsonb`. Allow null costs for infeasible runs.
- A facility may need its own `lat` and `lon`, see below.

**OR:**
- Flow `km` is road km (haversine × circuity), and `cost_usd = kt × 1000 × km × rate`, with refinery→airport at 0.08.
- Node ids are site ids or IATA codes.
- Store the achieved MIP gap.
- The greedy baseline has one large refinery at the centroid. That is 1 kt over capacity at 16%, and the centroid is not a candidate site, so it needs a resolved rule and coordinates the map can draw.
- Do not hardcode refinery count, and the UI will not either.

**Orchestrator:** approve Next 16 or overrule to 14.2.35, and log it. The project folder is not a git repo yet, which Vercel Git deploys and the submission both need.

## Build order

| By | Done |
|---|---|
| 12:15 | Scaffold, `Bundle` type, hand-made fixture, land layer. UI work does not wait on the solver |
| 12:30 | Level 4 builds from the fixture |
| 13:15 | Base case from Supabase on localhost, cost panel, failure band |
| 14:00 | Disrupt, stepper, robustness, trace |
| 14:30 | Vercel live, checked in a private window, `/fallback` rebuilt on final data |

## Q4. Cut order if behind at 14:00

1. FastAPI live button
2. CARTO tile toggle
3. Truck trip counts
4. Facility click detail (keep arc trace)
5. Keyboard shortcuts and URL state
6. Runtime Supabase read: go snapshot-only and label it so

**Never cut:** the cost numbers, baseline comparison, provenance badge, failure band, disrupt, robustness, Level 4.
