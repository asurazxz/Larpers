'use client';

// Solver Validation tab header: five status tiles plus gap, sensitivity and risk cards.
// Every figure comes from the displayed run or from stored bundle runs; nothing is interpolated.
import type { ReactNode } from 'react';
import type { Solution } from '../../lib/contract';
import { Card } from '../common/ui';
import { BASE_SLUG, bundle, getEntry, slugs, solutionOf } from '../../lib/bundle';
import { annualCost } from '../../lib/annual';
import { MISSING, isProvenOptimal, pct, statusLabel } from '../../lib/format';

const Icon = ({ children }: { children: ReactNode }) => (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{children}</svg>
);

function Tile({ icon, tone, label, value, sub, hl }: { icon: ReactNode; tone: string; label: string; value: ReactNode; sub?: ReactNode; hl?: string }) {
    return (
        <div className={`flex min-w-0 items-center gap-3 rounded-xl border p-3.5 shadow-sm ${hl ?? 'border-line bg-white'}`}>
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${tone}`}>{icon}</div>
            <div className="min-w-0">
                <div className="text-[12px] text-muted">{label}</div>
                <div className="num truncate text-[16px] font-semibold leading-tight text-deep">{value}</div>
                {sub && <div className="num truncate text-[12px] text-muted">{sub}</div>}
            </div>
        </div>
    );
}

export function StatusTiles({ s, slug }: { s: Solution; slug: string | null }) {
    const proven = isProvenOptimal(s);
    const infeasible = s.status === 'infeasible';
    const entry = slug ? getEntry(slug) : undefined;
    const violations = s.validation?.failures?.length ?? 0;
    const audited = s.validation?.passed !== undefined;
    const headline = infeasible ? 'Infeasible' : proven ? 'Proven optimal' : 'Best found solution';
    const hl = infeasible ? 'border-red-200 bg-red-50' : proven ? 'border-green-200 bg-green-50' : 'border-green-200 bg-green-50';
    const solved = entry?.solved_at ? entry.solved_at.slice(0, 10) : null;
    return (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Tile hl={hl} tone={infeasible ? 'bg-danger text-white' : proven ? 'bg-success text-white' : 'bg-success text-white'}
                icon={<Icon>{infeasible ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M5 12.5l4.5 4.5L19 7.5" />}</Icon>}
                label={headline} value={infeasible ? 'No solution' : `Gap ${pct(s.gap, 2)}`} sub={infeasible ? undefined : proven ? 'Gap is 0' : 'Not proven optimal'} />
            <Tile tone="bg-blue-50 text-primary" icon={<Icon><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Icon>}
                label="Runtime" value={s.solve_seconds !== undefined ? `${s.solve_seconds.toFixed(1)} s` : MISSING} />
            <Tile tone="bg-blue-50 text-primary" icon={<Icon><rect x="5" y="4" width="14" height="16" rx="2" /><path d="M9 9h6M9 13h6" /></Icon>}
                label="Model status" value={infeasible ? 'Infeasible' : s.primal !== null ? 'Feasible' : MISSING} sub={statusLabel(s)} />
            <Tile tone={violations > 0 ? 'bg-red-50 text-danger' : 'bg-blue-50 text-primary'} icon={<Icon><path d="M12 4l9 16H3z" /><path d="M12 10v4M12 17h.01" /></Icon>}
                label="Constraint violations" value={audited ? violations : MISSING} sub={audited ? (s.validation.passed ? 'Audit passed' : 'Audit not passed') : 'Audit not run'} />
            <Tile tone="bg-blue-50 text-primary" icon={<Icon><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6" /></Icon>}
                label="Data source" value={s.source} sub={solved ? `solved ${solved}` : 'solved date not in this run'} />
        </div>
    );
}

function GapCard({ s }: { s: Solution }) {
    const pts = (s.portfolios ?? []).filter((p) => p.gap !== null && p.gap !== undefined && Number.isFinite(p.gap));
    const W = 300, H = 150, L = 40, B = 28, T = 10;
    const max = Math.max(...pts.map((p) => p.gap as number), s.gap ?? 0, 1e-9);
    const y = (g: number) => T + (H - T - B) * (1 - g / max);
    return (
        <Card title="Optimality gap" aside={<span className="num">final {pct(s.gap, 2)}</span>} bodyClass="p-4">
            {pts.length >= 2 ? (
                <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Gap per portfolio">
                    <line x1={L} x2={W - 6} y1={H - B} y2={H - B} stroke="#CBD5E1" />
                    <line x1={L} x2={L} y1={T} y2={H - B} stroke="#CBD5E1" />
                    <text x={L - 4} y={T + 4} fontSize="9" textAnchor="end" fill="#64748B">{pct(max, 2)}</text>
                    <text x={L - 4} y={H - B} fontSize="9" textAnchor="end" fill="#64748B">0</text>
                    {pts.map((p, i) => {
                        const bw = Math.min(36, (W - L - 12) / pts.length - 8);
                        const x = L + 10 + i * ((W - L - 16) / pts.length);
                        return (
                            <g key={i}>
                                <rect x={x} y={y(p.gap as number)} width={bw} height={Math.max(1, H - B - y(p.gap as number))} rx="2" fill="#2563EB" />
                                <text x={x + bw / 2} y={y(p.gap as number) - 3} fontSize="9" textAnchor="middle" fill="#0F172A">{pct(p.gap, 2)}</text>
                                <text x={x + bw / 2} y={H - B + 12} fontSize="9" textAnchor="middle" fill="#64748B">{p.n_large}L/{p.n_small}S</text>
                            </g>
                        );
                    })}
                </svg>
            ) : (
                <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Final gap">
                    <line x1={L} x2={W - 6} y1={H - B} y2={H - B} stroke="#CBD5E1" />
                    <line x1={L} x2={L} y1={T} y2={H - B} stroke="#CBD5E1" />
                    <text x={L - 4} y={H - B} fontSize="9" textAnchor="end" fill="#64748B">0</text>
                    <circle cx={(W + L) / 2} cy={s.gap !== null ? 55 : H - B} r="6" fill="#2563EB" />
                    <text x={(W + L) / 2 + 12} y={s.gap !== null ? 59 : H - B - 8} fontSize="11" fill="#0F172A">{pct(s.gap, 2)}</text>
                    <text x={(W + L) / 2} y={H - B + 14} fontSize="9" textAnchor="middle" fill="#64748B">final, at {s.solve_seconds?.toFixed(1) ?? '?'} s</text>
                </svg>
            )}
            <p className="mt-1 text-xs text-muted">
                {pts.length >= 2 ? 'Bars show the gap of each portfolio (large L / small S refineries) that reported one. ' : ''}
                Only the final gap is recorded for this run; no gap-over-time curve is stored.
            </p>
        </Card>
    );
}

interface Sens { slug: string; label: string; param: string; delta: number }

function paramText(slug: string, s: Solution, b: Solution): string {
    const sc = s.scenario, bs = b.scenario;
    const bits: string[] = [];
    if (sc && bs) {
        if (sc.yield !== bs.yield) bits.push(`Yield ${sc.yield}`);
        if (sc.horizon_years !== bs.horizon_years) bits.push(`Horizon ${sc.horizon_years} y`);
        if (sc.road_factor !== bs.road_factor) bits.push(`Road factor ${sc.road_factor}`);
        const ex = (sc.excluded_ids ?? []).filter((id) => !(bs.excluded_ids ?? []).includes(id));
        if (ex.length) bits.push(`Disrupt: no refinery ${ex.join(', ')}`);
    }
    return bits.join(', ') || slug;
}

function sensitivities(): { rows: Sens[]; base: number | null } {
    const bs = solutionOf(bundle[BASE_SLUG]);
    const bt = bs ? annualCost(bs).total : null;
    if (!bs || bt == null || bt <= 0) return { rows: [], base: null };
    const rows: Sens[] = [];
    for (const slug of slugs()) {
        if (slug === BASE_SLUG) continue;
        const e = bundle[slug];
        const s = solutionOf(e);
        if (!s || s.status === 'infeasible' || e.family === 'baseline' || s.status === 'heuristic') continue;
        const t = annualCost(s).total;
        if (t == null) continue;
        rows.push({ slug, label: e.label ?? slug, param: paramText(slug, s, bs), delta: (t - bt) / bt });
    }
    return { rows, base: bt };
}

function SensitivityCard() {
    const { rows } = sensitivities();
    const max = Math.max(...rows.map((r) => Math.abs(r.delta)), 1e-9);
    return (
        <Card title="Key sensitivities (Δ total cost)" bodyClass="p-4">
            {rows.length === 0 ? <p className="text-sm text-muted">No comparable stored runs.</p> : (
                <ul className="space-y-2">
                    {rows.map((r) => (
                        <li key={r.slug} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] items-center gap-2 text-[12.5px]">
                            <span className="truncate text-deep" title={r.param}>{r.param}</span>
                            <div className="flex items-center gap-2">
                                <div className="h-4 flex-1 rounded bg-slate-50">
                                    <div className={`h-4 rounded ${r.delta >= 0 ? 'bg-red-300' : 'bg-green-400'}`} style={{ width: `${Math.max(2, (Math.abs(r.delta) / max) * 100)}%` }} />
                                </div>
                                <span className={`num w-14 text-right font-medium ${r.delta >= 0 ? 'text-danger' : 'text-success'}`}>{r.delta >= 0 ? '+' : ''}{(r.delta * 100).toFixed(1)}%</span>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
            <p className="mt-2 text-xs text-muted">Annual total (capex/20 + fixed and variable OpEx + logistics) vs the base stored run, same basis both sides. Only stored runs are shown; Runs with a different horizon are compared per year.</p>
        </Card>
    );
}

function Risk({ tone, children }: { tone: string; children: ReactNode }) {
    return (
        <li className="flex items-start gap-2.5 text-[12.5px] leading-snug text-deep">
            <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${tone}`}>
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M12 6v7M12 18h.01" /></svg>
            </span>
            <span>{children}</span>
        </li>
    );
}

function RiskCard({ s }: { s: Solution }) {
    const factors = Array.from(new Set(s.flows.map((f) => f.road_factor))).sort((a, b) => a - b);
    const osrm = (s.scenario as { distance_basis?: string } | undefined)?.distance_basis === 'osrm';
    const rf = s.scenario?.road_factor ?? (factors.length === 1 ? factors[0] : null);
    const ac = annualCost(s);
    const trk = s.flows.some((f) => f.leg === 'refinery_airport' && f.to === 'TRK');
    return (
        <Card title="Risks & limitations" bodyClass="p-4">
            <ul className="space-y-2.5">
                <Risk tone="bg-blue-50 text-primary">Northern TRK leg is a barge (island): trucks cannot reach Tarakan{trk ? '' : '; no refinery to TRK flow in this run'}.</Risk>
                <Risk tone="bg-amber-50 text-warning">
                    {ac.total == null
                        ? 'Variable OpEx could not be recomputed for this run.'
                        : `Annual cost = CapEx/20 y (no interest) + 5% fixed OpEx + variable OpEx + logistics, ${ac.fromSolver ? 'from the solver' : 'recomputed in the browser'}. Financing beyond that is not modelled.`}
                </Risk>
                <Risk tone="bg-amber-50 text-warning">The 214 km straight-line supply-leg haul limit is our assumption, not official.</Risk>
                <Risk tone={osrm || rf === 1.3 ? 'bg-green-50 text-success' : 'bg-red-50 text-danger'}>
                    {osrm ? 'This run is costed on OSRM road km, not the official 1.3 factor.' : rf === null ? 'Road factor not recorded; official is 1.3.' : rf === 1.3 ? 'Road factor 1.3 matches the official value.' : `This stored run uses road factor ${rf} vs the official 1.3, so absolute costs are overstated.`}
                </Risk>
                <Risk tone="bg-slate-100 text-muted">Seasonality and weather are not modelled; biomass supply is treated as annual.</Risk>
            </ul>
        </Card>
    );
}

export function ValidationOverview({ s, slug }: { s: Solution; slug: string | null }) {
    return (
        <>
            <StatusTiles s={s} slug={slug} />
            <div className="grid gap-4 lg:grid-cols-[0.9fr_1.2fr_1fr]">
                <GapCard s={s} />
                <SensitivityCard />
                <RiskCard s={s} />
            </div>
        </>
    );
}
