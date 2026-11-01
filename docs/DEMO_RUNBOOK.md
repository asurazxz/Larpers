# Demo runbook (Jun Sheng, web and demo)

Pitch at about 15:30 SGT. The words come from `docs/PITCH.md`; this sheet covers the clicks, the timing and what to do if something breaks.

**Word rules:** say "solved" or "stored", and say "live" only for a solve that really runs on this laptop. Say "Optimal" only at gap 0; otherwise say "best found, gap X%". A stored run is always called stored. Read numbers off the screen and never quote them from memory.

**Cut before going on stage** (PITCH rule: cut any placeholder that is still unfilled):
- The 1:15-1:35 beat, "earlier assumptions". `web/data/bundle.json` has no `earlier_assumptions` run; its runs are `base`, `baseline`, `yield_16`, `h5`, `h10` and `no_refinery_KAL_SUP_28`.
- The stress-test sentence in the 1:35 beat. The bundle has no `stress` block, and `docs/ASSUMPTIONS.md` still reads TBD.

## T-10 min checklist (about 15:20)

- [ ] Close heavy apps and stop every build, dev server or other solve. A live solve takes about 83-85 s against a 90 s limit, and it hit that limit once today while a build was running. Plug in the charger and turn notifications off.
- [ ] Git Bash, from the repo root, once: `.venv/Scripts/python data/prepare.py`
- [ ] Terminal A (web): `python -m http.server 3000 --bind 127.0.0.1 --directory web/out`
- [ ] Terminal B (API). This command loads only `GEMINI_API_KEY` from `.env` and does not print it:
  `GEMINI_API_KEY="$(.venv/Scripts/python -c "from dotenv import get_key; print(get_key('.env','GEMINI_API_KEY') or '', end='')")" .venv/Scripts/python -m uvicorn api.main:app --host 127.0.0.1 --port 8000`
- [ ] `curl -s http://127.0.0.1:8000/api/health` should show `ok: true`. If `source` is `fixture`, the real solver did not load, so restart the API.
- [ ] Open **http://localhost:3000** in the browser, not 127.0.0.1, because CORS only allows localhost:3000. Click **Open the planner**.
- [ ] The header should read **"solver online"** next to the **STORED RUN** badge, and the Scenario panel should show **Run** and "r = 1, limit 90 s".
- [ ] Prefill the organisers' scenario. With the stored base on screen, click **Reset to displayed run**, then check: PNK, PKN, BPN and TRK at 300 kt each, yield 20%, road factor 1.3, horizon 1, collection optional, capacity basis biomass input, and no excluded sites. Do not press Run yet.
- [ ] Open a second tab with `fallback/index.html` (double-click the file). It works offline, shows stored runs and needs no login.
- [ ] A teammate's laptop has https://larpers-three.vercel.app open. It shows stored runs only.
- [ ] Optional, only if you finish before 15:22: run one rehearsal solve to prove the solver and Gemini end to end. Then reload the page (F5) to get back to the stored base.

## On stage: clicks against the PITCH beats

**The problem:** the live solve takes about 85 s, but its beat is 35 s long. **The fix:** press Run at 0:45 and talk over the stored screen while it solves. The stored base stays on screen and stays labelled stored until the live result replaces it.

| Time | Beat (PITCH) | Click | Say / point at |
|---|---|---|---|
| 0:00-0:20 | User and decision | None. The stored base is on screen. | Say the PITCH line, then point at the **STORED RUN** badge. |
| 0:20-0:45 | What we built | None. | Say the PITCH line. Point at the map and at **Audit PASSED** in the summary card. |
| **0:45** | Result and baseline | **Click Run.** A spinner shows "Solving and running the baseline… N s". | "I've just started a live solve of the organisers' scenario on this laptop. It takes about 85 seconds, so we'll come back to it." Then give the baseline lines, reading total, status and **Saving vs greedy baseline** from the stored base card. Keep the split-flow caveat. |
| 1:15-1:35 | (earlier assumptions, cut) | **Click any arc on the map.** The Trace panel shows **PASS**. | "Every number is recomputable. The browser recomputes this arc's distance and cost from the cost table: PASS." |
| 1:35-2:10 | Where it fails: Bulungan (moved up) | Point at the **Where this fails** band, row 1, N. Kalimantan. Click **trace** beside a site that has flow. **Press Esc** to close the trace before the result lands. | The PITCH Bulungan lines: either served or skipped (the band shows which), the Tarakan barge, and what is not modelled. |
| ~2:10 | Live result lands | None. The screen updates by itself. | "That was a live solve, just now." Then read off the screen: the **LIVE SOLVE** badge, **New run ID … in N s**, the status ("best found, gap X%"), **Audit PASSED**, **Saving vs greedy baseline**. Then the **What this run shows** card: "Gemini explains it; every number in it is checked against this run, and the solver made every decision." |
| 2:40-3:00 | What is ours and what is next | None. | The PITCH closing. |

If a judge asks for a run like today's: "In a run today: best found, gap 0.77%, about $895M a year, 6 large refineries, 800 kt of biomass stranded, with the two remote North Kalimantan sites skipped, audit passed." Say it as a past run, never as a fixed result. The live run will differ.

If the result has not landed by 2:20, keep talking. Run allows 150 s in the browser, but the solver stops at 90 s. Do not press Cancel or Run again.

## Failure playbook

| Symptom | Say | Click |
|---|---|---|
| "Could not find a feasible network within 90 s" | "It hit its 90-second limit on this laptop and says so plainly. A time limit proves nothing about feasibility. Here is the same scenario, solved earlier and stored." | Nothing. The stored base stays on screen, labelled stored. Do not re-run on stage; a second attempt costs another 90 s. |
| Badge reads **SOLVER OFFLINE** | PITCH fallback line: "The laptop solver is not up, so what you see is stored, and the badge says stored. The command-line solve still runs on any input you name." | On stage: nothing; continue on stored runs. Before the pitch: restart Terminal B; the badge returns to "solver online" on the next health check. |
| The explanation card shows "unavailable" or "withheld", or Gemini is busy | "The explanation is optional. Every number above comes from the solver and the audit, not the model. When a number can't be verified, the text is held back." | Nothing. This is a muted reason, not an error. |
| The map doesn't render (stuck on "Loading map…" or blank) | "The cost card and the failure band carry the numbers." | F5. If it is still blank, switch to the `fallback/index.html` tab and say "stored". |
| Wifi dies | "We're offline, so this is stored and labelled stored." | The web and the solver both run on this laptop, so Run may still work, but the explanation will not. If anything errors, switch to the `fallback/index.html` tab. |
| The laptop dies | "The public build shows stored runs only. The solver ran on the laptop that just died." Never say "live". | On the teammate's laptop, open https://larpers-three.vercel.app → **Open the planner**. |

## Three likely judge questions

**"Where does this fail?"** At the two North Kalimantan sites near Tarakan (KAL_SUP_18 and KAL_SUP_70), which are more than 300 km from any other supply site, so the solver either pays a lot to serve them or leaves them uncollected. Tarakan's barge is priced at the organisers' truck rate. "Optimal" holds only among our refinery shortlist and under our 214 km haul limit, and moisture, seasonality and financing cost are not modelled.

**"How do you know the numbers are right?"** A separate audit, which never imports the model, recomputes every result, and its verdict sits next to the total. Any arc can be traced in the browser from straight-line km × road factor × the PDF/update rate. We also report the real MIP gap instead of claiming optimality.

**"Why trust the AI explanation?"** Gemini decides nothing. It sees only a list of facts built from the finished run and must cite them, and the API checks every number it writes against that list. If any number fails the check, the explanation is withheld rather than shown.
