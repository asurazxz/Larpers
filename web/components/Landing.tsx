'use client';

// Front page (#home). Wording from docs/PITCH.md; every number is read from the stored bundle at runtime.
import Logo from './Logo';
import { animate, stagger } from 'animejs';
import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { baseEntry, solutionOf, storedRunCount } from '../lib/bundle';
import { annualCost } from '../lib/annual';
import { preUpdateBasis } from '../lib/basis';
import { MISSING, pct, statusLabel, usd } from '../lib/format';
import { storedBaselineFor } from './CostPanel';
import { LEG_GLOW } from './heroNetwork';
import { reducedMotion, Tween } from './motion';

const HeroScene = dynamic(() => import('./HeroScene'), { ssr: false, loading: () => null });

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const int = (v: number | null | undefined) => (finite(v) ? String(Math.round(v)) : MISSING);

/** Reveals [data-reveal] children with a stagger the first time the block scrolls into view. */
function useReveal<T extends HTMLElement>(onShow?: () => void) {
    const ref = useRef<T>(null);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const items = el.querySelectorAll<HTMLElement>('[data-reveal]');
        if (reducedMotion()) {
            onShow?.();
            return;
        }
        items.forEach((i) => (i.style.opacity = '0'));
        const io = new IntersectionObserver(
            ([e]) => {
                if (!e.isIntersecting) return;
                io.disconnect();
                animate(items, {
                    opacity: { from: 0, to: 1 },
                    translateY: { from: 28, to: 0 },
                    duration: 900,
                    delay: stagger(90),
                    ease: 'outExpo',
                });
                onShow?.();
            },
            { threshold: 0.15 },
        );
        io.observe(el);
        return () => io.disconnect();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return ref;
}

function Block({ eyebrow, title, children, id, onShow }: { eyebrow: string; title: string; children: React.ReactNode; id: string; onShow?: () => void }) {
    const ref = useReveal<HTMLElement>(onShow);
    return (
        <section ref={ref} id={id} className="mx-auto max-w-5xl px-6 py-20 md:py-28">
            <p data-reveal className="text-lg font-semibold text-accent">
                {eyebrow}
            </p>
            <h2 data-reveal className="mt-2 text-[2.2rem] font-semibold leading-[1.08] tracking-[-0.03em] md:text-[2.9rem]">
                {title}
            </h2>
            <div className="mt-8">{children}</div>
        </section>
    );
}

const STEPS: [string, string][] = [
    ['The solver decides', 'A mixed-integer model on all 80 official sites chooses the network. Only onshore sites are candidates for plants.'],
    ['An independent audit', 'A separate audit recomputes every result. No language model decides anything.'],
    ['Against a greedy baseline', 'The same haul limit and distances, chosen greedily. The saving is the gap. Our solver may split a site between depots; the baseline may not.'],
    ['Stored runs, labelled', 'When no solver is reachable, the planner shows stored runs and says so. A stored run is never called live.'],
];

export default function Landing() {
    const base = solutionOf(baseEntry()) ?? null;
    const baseline = storedBaselineFor(base);
    const total = base ? annualCost(base).total : null;
    const baseBasis = preUpdateBasis(base);
    const baseTotal = baseline ? annualCost(baseline).total : null;
    const saving = finite(total) && finite(baseTotal) ? baseTotal - total : null;
    const audit = base?.validation ? (base.validation.passed ? 'PASSED' : 'FAILED') : MISSING;
    const nRef = base?.facilities.filter((f) => f.type === 'refinery').length;
    const nDep = base?.facilities.filter((f) => f.type === 'depot').length;
    const [counting, setCounting] = useState(false);
    const hero = useRef<HTMLDivElement>(null);

    useEffect(() => {
        window.scrollTo(0, 0);
        const el = hero.current;
        if (!el || reducedMotion()) return;
        const items = el.querySelectorAll<HTMLElement>('[data-hero]');
        animate(items, {
            opacity: { from: 0, to: 1 },
            translateY: { from: 22, to: 0 },
            duration: 1100,
            delay: stagger(120, { start: 150 }),
            ease: 'outExpo',
        });
    }, []);

    return (
        <div id="landing" className="min-h-screen bg-canvas text-ink">
            <section className="relative isolate flex min-h-[100svh] flex-col overflow-hidden bg-black text-white">
                <div className="absolute inset-0 -z-10 bg-[radial-gradient(120%_80%_at_50%_100%,#0d1a2e_0%,#05070b_55%,#000_100%)]" />
                <HeroScene className="!absolute inset-0 -z-10" />
                <nav className="flex items-center justify-between px-6 py-4 text-base text-white/70 md:px-10">
                    <Logo size={32} tone="light" />
                    <span>Airbus Challenge #3</span>
                </nav>
                <div ref={hero} className="mx-auto mt-[6vh] max-w-4xl px-6 text-center">
                    <p data-hero className="text-lg font-semibold text-[#5eead4]">
                        Kalimantan SAF Network Planner
                    </p>
                    <h1 data-hero className="mt-3 text-[2.6rem] font-semibold leading-[1.04] tracking-[-0.035em] md:text-[4.2rem]">
                        Four airports. Eighty sites.
                        <br />
                        One network, solved.
                    </h1>
                    <p data-hero className="mx-auto mt-4 max-w-2xl text-xl leading-snug text-white/70">
                        Where to put depots and refineries for sustainable aviation fuel, chosen by a solver and checked by an independent audit.
                    </p>
                    <div data-hero className="mt-7 flex flex-wrap items-center justify-center gap-4">
                        <a
                            href="#planner"
                            id="open-planner"
                            className="rounded-full bg-accent px-7 py-3 text-lg font-medium text-white shadow-[0_8px_30px_rgba(0,113,227,0.45)] transition hover:bg-[#0077ed] hover:shadow-[0_8px_40px_rgba(0,113,227,0.6)]"
                        >
                            Open the planner
                        </a>
                        <a
                            href="#how"
                            onClick={(e) => {
                                e.preventDefault();
                                document.getElementById('how')?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth' });
                            }}
                            className="text-lg text-[#5eead4] hover:underline"
                        >
                            How it works {'›'}
                        </a>
                    </div>
                </div>
                <div className="mt-auto flex flex-wrap items-center justify-between gap-3 px-6 pb-5 text-base text-white/60 md:px-10">
                    <span>Stored run: base network, real site coordinates</span>
                    <span className="flex flex-wrap gap-4">
                        {(
                            [
                                ['supply_depot', 'Site → depot'],
                                ['depot_refinery', 'Depot → refinery'],
                                ['refinery_airport', 'Refinery → airport'],
                            ] as const
                        ).map(([leg, label]) => (
                            <span key={leg} className="inline-flex items-center gap-2">
                                <span className="inline-block h-2 w-5 rounded-full" style={{ background: LEG_GLOW[leg] }} />
                                {label}
                            </span>
                        ))}
                    </span>
                </div>
            </section>

            <Block id="problem" eyebrow="The user and the decision" title="Which sites, which plants, what the trucking costs.">
                <div className="grid gap-6 text-xl leading-relaxed text-ink3 md:grid-cols-2">
                    <p data-reveal>
                        A supply planner in Kalimantan has 6,800 kilotonnes of residue at 80 sites and four airports to supply, 300 kilotonnes of fuel each. They do
                        not have to collect everything.
                    </p>
                    <p data-reveal>
                        The decision: which sites to use, where to put depots and refineries, and what the trucking will cost. Open a refinery in the wrong place
                        and the money is spent before the first litre moves. <span className="text-ink2">This is our persona, not a named Airbus customer.</span>
                    </p>
                </div>
            </Block>

            <div className="bg-white">
                <Block id="how" eyebrow="How it works" title="Decide, audit, compare. Label everything.">
                    <ol className="grid gap-4 md:grid-cols-4">
                        {STEPS.map(([h, p], i) => (
                            <li key={h} data-reveal className="rounded-card bg-canvas p-6">
                                <div className="text-lg font-semibold text-accent">{i + 1}</div>
                                <div className="mt-2 text-xl font-semibold tracking-tight">{h}</div>
                                <p className="mt-2 text-lg leading-snug text-ink2">{p}</p>
                            </li>
                        ))}
                    </ol>
                </Block>
            </div>

            <Block id="numbers" eyebrow="Key numbers" title="The base network, from the stored run." onShow={() => setCounting(true)}>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <Stat
                        label="Total annual cost"
                        note={baseBasis ? `Network solved before the 12:45 update (${baseBasis.short}); costs recomputed on the organisers' annual basis` : "Organisers' basis, stored run"}
                    >
                        <Tween id="landing-total" value={total} format={usd} from={0} start={counting} duration={1600} />
                    </Stat>
                    <Stat label="Saving vs greedy baseline" note={saving !== null && finite(baseTotal) ? `${pct(saving / baseTotal, 1)} a year, stored run` : 'stored run'}>
                        <Tween id="landing-saving" value={saving} format={usd} from={0} start={counting} duration={1600} />
                    </Stat>
                    <Stat label="Independent audit" note="Stored run, recomputed">
                        <span id="landing-audit">{audit}</span>
                    </Stat>
                    <Stat label="Stored runs" note="Each labelled stored in the planner">
                        <Tween id="landing-runs" value={storedRunCount()} format={int} from={0} start={counting} duration={1200} />
                    </Stat>
                </div>
                <p data-reveal className="mt-6 text-lg text-ink2">
                    Base run: {int(nRef)} {nRef === 1 ? 'refinery' : 'refineries'} and {int(nDep)} {nDep === 1 ? 'depot' : 'depots'}. Status: {base ? statusLabel(base) : MISSING}.
                </p>
            </Block>

            <div className="bg-white">
                <Block id="fails" eyebrow="Where it fails" title="Where we are least sure.">
                    <div className="grid gap-6 text-xl leading-relaxed text-ink3 md:grid-cols-2">
                        <p data-reveal>
                            Two supply sites in Bulungan sit right next to Tarakan airport and far from every other supply site. Tarakan is an island, and the
                            organisers price the last leg as a barge at the same rate as a truck, so we follow that. Pertamina can tell us whether a real barge
                            costs that much.
                        </p>
                        <p data-reveal>
                            Also missing: moisture, seasonality, and any financing cost beyond the organisers&apos; simple annualisation. The tonnages are treated as
                            synthetic, so results show how the method behaves, not where to buy land.
                        </p>
                    </div>
                </Block>
            </div>

            <footer className="mx-auto flex max-w-5xl flex-col items-center gap-5 px-6 py-20 text-center">
                <h2 className="text-[2.2rem] font-semibold tracking-[-0.03em]">See the network for yourself.</h2>
                <a href="#planner" className="rounded-full bg-accent px-7 py-3 text-lg font-medium text-white transition hover:bg-[#0077ed]">
                    Open the planner
                </a>
                <p className="text-base text-ink2">Larpers, Airbus Challenge #3. Everything on this page is read from the stored bundle.</p>
            </footer>
        </div>
    );
}

function Stat({ label, note, children }: { label: string; note: string; children: React.ReactNode }) {
    return (
        <div data-reveal className="card p-6">
            <div className="text-lg text-ink2">{label}</div>
            <div className="num mt-2 text-[2.2rem] font-semibold leading-tight tracking-[-0.03em]">{children}</div>
            <div className="mt-1 text-base text-ink2">{note}</div>
        </div>
    );
}
