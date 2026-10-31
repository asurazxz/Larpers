'use client';

import type { Solution } from '../../lib/contract';
import { annualCost } from '../../lib/annual';
import { legSums } from '../../lib/trace';
import { LEG_LABEL, MISSING, isProvenOptimal, kt, pct, seconds, statusLabel, usd, usdExact } from '../../lib/format';
import { Card, MetricCard, SolverChip } from '../common/ui';

const LEG_COLOR = { supply_depot: '#2f9e4f', depot_refinery: '#e5a00d', refinery_airport: '#0ea5c6' } as const;
const LEGS = ['supply_depot', 'depot_refinery', 'refinery_airport'] as const;

export function Overview({ solution }: { solution: Solution }) {
    const a = annualCost(solution);
    const refs = solution.facilities.filter((f) => f.type === 'refinery');
    const deps = solution.facilities.filter((f) => f.type === 'depot');
    const opexKnown = a.variableOpex != null;
    return (
        <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-5">
                <MetricCard label="Total annual cost" value={usd(a.total)} sub={a.total == null ? 'variable OpEx not in this run' : 'annualised CapEx + OpEx + logistics'} />
                <MetricCard label="CapEx (one-off)" value={usd(solution.capex_usd)} sub={`${usd(a.annualisedCapex)}/yr over 20 yr`} tone="amber" />
                <MetricCard label="Annual logistics" value={usd(a.transport)} sub={`${solution.flows.length} flows`} tone="green" />
                <MetricCard label="OpEx (annual)" value={opexKnown ? usd(a.fixedOpex + (a.variableOpex ?? 0)) : MISSING} sub={opexKnown ? `fixed ${usd(a.fixedOpex)} + variable ${usd(a.variableOpex)}` : `fixed ${usd(a.fixedOpex)}; variable not in this run`} tone={opexKnown ? 'blue' : 'red'} />
                <MetricCard label="Solver" value={<SolverChip solution={solution} />} sub={`${seconds(solution.solve_seconds)}, ${solution.n_candidates} candidates`} />
            </div>
            <Card title="Network summary" aside={statusLabel(solution)}>
                <ul className="grid gap-x-8 gap-y-2 text-sm text-deep sm:grid-cols-2">
                    <li><span className="num font-semibold">{refs.length}</span> refineries ({refs.filter((f) => f.size === 'large').length} large, {refs.filter((f) => f.size === 'small').length} small)</li>
                    <li><span className="num font-semibold">{deps.length}</span> depots ({deps.filter((f) => f.size === 'large').length} large, {deps.filter((f) => f.size === 'small').length} small)</li>
                    <li>SAF delivered: <span className="num font-semibold">{kt(solution.flows.filter((f) => f.leg === 'refinery_airport').reduce((s, f) => s + f.kt, 0))}</span></li>
                    <li>Stranded biomass: <span className="num font-semibold">{kt(solution.stranded.reduce((s, x) => s + x.kt, 0))}</span> at {solution.stranded.length} sites</li>
                    <li>Basis: {a.fromSolver ? 'figures supplied by the solver' : 'annual figures recomputed in the browser from this run'}</li>
                    <li>{isProvenOptimal(solution) ? 'MIP gap 0: proven optimal for the stated assumptions.' : `MIP gap ${pct(solution.gap, 2)}: not proven optimal.`}</li>
                </ul>
            </Card>
        </div>
    );
}

function Donut({ parts }: { parts: { label: string; value: number; color: string }[] }) {
    const total = parts.reduce((s, p) => s + p.value, 0);
    const r = 70;
    const c = 2 * Math.PI * r;
    let off = 0;
    return (
        <svg viewBox="0 0 200 200" className="h-48 w-48 shrink-0" role="img" aria-label="Logistics cost by leg">
            <circle cx="100" cy="100" r={r} fill="none" stroke="#e5e7eb" strokeWidth="28" />
            {total > 0 &&
                parts.map((p) => {
                    const len = (p.value / total) * c;
                    const el = <circle key={p.label} cx="100" cy="100" r={r} fill="none" stroke={p.color} strokeWidth="28" strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-off} transform="rotate(-90 100 100)" />;
                    off += len;
                    return el;
                })}
            <text x="100" y="96" textAnchor="middle" className="fill-muted" fontSize="11">Logistics / yr</text>
            <text x="100" y="116" textAnchor="middle" className="fill-deep" fontSize="16" fontWeight="600">{usd(total)}</text>
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
