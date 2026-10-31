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
import FlowSankey from './FlowSankey';

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
        <section ref={ref} id={id} aria-label={eyebrow} className="mx-auto max-w-5xl px-6 py-16 md:py-24">
            <h2 data-reveal className="max-w-3xl text-[2rem] font-semibold leading-[1.1] tracking-[-0.025em] md:text-[2.6rem]">
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
                <div className="absolute inset-0 -z-10 bg-[#05070b]" />
                <HeroScene className="!absolute inset-0 -z-10" />
                <nav className="flex items-center justify-between px-6 py-4 text-base text-white/70 md:px-10">
                    <Logo size={30} tone="light" />
                    <span className="flex flex-wrap items-center gap-x-3">
                        <span className="hidden text-white/85 sm:inline">Kalimantan SAF Network Planner</span>
                        <span aria-hidden="true" className="hidden h-4 w-px bg-white/25 sm:inline-block" />
                        <span>Airbus Challenge #3</span>
                    </span>
                </nav>
                <div ref={hero} className="mx-auto mt-[8vh] max-w-5xl px-6 text-center">
                    <h1 data-hero className="text-[2.3rem] font-semibold leading-[1.06] tracking-[-0.03em] md:text-[3.5rem]">
                        Four airports. Eighty sites.
                        <br />
                        One network, solved.
                    </h1>
                    <p data-hero className="mx-auto mt-5 max-w-2xl text-xl leading-snug text-white/75">
                        Where to put depots and refineries for sustainable aviation fuel, chosen by a solver and checked by an independent audit.
                    </p>
                    <div data-hero className="mt-7 flex flex-wrap items-center justify-center gap-4">
                        <a
                            href="#planner"
                            id="open-planner"
                            className="rounded-lg bg-white px-6 py-2.5 text-lg font-medium text-[#05070b] transition-colors hover:bg-white/85"
                        >
                            Open the planner
                        </a>
                        <a
                            href="#how"
                            onClick={(e) => {
                                e.preventDefault();
                                document.getElementById('how')?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth' });
                            }}
                            className="rounded-lg px-3 py-2.5 text-lg text-white/85 hover:text-white hover:underline"
                        >
                            How it works {'›'}
                        </a>
                    </div>
                </div>
                <div className="mt-auto flex flex-wrap items-center justify-between gap-3 px-6 pb-5 text-base text-white/70 md:px-10">
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
                                <span aria-hidden="true" className="inline-block h-[3px] w-5" style={{ background: LEG_GLOW[leg] }} />
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
                    <div className="grid gap-x-12 gap-y-6 md:grid-cols-2">
                        {STEPS.map(([h, p]) => (
                            <div key={h} data-reveal className="border-t border-line pt-4">
                                <h3 className="text-xl font-semibold tracking-tight">{h}</h3>
                                <p className="mt-1.5 text-lg leading-snug text-ink2">{p}</p>
                            </div>
                        ))}
                    </div>
                    <figure data-reveal className="mt-12 border-t border-line pt-6">
                        <figcaption className="text-lg text-ink2">
                            <span className="font-semibold text-ink">Material flow in the base run, kt per year.</span> Biomass from supply sites through depots to
                            the refinery, SAF on to the four airports. Hover a band for its tonnage.
                        </figcaption>
                        <div className="mt-4 h-[440px]">
                            <FlowSankey solution={base} />
                        </div>
                    </figure>
                </Block>
            </div>

            <Block id="numbers" eyebrow="Key numbers" title="The base network, from the stored run." onShow={() => setCounting(true)}>
                <div className="grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
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
                <a href="#planner" className="rounded-lg bg-accent px-6 py-2.5 text-lg font-medium text-white transition-colors hover:bg-[#115e59]">
                    Open the planner
                </a>
                <p className="text-base text-ink2">Larpers, Airbus Challenge #3. Everything on this page is read from the stored bundle.</p>
            </footer>
        </div>
    );
}

function Stat({ label, note, children }: { label: string; note: string; children: React.ReactNode }) {
    return (
        <div data-reveal className="border-t border-ink/80 pt-4">
            <div className="text-lg text-ink2">{label}</div>
            <div className="num mt-1 text-[2.6rem] font-semibold leading-tight tracking-[-0.03em]">{children}</div>
            <div className="mt-1 text-base leading-snug text-ink2">{note}</div>
        </div>
    );
}
