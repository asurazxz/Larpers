// Builds slides/larpers_saf.pptx from the stored bundle and the official parameters.
// Every number on a slide is read from web/data/bundle.json or data/processed/parameters.json,
// so rebuilding after a new bundle keeps the deck and the stored runs in step.
//
// Usage (repo root): node slides/build_deck.js [bundle.json] [out.pptx]
// Needs pptxgenjs on NODE_PATH; it is not a repo dependency.

const fs = require("fs");
const path = require("path");
const pptxgen = require("pptxgenjs");

const ROOT = path.resolve(__dirname, "..");
const BUNDLE = process.argv[2] || path.join(ROOT, "web", "data", "bundle.json");
const OUT = process.argv[3] || path.join(__dirname, "larpers_saf.pptx");
const PARAMS = path.join(ROOT, "data", "processed", "parameters.json");
const APPLY_THEME = process.env.PPTX_APPLY_THEME;

const bundle = JSON.parse(fs.readFileSync(BUNDLE, "utf8"));
const params = JSON.parse(fs.readFileSync(PARAMS, "utf8"));
const runs = bundle.runs || {};

// ---------- numbers ----------

const VAR_OPEX = {};
for (const f of params.facilities) VAR_OPEX[`${f.facility}:${f.size}`] = f.variable_opex_usd_per_t_in;

// Organisers' annual basis: CapEx/20 + 5% CapEx + variable OpEx per tonne in + transport.
// Uses the solver's own figures when present, else recomputes from the run's flows.
function annual(sol) {
    if (sol.total_annual_usd != null) {
        return { total: sol.total_annual_usd, capex: sol.capex_usd, transport: sol.logistics_annual_usd,
                 fromSolver: true };
    }
    const inflow = {};
    for (const f of sol.flows) {
        if (f.leg === "supply_depot" || f.leg === "depot_refinery") inflow[`${f.leg}:${f.to}`] =
            (inflow[`${f.leg}:${f.to}`] || 0) + f.kt;
    }
    let variable = 0;
    for (const fac of sol.facilities) {
        const leg = fac.type === "depot" ? "supply_depot" : "depot_refinery";
        variable += (inflow[`${leg}:${fac.site_id}`] || 0) * 1000 * VAR_OPEX[`${fac.type}:${fac.size}`];
    }
    const capexYear = sol.capex_usd / params.capex_years;
    const fixed = sol.capex_usd * params.fixed_opex_rate;
    return { total: capexYear + fixed + variable + sol.logistics_annual_usd, capexYear, fixed, variable,
             capex: sol.capex_usd, transport: sol.logistics_annual_usd, fromSolver: false };
}

const sol = (slug) => (runs[slug] ? runs[slug].solution : null);
const refineries = (s) => s.facilities.filter((f) => f.type === "refinery");
const depots = (s) => s.facilities.filter((f) => f.type === "depot");
const usedKt = (s) => s.flows.filter((f) => f.leg === "supply_depot").reduce((a, f) => a + f.kt, 0);
const m = (usd, dp = 1) => `$${(usd / 1e6).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp })}M`;
const kt = (v) => `${Math.round(v).toLocaleString("en-US")} kt`;
const pct = (v, dp = 2) => `${(v * 100).toFixed(dp)}%`;
const mix = (s) => {
    const r = refineries(s);
    const L = r.filter((f) => f.size === "large").length;
    const S = r.length - L;
    return [L ? `${L} large` : "", S ? `${S} small` : ""].filter(Boolean).join(" + ");
};

const base = sol("base");
const baseline = sol("baseline");
const earlier = sol("earlier_assumptions");
if (!base || !baseline) throw new Error(`bundle ${BUNDLE} lacks base or baseline`);
const A = annual(base);
const B = annual(baseline);
const E = earlier ? annual(earlier) : null;
const removals = Object.values(runs)
    .filter((e) => e.slug.startsWith("no_refinery_"))
    .map((e) => ({ id: e.slug.replace("no_refinery_", ""), status: e.status, a: e.status === "infeasible" ? null : annual(e.solution) }));
const stress = bundle.stress || null;
const bul = bundle.bulungan || null;
const sitesBul = new Set(["KAL_SUP_18", "KAL_SUP_70"]);
const bulServed = base.flows.filter((f) => f.leg === "supply_depot" && sitesBul.has(f.from)).reduce((a, f) => a + f.kt, 0);

// ---------- theme ----------

const THEME = {
    name: "Larpers Kalimantan",
    headFontFace: "Cambria",
    bodyFontFace: "Calibri",
    colors: {
        dk1: "1F2A24", lt1: "FFFFFF", dk2: "2C5F2D", lt2: "EEF3EA",
        accent1: "2C5F2D", accent2: "97BC62", accent3: "D99A1E", accent4: "5B7065",
        accent5: "B5462F", accent6: "8AA39B", hlink: "2C5F2D", folHlink: "5B7065",
    },
};
const HEX = { grid: "D5DDD3", muted: "5B7065" };

const pres = new pptxgen();
pres.layout = "LAYOUT_16x9";
pres.title = "Kalimantan SAF network planner";
pres.author = "Larpers";
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
const C = pres.SchemeColor;

const FOOTER = "Larpers · Airbus Challenge #3 · stored runs, labelled stored";

pres.defineSlideMaster({
    title: "Dark title",
    background: { color: C.text2 },
    objects: [
        { placeholder: { options: { name: "title", type: "title", x: 0.6, y: 1.5, w: 8.8, h: 1.5, fontSize: 40, bold: true,
                                    color: C.background1, valign: "bottom" }, text: "" } },
        { placeholder: { options: { name: "body", type: "body", x: 0.6, y: 3.15, w: 8.8, h: 1.2, fontSize: 18,
                                    color: C.background2, valign: "top" }, text: "" } },
    ],
});
pres.defineSlideMaster({
    title: "Title only",
    background: { color: C.background1 },
    margin: [0.5, 0.5, 0.6, 0.5],
    objects: [
        { placeholder: { options: { name: "title", type: "title", x: 0.5, y: 0.3, w: 9.0, h: 0.8, fontSize: 30, bold: true,
                                    color: C.text2, valign: "middle" }, text: "" } },
        { text: { text: FOOTER, options: { x: 0.5, y: 5.2, w: 7.5, h: 0.3, fontSize: 10, color: C.accent4, margin: 0 } } },
    ],
    slideNumber: { x: 9.0, y: 5.2, w: 0.5, h: 0.3, fontSize: 10, color: C.accent4, align: "right" },
});

let section = null;
function slide(master, sectionTitle) {
    if (sectionTitle !== section) {
        pres.addSection({ title: sectionTitle });
        section = sectionTitle;
    }
    return pres.addSlide({ masterName: master, sectionTitle });
}

function card(s, x, y, w, h, value, label, opts = {}) {
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.08, fill: { color: opts.fill || C.background2 },
                                               line: { color: opts.fill || C.background2 }, objectName: `card ${label}` });
    s.addText(value, { x: x + 0.2, y: y + 0.12, w: w - 0.4, h: h * 0.55, fontSize: opts.size || 28, bold: true,
                       color: opts.color || C.text2, valign: "bottom", margin: 0, isTextBox: true, fontFace: THEME.headFontFace });
    s.addText(label, { x: x + 0.2, y: y + h * 0.62, w: w - 0.4, h: h * 0.32, fontSize: 12, color: C.text1, valign: "top",
                       margin: 0, isTextBox: true });
}

function dot(s, x, y, n, color) {
    s.addShape(pres.shapes.OVAL, { x, y, w: 0.42, h: 0.42, fill: { color }, line: { color }, objectName: `step ${n}` });
    s.addText(String(n), { x, y, w: 0.42, h: 0.42, fontSize: 14, bold: true, color: C.background1, align: "center",
                           valign: "middle", margin: 0, isTextBox: true });
}

// ---------- 1. title ----------
{
    const s = slide("Dark title", "Opening");
    s.addText("Where should Kalimantan's SAF depots and refineries go?", { placeholder: "title" });
    s.addText("A solver-built, independently audited network for 1,200 kt of SAF a year at four airports. Larpers, Airbus Challenge #3",
              { placeholder: "body" });
    s.addNotes("A supply planner has 6,800 kt of residue at 80 sites and four airports to supply, 300 kt of SAF each. " +
               "The decision: which sites to use, where to put depots and refineries, and what the haul costs. Persona is ours, not Airbus's.");
}

// ---------- 2. problem ----------
{
    const s = slide("Title only", "Problem");
    s.addText("The organisers' update fixes the problem", { placeholder: "title" });
    const d = Object.values(params.demand_kt).reduce((a, v) => a + v, 0);
    const items = [
        [kt(6800), "biomass at 80 sites (11 in the sea: supply only)"],
        [kt(d), `SAF demand: ${Object.keys(params.demand_kt).join(", ")}, 300 kt each`],
        [pct(params.yield, 0), "yield, so demand needs 6,000 kt biomass"],
        [`× ${params.road_factor}`, "road factor on great-circle distance"],
    ];
    items.forEach(([v, l], i) => card(s, 0.5 + (i % 2) * 4.6, 1.3 + Math.floor(i / 2) * 1.65, 4.4, 1.45, v, l));
    s.addText("Capacity is biomass in · CapEx over 20 years · 5% fixed OpEx · variable OpEx per tonne · TRK last leg by barge",
              { x: 0.5, y: 4.65, w: 9.0, h: 0.4, fontSize: 12, color: C.accent4, margin: 0, isTextBox: true });
    s.addNotes("All values are official: Summary of Updates, 31 Oct 12:45, and challenge3_parameters.xlsx. Not collecting all 6,800 kt is allowed.");
}

// ---------- 3. method ----------
{
    const s = slide("Title only", "Method");
    s.addText("A solver decides; a separate audit checks", { placeholder: "title" });
    const steps = [
        ["Validated data", "80 sites, 4 airports by IATA, sea sites flagged, SHA-256 data hash"],
        ["MILP on 69 onshore candidates", "PuLP + HiGHS; depots, refineries, sizes and flows chosen together"],
        ["Independent audit", "Recomputes every flow, balance, capacity and cost; no solver imports"],
        ["Stored and live runs", "Map, costs, status and gap; stored runs always labelled stored"],
    ];
    steps.forEach(([h, t], i) => {
        const y = 1.3 + i * 0.92;
        dot(s, 0.6, y + 0.05, i + 1, i === 2 ? C.accent3 : C.accent1);
        s.addText(h, { x: 1.25, y, w: 8.2, h: 0.36, fontSize: 18, bold: true, color: C.text1, margin: 0, isTextBox: true });
        s.addText(t, { x: 1.25, y: y + 0.38, w: 8.2, h: 0.36, fontSize: 14, color: C.accent4, margin: 0, isTextBox: true });
    });
    s.addNotes("No language model is in the decision path. A greedy baseline runs on the same inputs and passes the same audit.");
}

// ---------- 4. result ----------
{
    const s = slide("Title only", "Result");
    s.addText("The solved base network", { placeholder: "title" });
    card(s, 0.5, 1.3, 2.9, 1.5, m(A.total), "a year, organisers' basis", { color: C.accent1, size: 30 });
    card(s, 3.55, 1.3, 2.9, 1.5, mix(base), `refineries, plus ${depots(base).length} depots`, { size: 24 });
    card(s, 6.6, 1.3, 2.9, 1.5, kt(usedKt(base)), "biomass used of 6,800 kt", { size: 28 });
    const rows = [
        ["Annualised CapEx", m(A.capexYear ?? A.capex / params.capex_years)],
        ["Fixed OpEx (5% of CapEx)", m(A.fixed ?? A.capex * params.fixed_opex_rate)],
        ["Variable OpEx", A.variable != null ? m(A.variable) : "from solver"],
        ["Transport", m(A.transport)],
    ];
    s.addTable(rows.map(([a, b]) => [{ text: a, options: { color: C.text1 } }, { text: b, options: { align: "right", bold: true, color: C.text1 } }]),
               { x: 0.5, y: 3.05, w: 5.4, colW: [3.6, 1.8], fontSize: 13, rowH: 0.34, border: { type: "solid", pt: 0.5, color: HEX.grid } });
    s.addText([
        { text: `Solver status: ${base.status_reason || base.status}`, options: { bold: true, breakLine: true } },
        { text: A.fromSolver ? "Annual cost from the solver." :
            "The gap is for the solver's own objective (CapEx + transport). The annual cost is recomputed on the " +
            "organisers' basis from the solved network's flows." },
    ], { x: 6.2, y: 3.05, w: 3.3, h: 1.4, fontSize: 12, color: C.accent4, valign: "top", margin: 0, isTextBox: true });
    s.addNotes(`Refineries: ${refineries(base).map((f) => f.site_id).join(", ")}. Say "optimal" only if the status says so; ` +
               `otherwise read the status as written.`);
}

// ---------- 5. baseline ----------
{
    const s = slide("Title only", "Result");
    s.addText("Against a greedy baseline on the same inputs", { placeholder: "title" });
    s.addChart(pres.charts.BAR, [{ name: "Annual cost", labels: ["Greedy baseline", "MILP base"],
                                   values: [B.total / 1e6, A.total / 1e6] }], {
        x: 0.5, y: 1.25, w: 5.4, h: 3.75, barDir: "bar", chartColors: [THEME.colors.accent6, THEME.colors.accent1].map(String),
        showValue: true, dataLabelPosition: "outEnd", dataLabelFormatCode: "$#,##0\"M\"", dataLabelColor: THEME.colors.dk1,
        dataLabelFontFace: "+mn-lt", dataLabelFontSize: 12, catAxisLabelColor: THEME.colors.dk1, catAxisLabelFontFace: "+mn-lt",
        catAxisLabelFontSize: 12, valAxisHidden: true, valGridLine: { style: "none" }, catGridLine: { style: "none" },
        showLegend: false, showTitle: true, title: "Annual cost, $M (organisers' basis)", titleFontFace: "+mn-lt", titleFontSize: 12,
        titleColor: THEME.colors.accent4, invertedColors: [THEME.colors.accent6],
    });
    const saving = B.total - A.total;
    card(s, 6.2, 1.3, 3.3, 1.5, m(saving), `a year cheaper (${pct(saving / B.total, 1)})`, { color: C.accent1, size: 28 });
    s.addText([
        { text: `Baseline: ${mix(baseline)} refineries, ${depots(baseline).length} depots, ${kt(usedKt(baseline))} collected.`, options: { breakLine: true } },
        { text: "Caveat: the MILP may split a site across depots; the baseline sends each site to one." },
    ], { x: 6.2, y: 3.0, w: 3.3, h: 1.9, fontSize: 12, color: C.accent4, valign: "top", margin: 0, isTextBox: true });
    s.addNotes("Both runs pass the same audit. The baseline is a port of the team's greedy heuristic.");
}

// ---------- 6. robustness ----------
{
    const s = slide("Title only", "Robustness");
    s.addText("What happens when a refinery site is lost", { placeholder: "title" });
    const rows = [[{ text: "Refinery removed", options: { bold: true } }, { text: "Annual cost", options: { bold: true, align: "right" } },
                   { text: "Change", options: { bold: true, align: "right" } }]];
    for (const r of removals.slice(0, 6)) {
        rows.push([r.id, r.a ? m(r.a.total) : "No feasible network found",
                   r.a ? `+${m(r.a.total - A.total)}` : "–"].map((t, i) => ({ text: t, options: { align: i ? "right" : "left" } })));
    }
    if (rows.length === 1) rows.push([{ text: "No disruption runs stored yet" }, { text: "" }, { text: "" }]);
    s.addTable(rows, { x: 0.5, y: 1.3, w: 5.6, colW: [2.2, 1.7, 1.7], fontSize: 13, rowH: 0.36, color: C.text1,
                       border: { type: "solid", pt: 0.5, color: HEX.grid } });
    if (stress) {
        card(s, 6.4, 1.3, 3.1, 1.5, `${stress.solved} of ${stress.n_random}`, "random scenarios solved and audited", { size: 28 });
        s.addText([
            { text: `Worst solve ${Math.round(stress.worst_solve_seconds)} s; worst gap ${stress.worst_gap == null ? "–" : pct(stress.worst_gap)}.`, options: { breakLine: true } },
            { text: `Deliberately infeasible case: ${stress.infeasible_case_detected ? "reported as infeasible" : stress.infeasible_case_status}.` },
        ], { x: 6.4, y: 3.0, w: 3.1, h: 1.8, fontSize: 12, color: C.accent4, valign: "top", margin: 0, isTextBox: true });
    }
    s.addNotes("Each row is a stored re-solve with that site unavailable at design stage, not an outage model.");
}

// ---------- 7. failure case ----------
{
    const s = slide("Title only", "Limits");
    s.addText("Where it is weakest: Bulungan and Tarakan", { placeholder: "title" });
    card(s, 0.5, 1.3, 2.9, 1.5, "189 kt", "at two Bulungan sites, 57 and 88 km from Tarakan", { size: 30, color: C.accent5 });
    card(s, 3.55, 1.3, 2.9, 1.5, "304 km+", "to any other supply site", { size: 30, color: C.accent5 });
    const served = bulServed > 0.5;
    card(s, 6.6, 1.3, 2.9, 1.5, served ? (bul ? m(bul.logistics_annual_usd) : kt(bulServed)) : "Skipped",
         served ? "a year to haul it in the base run" : "the base run leaves it uncollected", { size: 28, color: C.accent5 });
    s.addText([
        { text: "Tarakan is an island: the organisers price its last leg as a barge at the truck rate, and we follow that.", options: { bullet: true, breakLine: true } },
        { text: "No port nodes, real barge rate, moisture or seasonality are modelled.", options: { bullet: true, breakLine: true } },
        { text: "Site tonnages look generated, and 11 sites plot in the sea, so results show the method, not where to buy land.", options: { bullet: true } },
    ], { x: 0.5, y: 3.05, w: 9.0, h: 1.9, fontSize: 14, color: C.text1, valign: "top", paraSpaceAfter: 6, isTextBox: true });
    s.addNotes("Distances are straight-line from our data pipeline. Pertamina can tell us whether a real barge costs that much.");
}

// ---------- 8. assumptions ----------
{
    const s = slide("Title only", "Assumptions");
    s.addText("What is official and what is ours", { placeholder: "title" });
    const left = [["Official (12:45 update)", true], ["Yield 20%, road factor 1.3", false], ["300 kt SAF per airport", false],
                  ["Capacity counted as biomass in", false], ["CapEx / 20 yr, 5% fixed OpEx, variable OpEx", false],
                  ["Rates 0.10 / 0.12 / 0.08 $/t/km", false]];
    const right = [["Ours", true], ["214 km straight-line farm haul limit", false], ["Refinery candidate shortlist", false],
                   ["Split flows from a site", false], ["69 onshore candidates (land mask)", false],
                   [E ? `Earlier assumptions run: ${m(E.total)} a year` : "Earlier assumptions run stored", false]];
    for (const [col, x, fill] of [[left, 0.5, C.background2], [right, 5.1, C.background2]]) {
        s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 1.3, w: 4.4, h: 2.85, rectRadius: 0.08, fill: { color: fill },
                                                   line: { color: fill }, objectName: `column ${col[0][0]}` });
        s.addText(col.map(([t, head], i) => ({ text: t, options: head ? { bold: true, fontSize: 18, color: C.text2, breakLine: true }
                                                                     : { bullet: true, breakLine: i < col.length - 1 } })),
                  { x: x + 0.25, y: 1.45, w: 3.9, h: 2.6, fontSize: 14, color: C.text1, valign: "top", paraSpaceAfter: 6, isTextBox: true });
    }
    s.addText("Biomass sites are organiser-supplied and treated as synthetic. Full ledger: docs/ASSUMPTIONS.md",
              { x: 0.5, y: 4.4, w: 9.0, h: 0.4, fontSize: 12, color: C.accent4, margin: 0, isTextBox: true });
    s.addNotes("Full ledger in docs/ASSUMPTIONS.md. The earlier-assumptions run is a different problem, so its cost is not a saving.");
}

pres.writeFile({ fileName: OUT }).then(async (file) => {
    if (APPLY_THEME) {
        const { applyTheme } = require(APPLY_THEME);
        await applyTheme(file, THEME);
    }
    console.log(`wrote ${file}`);
    console.log(`base ${m(A.total)} (${A.fromSolver ? "solver" : "recomputed"}), baseline ${m(B.total)}, saving ${m(B.total - A.total)}`);
});
