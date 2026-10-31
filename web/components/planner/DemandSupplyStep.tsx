'use client';

import { useMemo, useState } from 'react';
import { sites } from '../../lib/bundle';
import { AIRPORTS } from '../../lib/contract';
import type { ScenarioForm } from '../../lib/useLive';
import { Card, Tabs } from '../common/ui';

const OFFICIAL_DEMAND = 300;
const sameNum = (s: string, n: number) => s.trim() !== '' && Math.abs(Number(s) - n) < 1e-9;

const SHADES = ['#bbf7d0', '#86efac', '#4ade80', '#16a34a', '#166534'];

export function Tag({ official }: { official: boolean }) {
    return (
        <span className={`chip ${official ? 'bg-green-50 text-success' : 'bg-amber-50 text-warning'}`}>
            {official ? 'Official' : 'Assumption'}
        </span>
    );
}

export default function DemandSupplyStep({
    form,
    upd,
    error,
}: {
    form: ScenarioForm;
    upd: (patch: Partial<ScenarioForm>) => void;
    error?: string;
}) {
    const [tab, setTab] = useState<'region' | 'site'>('region');

    const regions = useMemo(() => {
        const m = new Map<string, { kt: number; n: number }>();
        for (const s of sites) {
            const key = s.province || 'Unknown';
            const r = m.get(key) ?? { kt: 0, n: 0 };
            r.kt += s.kt;
            r.n += 1;
            m.set(key, r);
        }
        return [...m.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.kt - a.kt);
    }, []);
    const totalKt = regions.reduce((s, r) => s + r.kt, 0);
    const maxKt = Math.max(1, ...regions.map((r) => r.kt));
    const bins = [0, 0.2, 0.4, 0.6, 0.8].map((f) => Math.round(maxKt * f));
    const shadeOf = (kt: number) => SHADES[Math.min(4, Math.floor((kt / maxKt) * 5))];
    const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 1 });
    const today = new Date().toISOString().slice(0, 10);

    return (
        <div className="space-y-4">
            <Card
                title="Airport demand (kt/yr)"
                aside={
                    <button
                        type="button"
                        className="text-sm font-medium text-primary hover:underline"
                        onClick={() => upd({ demand: { PNK: '', PKN: '', BPN: '', TRK: '' } as ScenarioForm['demand'] })}
                    >
                        Use dataset
                    </button>
                }
                bodyClass="p-4"
            >
                <div className="flex flex-wrap items-end gap-3">
                    <div className="grid min-w-0 flex-1 grid-cols-4 gap-3">
                        {AIRPORTS.map((a) => (
                            <div key={a}>
                                <div className="mb-1 flex items-center gap-1.5">
                                    <label className="text-sm font-medium text-deep">{a}</label>
                                    {form.demand[a].trim() !== '' && <Tag official={sameNum(form.demand[a], OFFICIAL_DEMAND)} />}
                                </div>
                                <input
                                    className="input num w-full"
                                    inputMode="decimal"
                                    placeholder="300 (preset)"
                                    value={form.demand[a]}
                                    onChange={(e) => upd({ demand: { ...form.demand, [a]: e.target.value } })}
                                />
                            </div>
                        ))}
                    </div>
                    <div className="flex items-center gap-2.5 rounded-lg border border-line bg-app px-3 py-2">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-primary" aria-hidden="true">
                            <ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
                        </svg>
                        <div>
                            <div className="text-sm font-medium text-deep">Official 12:45 update</div>
                            <div className="num text-xs text-muted">{today}</div>
                        </div>
                    </div>
                </div>
                <p className="mt-2 text-xs text-muted">Blank fields use the official preset: 300 kt per airport, 1,200 kt total.</p>
                {error && <div className="mt-1 text-sm text-danger" role="alert">{error}</div>}
            </Card>

            <Card title="Biomass supply (kt/yr)" aside={<span className="chip bg-green-50 text-success">Official data</span>} bodyClass="p-4">
                <Tabs
                    tabs={[{ key: 'region', label: 'By region' }, { key: 'site', label: 'By collection site' }]}
                    active={tab}
                    onChange={setTab}
                />
                <div className="mt-3 grid gap-4 lg:grid-cols-[1fr_260px]">
                    <div className="max-h-[210px] overflow-auto rounded-lg border border-line">
                        {tab === 'region' ? (
                            <table className="tbl w-full text-sm">
                                <thead><tr><th className="text-left">Province</th><th className="text-right">Sites</th><th className="text-right">Supply kt/yr</th></tr></thead>
                                <tbody>
                                    {regions.map((r) => (
                                        <tr key={r.name}><td>{r.name}</td><td className="num text-right">{r.n}</td><td className="num text-right">{fmt(r.kt)}</td></tr>
                                    ))}
                                    <tr className="font-semibold"><td>Total</td><td className="num text-right">{sites.length}</td><td className="num text-right">{fmt(totalKt)}</td></tr>
                                </tbody>
                            </table>
                        ) : (
                            <table className="tbl w-full text-sm">
                                <thead><tr><th className="text-left">Site</th><th className="text-left">District</th><th className="text-right">kt/yr</th><th className="text-left">Sea</th></tr></thead>
                                <tbody>
                                    {sites.map((s) => (
                                        <tr key={s.id}>
                                            <td className="num">{s.id}</td>
                                            <td>{s.district}</td>
                                            <td className="num text-right">{fmt(s.kt)}</td>
                                            <td>{s.sea ? <span className="chip bg-amber-50 text-warning">Sea</span> : ''}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                    <div className="rounded-lg border border-line p-3">
                        <div className="mb-2 text-xs font-medium text-deep">Supply by province (kt/yr)</div>
                        <div className="space-y-1.5">
                            {regions.map((r) => (
                                <div key={r.name} className="flex items-center gap-2 text-xs">
                                    <span className="w-20 shrink-0 truncate text-muted" title={r.name}>{r.name}</span>
                                    <div className="h-3 flex-1 rounded bg-app"><div className="h-3 rounded" style={{ width: `${(r.kt / maxKt) * 100}%`, background: shadeOf(r.kt) }} /></div>
                                </div>
                            ))}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-muted">
                            {SHADES.map((c, i) => (
                                <span key={c} className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: c }} />{bins[i]}+</span>
                            ))}
                        </div>
                    </div>
                </div>
                <div className="mt-3">
                    <label className="mb-1 block text-sm font-medium text-deep">Biomass collection policy</label>
                    <select className="input w-full sm:w-64" value={form.collection} onChange={(e) => upd({ collection: e.target.value as ScenarioForm['collection'] })}>
                        <option value="all">All biomass collected</option>
                        <option value="optional">Collection optional</option>
                    </select>
                </div>
            </Card>
        </div>
    );
}
