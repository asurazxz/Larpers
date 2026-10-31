# SAF Domain Expert proposal (brief Section 5.4)

Status: 11:40 SGT. Proxy figures come from a rough script over `data/raw/`: no depots, all biomass at 0.12 USD/t/km, circuity 1.4. They show orders of magnitude only. They are not MILP results and must not go on a slide.

## Headline calls

| # | Call | Value |
|---|---|---|
| 1 | Default yield | **0.15**, end to end, on dry-tonne biomass. 6,800 × 0.15 = 1,020 kt, 93.8% of one large refinery. Not 0.16 |
| 2 | Pitch line "16% is how the designer built the table" | **Drop it.** Unprovable and circular. Say "above 15.985% yield the table forces a second refinery" |
| 3 | Refinery capacity basis | **SAF output** by default, because of the PDF heading. Add one named scenario for biomass input ($5.07B floor) |
| 4 | Demand default | **Full production through the four airports**, labelled "gateway scenario". They cannot burn it (Q3) |
| 5 | Depot mass loss | **Base r = 1.00.** Add the parameter and run r = 0.79 and r = 0.47, holding end-to-end yield fixed |
| 6 | Airport split | **BPN 55.8, PNK 31.7, TRK 7.5, PKN 5.0**, using BPN 7.4M. Same pre-COVID era as the other three. Second-order for cost |
| 7 | New decision for the orchestrator | **Time basis.** The PDF gives no "per year" and no horizon. The proxy suggests this flips one refinery vs two (Section 6) |

---

## 1. The four profile questions

### Q1. Is 16% yield defensible for mixed palm residue?

Only with three qualifiers, and it is the wrong default.

- **Best source found:** CRL Energy (Williamson and McCurdy, 2009, for the NZ Parliamentary Commissioner for the Environment). Base case is 10,000 oven-dry t/day in, about 10,500 bbl/day of FT fuel out, and the report states an "84% reduction in mass", which implies about 0.16. The barrel figure gives about 0.13 at an assumed 0.8 t/m³. So **0.13 to 0.16 is total FT liquids per oven-dry tonne**. https://pce.parliament.nz/media/bgmkhiol/appendix-b.pdf (pp. 2, 12)
- **Qualifier 1, product:** that figure is all liquids. The same plant's kerosene cut is only 0.15 bbl per oven-dry tonne, about 0.02 t/t at 0.8 t/m³. The slate is diesel-heavy. We count all FT liquid as SAF and must say so. Hydrocracking would shift the slate, and Chireshe et al. 2025 report supplemental hydrogen raising SAF yield by up to 70%. https://ideas.repec.org/a/eee/rensus/v210y2025ics1364032124008839.html
- **Qualifier 2, basis:** dry only. Neither the PDF nor the CSV states a moisture basis. If the 6,800 kt is wet EFB at about 60% moisture, then 0.15 dry becomes 0.06 as-received: 408 kt, which fits **one small refinery**. Treat kt as dry tonnes and say so.
- **Qualifier 3, feedstock:** I found no EFB or palm-specific SAF yield. The PDF says "agricultural and forestry residues" and the CSV has no crop column. **"Palm residue" is our assumption, not a data fact.** Do not claim the 6,800 kt is palm on a slide.

Use 0.15. It sits inside the 0.13 to 0.16 band, is a number a judge can multiply in their head, and is off the cliff. 6.2% headroom is also more honest than a plant at 100% utilisation.

Sensitivity grid: **0.13, 0.15, 0.17**, plus two single runs:
- 0.16, to show the cliff.
- 0.06, to show the wet basis.

Keep 0.19 only as an unsourced stress value. Its cited source is wrong (Section 7).

### Q2. Should depots model mass loss?

Yes as a parameter, no in the base case. See Section 3.

### Q3. Which demand scenario should be the demo default?

Full production. See Section 3.

### Q4. The one slide nobody has thought of

**"One kilotonne, $480M."** A staircase of minimum refinery CapEx against yield, computed from the PDF table alone:

| Yield | SAF kt | Cheapest refinery set | CapEx |
|---|---|---|---|
| up to 7.35% | up to 500 | 1 small | $480M |
| 7.35% to 15.985% | 500 to 1,087 | 1 large | $765M |
| 15.985% to 23.34% | 1,087 to 1,587 | 1 large + 1 small | $1,245M |
| above 23.34% | above 1,587 | 2 large | $1,530M |

It turns the brief's error into our strongest honesty point, needs no solver to check, and tells the planner which number to measure first. Our 0.13 to 0.19 sweep crosses a $480M step at a value nobody has measured.

---

## 2. Section 4.1 assumptions: verdict per row

| Row | Verdict | Change and reason |
|---|---|---|
| Yield 0.16 | **Change to 0.15**, keep slider | Source is CRL Energy 2009. Both of the brief's evidence items fail (Section 7). Range 0.13 to 0.17 plus cliff and wet runs |
| Circuity 1.4 | **Endorse, keep slider** 1.2 to 2.0 | Sultana and Kumar verified: 1 to 3.16, theoretical 1.27 (Alberta). Ballou's 1.12 to 2.10 is not verified, so do not quote it. No Indonesia value found. Limit: Tarakan airport is on an island, so a road factor does not cover the final leg to TRK. Check on the map |
| Airport split | **Change** | Transposed in the brief. Use 55.8 / 31.7 / 7.5 / 5.0 (Section 5). Sensitivity: equal split. **Delete "mandate-only"**: none of the four airports is in the mandate, so that split is undefined |
| Total demand | **Endorse full production**, relabel | "Gateway scenario", 1,020 kt at y = 0.15. The 60,000 kL figure is a 2024 estimate and predates the two-airport scope |
| Depot capacity meaning | **Endorse: biomass throughput in** | PDF heading is "Production Capacity", which for a depot could mean output. Moot at r = 1. Floor is 46 small-equivalents, $103.5M |
| Refinery capacity meaning | **Endorse SAF output, unknowable, add input scenario** | Replace the circular evidence "1087 ≈ 6800×0.16" with the PDF heading (Section 4). Ask the challenge owner if reachable |
| OpEx | **Unknowable, keep unmodelled** | PDF objective names OpEx but gives no figures. Say so on the slide. Logistics is modelled separately. Do not invent a number |
| Candidate sites | **Endorse 80 sites, add 4 airports as refinery candidates** | PDF asks for "optimal coordinates" and does not restrict them. BPN is the one with a real case: Pertamina's Balikpapan refinery upgrade was inaugurated in January 2026 at 360 kbpd. https://business-indonesia.org/news/prabowo-inaugurates-usd-7-4-bn-balikpapan-refinery-upgrade |

---

## 3. Brief Section 10, questions 3 and 4

### Q3. Demand: full production as default

- **Why:** the PDF gives 6,800 kt of feedstock, asks us to meet demand at four airports, and gives no demand figure. Full production is the only reading that uses the whole table.
- **Why not mandate-scaled:** the 1% mandate covers CGK and DPS only, so demand at our four airports is **zero**, not "tiny". There is no network to design.
- **Say this on stage:** 1,020 kt is about 1.31M kL, roughly **22× the 60,000 kL** national estimate (47 kt at an assumed 0.78 kg/L).
- **Say this as a limit:** 1,020 kt is probably 4 to 8× all the jet fuel these four airports use. That is my rough estimate: 5 to 7M enplanements × 25 to 40 kg, or 135 to 270 kt. **It is not sourced, so it is not for a slide as fact.** At the 50% FT blend limit (IATA, Section 7), local use would absorb only about 7 to 13% of output.
- **Consequence:** the airports act as delivery gateways and most SAF would leave by sea. We have no port nodes. Name this as a stated failure case and put port nodes in `docs/NEXT.md`.
- **No intermediate scenario.** It adds runs and answers nothing the sentence above does not.

### Q4. Depot mass loss: parameterise, base r = 1.00

- **Why not in the base:** the moisture basis is unknown, and a judge cannot check any factor against the cost table.
- **Formulation, one constant and no new variables:**
  - Depot: `outflow_d = r × inflow_d`, with capacity on inflow.
  - Refinery: `SAF_out = (y / r) × inflow_R`.
  - Result: end-to-end SAF stays `6,800 × y`, so r moves logistics only and does not touch the yield cliff. Without this rescale, r would silently cut yield.
- **Scenarios:**
  - **r = 0.79:** biomass preparation mass efficiency on a dry basis, CRL Energy Table 2, p. 9. That step sits inside the plant in the source and we are moving it to the depot. Label it as such.
  - **r = 0.47:** recomputable, wet EFB dried from 60% to 15% moisture (0.40 / 0.85). Moisture of about 60% is supported by an OCL journal paper, seen via search summary only. https://www.ocl-journal.org/articles/ocl/pdf/2026/01/ocl250017.pdf
- **Effect, proxy:** the depot→refinery leg is about $330M, so these cut roughly $70M and $175M. This matters to the second-refinery decision.

---

## 4. 6,800 × 0.16 = 1,088 kt against 1,087 kt

**Does "Production Capacity" support reading refinery capacity as SAF output?** Yes, but it is not conclusive. "Production" of a refinery naturally means product out. The PDF column is literally "Production Capacity" with "kilotonne", and it has no "/yr". The same column also covers depots, which produce no fuel, so the heading is not precise.

**What this does to "the designer built the table from 16%":** it falls from "almost certainly" to "cannot be determined".

- **New finding, the table has another explanation.** The refinery row fits the classic six-tenths scaling rule: ln(765/480) / ln(1087/500) = **0.6002**. So 480 × (1087/500)^0.6 = 764.9, and 500 × (765/480)^(1/0.6) = 1,087.3, which rounds to exactly 1,087. No yield is needed to reach that number.
- **The 16% story is not dead.** 1,087 / 0.16 = 6,794, which rounds to 6,800, so 6,800 may be the rounded figure. A near-match this close to a round yield is still suspicious.
- **The data cannot separate these.** The defensible claim is that the table is consistent with a yield near 16%.
- **It is circular either way.** A match to the designer's table says nothing about real-world yield, so it cannot be "evidence for the yield assumption".

**Default.** Options compared:

| Option | SAF kt | Refinery CapEx | Verdict |
|---|---|---|---|
| 0.16 | 1,088 | $1,245M | **Reject.** Solver buys a $480M plant to place 1 kt. An artefact, unless two plants win on logistics anyway |
| 0.16, strand 6.25 kt | 1,087 | $765M | Reject. Smallest site is 22.84 kt, so single assignment strands a whole site |
| 0.15985 | 1,087 | $765M | Fallback if the orchestrator wants table fidelity. Label "table-implied ceiling". 100% utilisation, no margin, false precision |
| **0.15** | **1,020** | **$765M** | **Recommended.** Inside the source band, 6.2% headroom, not on the cliff |

**Framing:** "15.985% is a threshold the table implies, not a yield anyone measured. We run 15% and show what happens above the threshold."

**The biomass-input reading.** Capacity as biomass in needs 6,800 / 1,087 = 6.26 plants. Cheapest cover is **6 large + 1 small = $5.07B** (7 large = $5.355B), about 6.6× the output-reading CapEx.

Do not dismiss it: it is the more realistic number.
- Output reading: $765M / 1,087 kt = **$704 per annual tonne**. That is below a HEFA plant reported at about $500M for 300 kt, or $1,667/t (single source, Section 7), and gasification-FT should cost more than HEFA.
- Input reading at y = 0.15: 163 kt SAF per large plant, or **about $4,700 per annual tonne**.
- A single plant taking 7,247 kt of biomass a year (the 1,087 kt limit at y = 0.15) is about 19,900 t/day, the top of CRL's 2,000 to 20,000 oven-dry t/day working range. Today's 6,800 kt is about 18,600 t/day.

So the heading favours output and real-world cost favours input. **Per CLAUDE.md the PDF wins, so output is the default.** Run input as one named scenario and put it on the assumptions slide. If an Airbus mentor is reachable, ask two questions: is refinery capacity SAF out or biomass in, and is 6,800 kt per year?

---

## 5. Airport split

**Use BPN 7.4M: BPN 55.8, PNK 31.7, TRK 7.5, PKN 5.0** (total 13.26M).

- The figures are about era, not accuracy. PNK 4.2M is a **2018** figure (detik, 8 Feb 2019, "tahun lalu"). https://finance.detik.com/infrastruktur/d-4419807/jemaah-haji-dan-umrah-bakal-bisa-terbang-dari-bandara-supadio
- BPN 4.7M could not be sourced. Pairing a recent BPN with a 2018 PNK mixes eras and understates BPN.
- Recent BPN is 5.1M for 2023 and 4,097,985 for Jan to Sep 2024, or about 5.5M annualised (my estimate). https://kaltim.antaranews.com/berita/225445/bandara-balikpapan-layani-4-juta-penumpang-hingga-september-2024
- I could not find recent full-year figures for PNK, TRK or PKN, so a consistent recent set is not available. The same-era set is the only one that is internally consistent.
- Slide label: "pre-COVID passenger share, all four airports same era, proxy for fuel uplift". Year mapping in the Wikipedia table is unclear for TRK, PKN and BPN, so say "pre-COVID", not a specific year.

**Is pax share the right driver?** Not really, but keep it.
- Fuel demand follows departures × sector fuel, and pax share misses aircraft type, sector length and transfer traffic. The right data is airport fuel uplift, which I could not find publicly. It is a data request for Pertamina.
- SAF also needs blending and certification, so a terminal is arguably the true delivery node, not an airport. Blending is covered by D7566 rules, but I did not confirm it must happen before the airport. Treat as a domain view.
- **It barely matters.** At full 1,087 kt, across six splits including the wrong brief split and equal, the best single refinery stays at **KAL_SUP_27** in every run. The SAF leg moves only $53.5M to $60.2M on about $390M of proxy logistics. The best two-refinery pair is also unchanged across the three splits tested.
- Do not spend build time here. Sensitivity: equal split only.

---

## 6. Decision needed: time basis (not in the brief)

The PDF says "6800kt" and "kilotonne" with no "/yr" and no horizon. The brief added "kt/yr", and its objective adds one-off CapEx to what is effectively one year of logistics.

Proxy at y = 0.15:

| | One refinery | Two refineries |
|---|---|---|
| Sites | KAL_SUP_27, Kotawaringin Barat | KAL_SUP_15, Ketapang (large) + KAL_SUP_10, Kutai Kartanegara (small) |
| Logistics per pass | about $388M | about $224M |
| Extra CapEx | | $480M |

- That is about **$164M saved per pass, repaying $480M in about 2.9 passes**.
- On a single pass the optimiser should pick one refinery. On any multi-year view it should pick two.
- This is the brief's open East Kalimantan question, and it turns on an unstated time basis.

**Recommend:** keep the literal PDF reading (CapEx + one pass) as the base, because it is checkable. Add a `horizon_years` multiplier on logistics with a sensitivity at 1, 5 and 20, undiscounted, and show the flip. OR to confirm with the real model.

---

## 7. Evidence pack fact-check

Anything marked NOT FOUND or WRONG must not go on a slide as fact. Where the brief's claim is partly right, each part has its own line.

| Claim | Verdict | Correct fact and source |
|---|---|---|
| Airbus/Pertamina MoU, Bali Air Show, Sept 2024 | **VERIFIED** | Announced at the show, reported 19 Sep 2024; one search summary gives 18 Sep. Scope: study of local feedstocks, logistics, commercial viability. It is a study, not a plant. https://www.safinvestor.com/?p=145963 |
| Boeing/Pertamina MoU, July 2026 | **VERIFIED** | Signed around 8 Jul 2026 at Indonesia Aero Summit. Non-binding. https://www.nst.com.my/amp/business/corporate/2026/07/1484051/indonesias-pertamina-boeing-sign-mou-sustainable-aviation-fuel |
| Boeing MoU "covering the same scope" | **WRONG** | Boeing's: feedstock sources, SAF technology, policy support. Airbus's: feedstock, logistics, commercial viability. They overlap, and only Airbus's covers logistics. Same NST source |
| "Competing", "before Boeing does" | **NOT FOUND** | Our framing. No source shows a race. Rubric asks for a credible user, so keep the planner and drop the race |
| 1% mandate, 2027, CGK and DPS only | **VERIFIED** | Transport Ministry official Sokhib Al Rokhman, reported 13 Jul 2026. No legal instrument named, so say "planned" or "ministry-stated". https://www.petromindo.com/news/article/indonesia-to-launch-1-saf-blend-on-international-flights-in-2027 |
| About 60,000 kL | **VERIFIED, with caveat** | Argus 2024 estimate for all international departures. Predates the two-airport scope, so do not present it as the CGK+DPS volume. https://www.argusmedia.com/en/news-and-insights/latest-market-news/2609725-indonesia-to-require-saf-for-flights-from-2027 |
| CET vol 125: ATJ 0.19 **t/t** | **WRONG** | Source says 0.19 t/**day** from 17.55 t/day of wet biomass, or **about 1.1%** (elsewhere 0.22 t, 1.25%). FT is 1.17 t/day, about 6.7%. Feedstock is Colombian market-square residue. Do not cite for 0.19. https://www.cetjournal.it/cet/26/125/096.pdf |
| RSC d4se00749b: FT about 0.13 | **NOT FOUND** | Paper exists: Ahire et al., Sustain. Energy Fuels 8:4602, 2024, forest residue FT, 90 Mg/day, $1.87/kg per search summary. RSC returned 403, so 0.13 is unconfirmed. https://pubs.rsc.org/en/content/articlelanding/2024/se/d4se00749b Cite CRL Energy instead |
| Ballou et al. 2002 citation | **VERIFIED** | Transportation Research Part A 36(9):843-848. https://trid.trb.org/view.aspx?id=726009 |
| Ballou range 1.12 to 2.10 | **NOT FOUND** | Table is paywalled. No Indonesia value seen |
| Sultana and Kumar 2014: 1 to 3.16, 1.27 | **VERIFIED** | Applied Energy 119:288-295, tortuosity factor, Alberta. https://ideas.repec.org/a/eee/appene/v119y2014icp288-295.html |
| Ng and Maravelias 2017 citation | **VERIFIED** | Renewable Energy 100:90-102, DOI 10.1016/j.renene.2016.05.009. https://ideas.repec.org/a/eee/renene/v100y2017icp90-102.html |
| Their "two simplifications" | **WRONG (annual), NOT FOUND (single assignment)** | Abstract-level sources describe a **multi-period** MILP with inventory and shipment planning, the opposite of "annual totals". Full text not read. Cite the paper for depot-and-refinery siting only. OR should not attribute either simplification to it. https://collaborate.princeton.edu/en/publications/design-of-biofuel-supply-chains-with-variable-regional-depot-and-/ |
| JATRA K-means paper exists, UCO and POME | **VERIFIED** | Dzikra, Kastaman, Januardi, JATRA 8(1), June 2026. https://jurnal.polibatam.ac.id/index.php/JATRA/article/view/13032 |
| "Not Kalimantan" / "only published work" | **WRONG** | JATRA recommends a **Central Kalimantan** facility, which is useful but on other feedstocks. Harahap et al. 2020 (BeWhere Indonesia) is spatially explicit optimisation of palm biorefineries on **Sumatra and Kalimantan**. https://ideas.repec.org/a/eee/appene/v278y2020ics0306261920312368.html |
| Novelty claim | **Change wording** | Say: "We could not find a SAF-specific depot-and-refinery MILP for Kalimantan with disruption re-planning." Harahap covers power, biodiesel and ethanol, not SAF. My search was short |
| Status quo "spreadsheets plus intuition" | **NOT FOUND** | Our assumption. Present as such |
| Airbus + IPB, up to 100 Mt/yr biomass | **VERIFIED** | Secondary source, 22 Aug 2025. Ignore the KPL report that gives 100 Mt as SAF output. https://www.bioenergy-news.com/news/airbus-eyes-indonesia-biomass-for-saf/ |
| SAF mainly from biomass by 2030 | **VERIFIED** | Same source, as an Airbus projection |
| "Because waste oils are capped" | **NOT FOUND** | Source wording: "output limitations due to competition with food supplies". Use that |
| "Every" SEA SAF plant is HEFA near Singapore/Johor | **WRONG** | Keppel/Aster ethanol-to-jet on Jurong Island: https://www.edb.gov.sg/en/about-edb/media-releases-publications/keppel-aster-to-build-saf-ethanol-to-jet-plant-on-jurong-island.html KBR, 100,000 tpy ETJ Singapore: https://hydrocarbonprocessing.com/news/2026/06/kbr-technology-selected-for-100-000-tpy-ethanol-to-jet-saf-plant-in-singapore/ KT Tech, 60,000 tpy North Sumatra: https://hydrocarbonprocessing.com/news/2026/04/kt-tech-awarded-early-engineering-works-contract-for-60-000-tpy-saf-plant-in-indonesia/ |
| Neste Singapore 1 Mt | **VERIFIED** | EDB: up to 1 Mt. https://www.edb.gov.sg/en/business-insights/insights/singapore-to-have-world-s-largest-sustainable-aviation-fuel-plant.html |
| Pengerang 650 kt | **VERIFIED, basis unclear** | Reported as annual capacity. "Feed" not confirmed. Start H2 2028. https://www.idnfinancials.com/news/58637/petronas-with-enilive-and-euglena-to-build-650-000-ton-bio-refinery |
| FatHopes Port Klang 300 kt | **VERIFIED, planned only** | HEFA. FID deferred to Q1 2027, start mid-2030. Not existing. https://www.argusmedia.com/news-and-insights/latest-market-news/2787896-malaysia-s-fathopes-defers-fid-on-biofuels-plant The $500M figure is single-source, so internal cross-check only |
| PLN "already pelletising" EFB in Sambas | **VERIFIED in part** | Oct 2023 MoU between PLN EPI and Elektrika Konstruksi Nusantara for the Bengkayang coal plant. Current operation not confirmed. Say "agreed in 2023". https://ekonomi.republika.co.id/berita/s2cama457/pln-manfaatkan-limbah-sawit-jadi-bahan-bakar-pltu |
| Central and West Kalimantan "lead" | **VERIFIED in part** | IJAS is the International Journal of Agriculture System 14(1), 2026. Lists Riau, Central and West Kalimantan as leading, order not confirmed. Say "among the leading provinces". https://pasca.unhas.ac.id/ojs/index.php/ijas/article/view/6720 |
| Pax: BPN about 7.4M, PNK 4.2M, TRK 1.0M, PKN 0.66M | **VERIFIED in values** | Wikipedia table holds these, years unclear for some. PNK is 2018. https://en.wikipedia.org/wiki/List_of_the_busiest_airports_in_Indonesia |
| BPN "recent about 4.7M" | **NOT FOUND** | 2023 was 5.1M |
| FT-SPK 50% blend limit (added) | **VERIFIED** | https://www.iata.org/contentassets/d13875e9ed784f75bac90f000760e998/saf-technical-certifications.pdf |
| Four airports are "international" | **NOT FOUND** except PNK | PNK lost status in 2024 and regained it under KM 30/2025. Use the PDF's names and do not assert status. https://m.antaranews.com/amp/berita/4878549/bandara-supadio-kembali-berstatus-internasional |

Not checked for lack of time: EFB gasification suitability, and whether Tarakan has any fixed road link.
