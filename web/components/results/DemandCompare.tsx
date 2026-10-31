'use client';

import { useState } from 'react';
import { AIRPORTS, DEFAULT_SCENARIO, type DemandKt, type Solution } from '../../lib/contract';
import { annualCost } from '../../lib/annual';
import { bundle, getEntry, slugs, solutionOf } from '../../lib/bundle';
import { MISSING, isProvenOptimal, kt, pct, usd } from '../../lib/format';
import { storedSlugOf, viewForEntry } from '../../lib/useLive';
import { useApp } from '../../lib/store';
import { demandOf } from '../../lib/demand';
import { Card, EmptyState } from '../common/ui';

const sumKt = (xs: { kt: number }[]) => xs.reduce((s, x) => s + x.kt, 0);
const TOL = 0.05;

export function Demand({ solution }: { solution: Solution }) {
    const demand = demandOf(solution);
    const rows = AIRPORTS.map((a) => {
        const delivered = sumKt(solution.flows.filter((f) => f.leg === 'refinery_airport' && f.to === a));
        const target = demand ? demand[a] : null;
        const diff = target == null ? null : delivered - target;
        return { a, target, delivered, diff };
    });
    const max = Math.max(1, ...rows.flatMap((r) => [r.target ?? 0, r.delivered]));
    return (
        <div className="space-y-5">
            <Card title="Airport demand vs delivered SAF" aside={demand ? 'demand from this run\'s scenario' : 'demand not echoed by this stored run'}>
                <div className="overflow-x-auto">
                    <table className="tbl w-full">
                        <thead><tr><th className="text-left">Airport</th><th className="text-right">Demand</th><th className="text-right">Delivered</th><th className="text-right">Difference</th><th className="text-left">Status</th><th className="w-1/3 text-left">Delivered vs demand</th></tr></thead>
                        <tbody>
                            {rows.map((r) => {
                                const ok = r.diff == null ? null : Math.abs(r.diff) <= TOL;
                                const chip = ok == null ? 'bg-slate-100 text-muted' : ok ? 'bg-green-50 text-success' : r.diff! < 0 ? 'bg-red-50 text-danger' : 'bg-amber-50 text-warning';
                                return (
                                    <tr key={r.a}>
                                        <td className="font-semibold">{r.a}</td>
                                        <td className="num text-right">{r.target == null ? MISSING : kt(r.target)}</td>
                                        <td className="num text-right">{kt(r.delivered)}</td>
                                        <td className="num text-right">{r.diff == null ? MISSING : `${r.diff > 0 ? '+' : ''}${r.diff.toFixed(1)} kt`}</td>
                                        <td><span className={`chip ${chip}`}>{ok == null ? 'Demand unknown' : ok ? 'Met' : r.diff! < 0 ? 'Short' : 'Over-delivered'}</span></td>
                                        <td>
                                            <div className="relative h-3 rounded bg-slate-100" aria-hidden="true">
                                                <div className="absolute inset-y-0 left-0 rounded bg-leg3" style={{ width: `${(r.delivered / max) * 100}%` }} />
                                                {r.target != null && <div className="absolute -inset-y-0.5 w-0.5 bg-deep" style={{ left: `${(r.target / max) * 100}%` }} />}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </Card>
            <div className="grid gap-5 lg:grid-cols-2">
                <Card title={`Surplus SAF at refinery gates (${kt(sumKt(solution.surplus))})`} bodyClass="p-0">
                    {solution.surplus.length === 0 ? <div className="p-5 text-sm text-muted">No surplus in this run.</div> : (
                        <div className="overflow-x-auto"><table className="tbl w-full"><thead><tr><th className="text-left">Refinery</th><th className="text-right">kt</th></tr></thead>
                            <tbody>{solution.surplus.map((s) => <tr key={s.site_id}><td className="num">{s.site_id}</td><td className="num text-right">{kt(s.kt)}</td></tr>)}</tbody></table></div>
                    )}
                </Card>
                <Card title={`Stranded biomass (${kt(sumKt(solution.stranded))})`} bodyClass="p-0">
                    {solution.stranded.length === 0 ? <div className="p-5 text-sm text-muted">No stranded sites in this run.</div> : (
                        <div className="overflow-x-auto"><table className="tbl w-full"><thead><tr><th className="text-left">Site</th><th className="text-right">kt</th><th className="text-left">Reason</th></tr></thead>
                            <tbody>{solution.stranded.map((s) => <tr key={s.site_id}><td>{s.site_id} <span className="text-muted">{s.label}</span></td><td className="num text-right">{kt(s.kt)}</td><td>{s.reason}</td></tr>)}</tbody></table></div>
                    )}
                </Card>
            </div>
        </div>
    );
}

export interface Metrics { total: number | null; capex: number; logistics: number; refs: number; deps: number; gap: number | null; status: string; served: number; delivered: number }
export function metricsOf(s: Solution): Metrics {
    const a = annualCost(s);
    const sa = s.flows.filter((f) => f.leg === 'refinery_airport');
    return {
        total: a.total, capex: s.capex_usd, logistics: a.transport,
        refs: s.facilities.filter((f) => f.type === 'refinery').length, deps: s.facilities.filter((f) => f.type === 'depot').length,
        gap: s.gap, status: isProvenOptimal(s) ? 'Proven optimal' : s.status === 'infeasible' ? 'Infeasible' : s.status === 'heuristic' ? 'Heuristic' : 'Best found',
        served: AIRPORTS.filter((c) => sa.some((f) => f.to === c && f.kt > 0)).length, delivered: sumKt(sa),
    };
}

export function Compare({ solution }: { solution: Solution }) {
    const { selectView } = useApp();
    const all = slugs();
    const current = storedSlugOf(solution);
    const [aKey, setA] = useState('__displayed');
    const [bKey, setB] = useState(all.includes('baseline') ? 'baseline' : (all.find((s) => s !== current) ?? ''));
    const resolve = (k: string): Solution | undefined => (k === '__displayed' ? solution : solutionOf(getEntry(k)));
    const A = resolve(aKey);
    const B = resolve(bKey);
    if (all.length + 1 < 2 || !A || !B) {
        return <EmptyState title="Nothing to compare yet">Run or load another scenario to compare network designs.</EmptyState>;
    }
    const ma = metricsOf(A);
    const mb = metricsOf(B);
    const num = (x: number | null, fmt: (v: number) => string) => (x == null ? MISSING : fmt(x));
    const diff = (a: number | null, b: number | null, fmt: (v: number) => string) => {
        if (a == null || b == null) return [MISSING, MISSING];
        const d = b - a;
        return [`${d > 0 ? '+' : ''}${fmt(d)}`, a === 0 ? MISSING : `${d > 0 ? '+' : ''}${(((b - a) / a) * 100).toFixed(1)}%`];
    };
    const int = (v: number) => String(v);
    const lines: [string, number | null, number | null, (v: number) => string][] = [
        ['Total annual cost', ma.total, mb.total, usd], ['CapEx (one-off)', ma.capex, mb.capex, usd], ['Annual logistics', ma.logistics, mb.logistics, usd],
        ['Refineries', ma.refs, mb.refs, int], ['Depots', ma.deps, mb.deps, int], ['MIP gap', ma.gap, mb.gap, (v) => pct(v, 2)],
        ['Airports served', ma.served, mb.served, int], ['Delivered SAF', ma.delivered, mb.delivered, kt],
    ];
    const ids = (s: Solution) => new Set(s.facilities.map((f) => `${f.site_id} (${f.type})`));
    const ia = ids(A);
    const ib = ids(B);
    const onlyA = [...ia].filter((x) => !ib.has(x)).sort();
    const onlyB = [...ib].filter((x) => !ia.has(x)).sort();
    const both = [...ia].filter((x) => ib.has(x)).sort();
    const opt = (k: string, withDisplayed: boolean) => (
        <>
            {withDisplayed && <option value="__displayed">Displayed run</option>}
            {all.map((s) => <option key={s} value={s}>{bundle[s]?.label ?? s} ({s}, {bundle[s]?.status})</option>)}
            {!withDisplayed && k === '' && <option value="">Select a run</option>}
        </>
    );
    const entryB = getEntry(bKey);
    return (
        <div className="space-y-5">
            <Card title="Compare runs" aside={entryB && <button type="button" className="btn-primary" onClick={() => selectView(viewForEntry(entryB), solutionOf(entryB) ?? null)}>Load B as displayed run</button>}>
                <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-sm text-muted">Run A<select className="input mt-1 w-full" value={aKey} onChange={(e) => setA(e.target.value)}>{opt(aKey, true)}</select></label>
                    <label className="text-sm text-muted">Run B<select className="input mt-1 w-full" value={bKey} onChange={(e) => setB(e.target.value)}>{opt(bKey, true)}</select></label>
                </div>
            </Card>
            <Card bodyClass="p-0">
                <div className="overflow-x-auto">
                    <table className="tbl w-full">
                        <thead><tr><th className="text-left">Metric</th><th className="text-right">A</th><th className="text-right">B</th><th className="text-right">B − A</th><th className="text-right">% of A</th></tr></thead>
                        <tbody>
                            {lines.map(([name, a, b, fmt]) => {
                                const [d, p] = diff(a, b, name === 'MIP gap' ? (v) => `${(v * 100).toFixed(2)} pp` : fmt);
                                return <tr key={name}><td>{name}</td><td className="num text-right">{num(a, fmt)}</td><td className="num text-right">{num(b, fmt)}</td><td className="num text-right">{d}</td><td className="num text-right">{p}</td></tr>;
                            })}
                            <tr><td>Status</td><td className="text-right">{ma.status}</td><td className="text-right">{mb.status}</td><td /><td /></tr>
                        </tbody>
                    </table>
                </div>
            </Card>
            <Card title="Facility differences">
                <div className="grid gap-4 text-sm sm:grid-cols-3">
                    {([['Only in A', onlyA], ['Only in B', onlyB], ['In both', both]] as const).map(([t, xs]) => (
                        <div key={t}><div className="mb-1 font-semibold text-deep">{t} <span className="num text-muted">({xs.length})</span></div>
                            <div className="num max-h-40 overflow-y-auto text-muted">{xs.length ? xs.join(', ') : 'none'}</div></div>
                    ))}
                </div>
            </Card>
        </div>
    );
}
