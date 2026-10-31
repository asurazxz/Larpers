'use client';

import { useState, type ReactNode } from 'react';
import type { Solution } from '../../lib/contract';
import { bundle, getEntry, slugs, solutionOf } from '../../lib/bundle';
import { storedSlugOf } from '../../lib/useLive';
import { useApp } from '../../lib/store';
import { metricsOf } from './DemandCompare';
import { annualCost } from '../../lib/annual';
import { legSums } from '../../lib/trace';
import { LEG_LABEL, MISSING, isProvenOptimal, pct, statusLabel, usd, usdExact } from '../../lib/format';
import { Card } from '../common/ui';

const LEG_COLOR = { supply_depot: '#2f9e4f', depot_refinery: '#e5a00d', refinery_airport: '#0ea5c6' } as const;
const LEGS = ['supply_depot', 'depot_refinery', 'refinery_airport'] as const;

const Ico = ({ d }: { d: string }) => (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);
const ICON = {
    dollar: 'M12 3v18M16.5 7.5C15.7 6.4 14.1 6 12.5 6 10.3 6 8.5 7 8.5 8.8c0 4 8 2.2 8 6.4 0 1.9-1.9 3-4.3 3-1.8 0-3.5-.6-4.4-1.8',
    building: 'M4 21V9l6-3v15M10 21V4l10 4v13M3 21h18M14 11h2M14 15h2M6 12h2M6 16h2',
    truck: 'M2 6h11v10H2zM13 9h4l4 4v3h-8M6 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM17 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
    doc: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6',
};

function Kpi({ icon, label, value, sub, extra }: { icon: string; label: string; value: ReactNode; sub?: ReactNode; extra?: ReactNode }) {
    return (
        <div className="flex min-w-0 items-center gap-3 rounded-xl border border-line bg-white p-4 shadow-sm">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-primary"><Ico d={icon} /></div>
            <div className="min-w-0">
                <div className="text-[13px] text-muted">{label}</div>
                <div className="num flex flex-wrap items-baseline gap-x-2 text-[26px] font-semibold leading-tight text-deep">{value}{extra}</div>
                {sub && <div className="mt-0.5 text-[12px] text-muted">{sub}</div>}
            </div>
        </div>
    );
}

const chg = (a: number | null, b: number | null): { text: string; cls: string } => {
    if (a == null || b == null || a === 0) return { text: MISSING, cls: 'text-muted' };
    const p = ((b - a) / a) * 100;
    return { text: `${p > 0 ? '+' : ''}${p.toFixed(1)}%`, cls: p > 0.05 ? 'text-danger' : p < -0.05 ? 'text-success' : 'text-muted' };
};

export function Overview({ solution }: { solution: Solution }) {
    const { baseline, go } = useApp();
    const a = annualCost(solution);
    const legs = legSums(solution);
    const total = LEGS.reduce((s, l) => s + legs[l], 0);
    const parts = LEGS.map((l) => ({ label: LEG_LABEL[l], value: legs[l], color: LEG_COLOR[l] }));
    const refCapex = solution.facilities.filter((f) => f.type === 'refinery').reduce((s, f) => s + f.capex_usd, 0);
    const depCapex = solution.facilities.filter((f) => f.type === 'depot').reduce((s, f) => s + f.capex_usd, 0);
    const base = baseline ? annualCost(baseline) : null;
    const vsBase = a.total != null && base?.total ? (a.total - base.total) / base.total : null;
    const opexKnown = a.variableOpex != null;
    const all = slugs();
    const current = storedSlugOf(solution);
    const [aKey, setA] = useState('__displayed');
    const [bKey, setB] = useState(all.includes('baseline') ? 'baseline' : (all.find((s) => s !== current) ?? ''));
    const A = aKey === '__displayed' ? solution : solutionOf(getEntry(aKey));
    const B = solutionOf(getEntry(bKey)) ?? (bKey === '__displayed' ? solution : undefined);
    const ma = A ? metricsOf(A) : null;
    const mb = B ? metricsOf(B) : null;
    const rows: [string, number | null, number | null][] = ma && mb ? [['Total cost (1 yr)', ma.total, mb.total], ['CapEx (one-off)', ma.capex, mb.capex], ['Logistics (1 yr)', ma.logistics, mb.logistics]] : [];
    const opt = (
        <>
            <option value="__displayed">Displayed run</option>
            {all.map((s) => <option key={s} value={s}>{bundle[s]?.label ?? s}</option>)}
        </>
    );
    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
                <Kpi icon={ICON.dollar} label="Total cost (1 yr)" value={usd(a.total)} sub={a.total == null ? 'variable OpEx not in this run' : undefined}
                    extra={vsBase != null ? <span className={`text-[13px] font-semibold ${vsBase <= 0 ? 'text-success' : 'text-danger'}`}>{vsBase <= 0 ? '▼' : '▲'} {Math.abs(vsBase * 100).toFixed(1)}% vs baseline</span> : undefined} />
                <Kpi icon={ICON.building} label="CapEx (one-off)" value={usd(solution.capex_usd)} sub={`Refineries ${usd(refCapex)} · Depots ${usd(depCapex)}`} />
                <Kpi icon={ICON.truck} label="Annual logistics cost" value={usd(a.transport)} sub={`${solution.flows.length} flows`} />
                <Kpi icon={ICON.doc} label="OpEx (annual)" value={opexKnown ? usd(a.fixedOpex + (a.variableOpex ?? 0)) : <span className="text-[20px]">Not provided</span>}
                    sub={opexKnown ? `fixed ${usd(a.fixedOpex)} + variable ${usd(a.variableOpex)}` : undefined}
                    extra={opexKnown ? undefined : <span title={`Variable OpEx is not in this run; fixed OpEx alone is ${usd(a.fixedOpex)}/yr.`} className="flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-muted text-[10px] font-semibold text-muted" aria-label="Variable OpEx is not in this run">i</span>} />
            </div>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
                <Card title="Cost breakdown (1 yr)">
                    <div className="flex flex-wrap items-center gap-5">
                        <Donut parts={parts} />
                        <ul className="min-w-0 flex-1 space-y-3 text-sm">
                            {parts.map((p) => (
                                <li key={p.label} className="flex items-center gap-2">
                                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: p.color }} aria-hidden="true" />
                                    <span className="text-deep">{p.label}</span>
                                    <span className="num ml-auto whitespace-nowrap pl-2 text-muted">{usd(p.value)} ({total > 0 ? pct(p.value / total, 0) : MISSING})</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </Card>
                <Card title="Scenario comparison">
                    <div className="flex items-center gap-2 text-sm">
                        <select className="input min-w-0 flex-1" aria-label="Run A" value={aKey} onChange={(e) => setA(e.target.value)}>{opt}</select>
                        <span className="font-semibold text-muted">vs</span>
                        <select className="input min-w-0 flex-1" aria-label="Run B" value={bKey} onChange={(e) => setB(e.target.value)}>{opt}</select>
                    </div>
                    {rows.length === 0 ? <p className="mt-4 text-sm text-muted">Nothing to compare: no second stored run.</p> : (
                        <table className="tbl mt-3 w-full">
                            <thead><tr><th className="text-left">Metric</th><th className="text-right">A</th><th className="text-right">B</th><th className="text-right">Change</th></tr></thead>
                            <tbody>
                                {rows.map(([n, x, y]) => {
                                    const c = chg(x, y);
                                    return <tr key={n}><td>{n}</td><td className="num text-right">{x == null ? MISSING : usd(x)}</td><td className="num text-right">{y == null ? MISSING : usd(y)}</td><td className={`num text-right font-semibold ${c.cls}`}>{c.text}</td></tr>;
                                })}
                            </tbody>
                        </table>
                    )}
                    <div className="mt-3 text-right"><button type="button" className="text-sm font-medium text-primary hover:underline" onClick={() => go('results', 'compare')}>View detailed comparison →</button></div>
                </Card>
            </div>
            <p className="text-xs text-muted">{statusLabel(solution)}. {isProvenOptimal(solution) ? 'MIP gap 0: proven optimal for the stated assumptions.' : `MIP gap ${pct(solution.gap, 2)}: not proven optimal.`} Basis: {a.fromSolver ? 'figures supplied by the solver' : 'annual figures recomputed in the browser from this run'}.</p>
        </div>
    );
}

function Donut({ parts }: { parts: { label: string; value: number; color: string }[] }) {
    const total = parts.reduce((s, p) => s + p.value, 0);
    const r = 66;
    const c = 2 * Math.PI * r;
    let off = 0;
    return (
        <svg viewBox="0 0 200 200" className="h-44 w-44 shrink-0" role="img" aria-label="Logistics cost by leg">
            <circle cx="100" cy="100" r={r} fill="none" stroke="#e5e7eb" strokeWidth="34" />
            {total > 0 &&
                parts.map((p) => {
                    const len = (p.value / total) * c;
                    const el = <circle key={p.label} cx="100" cy="100" r={r} fill="none" stroke={p.color} strokeWidth="34" strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-off} transform="rotate(-90 100 100)" />;
                    off += len;
                    return el;
                })}
            <text x="100" y="100" textAnchor="middle" className="fill-deep" fontSize="19" fontWeight="700">{usd(total)}</text>
            <text x="100" y="118" textAnchor="middle" className="fill-muted" fontSize="12">Logistics</text>
        </svg>
    );
}

export function Costs({ solution }: { solution: Solution }) {
    const a = annualCost(solution);
    const legs = legSums(solution);
    const total = LEGS.reduce((s, l) => s + legs[l], 0);
    const parts = LEGS.map((l) => ({ label: LEG_LABEL[l], value: legs[l], color: LEG_COLOR[l] }));
    const horizon = solution.scenario?.horizon_years;
    type Row = { name: string; v: number | null; basis: 'one-off' | 'annual' | 'horizon'; note?: string };
    const rows: Row[] = [
        { name: 'Refinery CapEx', v: solution.facilities.filter((f) => f.type === 'refinery').reduce((s, f) => s + f.capex_usd, 0), basis: 'one-off' },
        { name: 'Depot CapEx', v: solution.facilities.filter((f) => f.type === 'depot').reduce((s, f) => s + f.capex_usd, 0), basis: 'one-off' },
        { name: 'Annualised CapEx (÷ 20 yr)', v: a.annualisedCapex, basis: 'annual' },
        { name: 'Fixed OpEx (5% of CapEx)', v: a.fixedOpex, basis: 'annual' },
        { name: 'Variable OpEx', v: a.variableOpex, basis: 'annual' },
        ...LEGS.map((l): Row => ({ name: `Logistics, ${LEG_LABEL[l]}`, v: legs[l], basis: 'annual' })),
        { name: 'Total annual cost', v: a.total, basis: 'annual' },
        { name: horizon ? `Total over ${horizon}-yr horizon (solver)` : 'Total over horizon (solver)', v: solution.total_horizon_usd, basis: 'horizon' },
    ];
    return (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,380px)_1fr]">
            <Card title="Logistics by leg">
                <div className="flex flex-wrap items-center gap-4">
                    <Donut parts={parts} />
                    <ul className="space-y-2 text-sm">
                        {parts.map((p) => (
                            <li key={p.label} className="flex items-center gap-2">
                                <span className="h-3 w-3 rounded-sm" style={{ background: p.color }} aria-hidden="true" />
                                <span className="text-deep">{p.label}</span>
                                <span className="num ml-auto pl-3 text-muted">{usd(p.value)} · {total > 0 ? pct(p.value / total) : MISSING}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            </Card>
            <Card title="Cost lines" bodyClass="p-0">
                <div className="overflow-x-auto">
                    <table className="tbl w-full">
                        <thead><tr><th className="text-left">Line</th><th className="text-right">USD</th><th className="text-left">Basis</th></tr></thead>
                        <tbody>
                            {rows.map((r) => (
                                <tr key={r.name} className={r.name.startsWith('Total') ? 'font-semibold' : ''}>
                                    <td>{r.name}</td>
                                    <td className="num text-right" title={r.v != null ? usdExact(r.v) : undefined}>{r.v == null ? MISSING : usd(r.v)}</td>
                                    <td><span className="chip bg-slate-100 text-muted">{r.basis}</span></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
}
