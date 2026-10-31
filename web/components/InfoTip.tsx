'use client';

// Hover/focus help for an input. Rendered in a portal with fixed positioning so the
// scrolling right column and animated (transformed) cards cannot clip it.
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const WIDTH = 300;

export default function InfoTip({ label, children }: { label: string; children: ReactNode }) {
    const id = useId();
    const btn = useRef<HTMLButtonElement>(null);
    const [pos, setPos] = useState<{ top: number; left: number; above: boolean } | null>(null);

    const show = () => {
        const r = btn.current?.getBoundingClientRect();
        if (!r) return;
        const above = r.bottom + 180 > window.innerHeight;
        const left = Math.min(Math.max(8, r.left + r.width / 2 - WIDTH / 2), window.innerWidth - WIDTH - 8);
        setPos({ top: above ? r.top - 8 : r.bottom + 8, left, above });
    };
    const hide = () => setPos(null);

    useEffect(() => {
        if (!pos) return;
        const onKey = (e: KeyboardEvent) => e.key === 'Escape' && hide();
        window.addEventListener('keydown', onKey);
        window.addEventListener('scroll', hide, true);
        return () => {
            window.removeEventListener('keydown', onKey);
            window.removeEventListener('scroll', hide, true);
        };
    }, [pos]);

    return (
        <>
            <button
                ref={btn}
                type="button"
                aria-label={`About ${label}`}
                aria-describedby={pos ? id : undefined}
                className="ml-1.5 inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border border-ink3 align-[-2px] text-[12px] font-semibold leading-none text-ink2 transition-colors hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                onMouseEnter={show}
                onMouseLeave={hide}
                onFocus={show}
                onBlur={hide}
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    show();
                }}
            >
                i
            </button>
            {pos &&
                createPortal(
                    <div
                        id={id}
                        role="tooltip"
                        style={{ position: 'fixed', top: pos.top, left: pos.left, width: WIDTH, transform: pos.above ? 'translateY(-100%)' : undefined }}
                        className="pointer-events-none z-[2000] rounded-2xl bg-[#1d1d1f]/95 px-4 py-3 text-base font-normal leading-snug text-white shadow-lg backdrop-blur"
                    >
                        <div className="mb-1 font-semibold">{label}</div>
                        <div className="text-white/85">{children}</div>
                    </div>,
                    document.body,
                )}
        </>
    );
}

export const INPUT_HELP = {
    demand: 'SAF each airport must receive per year, in kilotonnes. The organisers set 300 kt at each of PNK (Pontianak), PKN (Pangkalan Bun), BPN (Balikpapan) and TRK (Tarakan). Leave all four blank to use the solver default.',
    yield: 'Tonnes of SAF made per tonne of biomass entering a refinery. The organisers use 20%, inside the 15–25% range for biomass-to-jet routes. Higher yield needs less biomass and fewer or smaller refineries.',
    road: 'Multiplier on straight-line distance to approximate road distance; transport cost is tonnes × km × USD/t/km. The organisers use 1.3; 1.9 is what we measured on real roads, shown as a sensitivity.',
    horizon: 'Years the annual cost is multiplied by for the reported total. Every cost is already per year (CapEx spread over 20 years), so the horizon scales the total but does not change which network is chosen.',
    collection: '"All biomass" forces every supply site to be collected. "Optional" lets the solver skip sites; the organisers allow this, since 1,200 kt of SAF at 20% yield needs 6,000 of the 6,800 kt available.',
    capacity: 'What a facility\'s capacity measures. The organisers define it as biomass intake (kt of biomass per year) for both depots and refineries; "SAF output" measures refineries by fuel produced instead.',
    excluded: 'Sites the solver may not use for a depot or refinery, for example land unavailable at design stage. Their biomass can still be collected. Click a chip to remove it, or tick "pick on map" and click a facility.',
} as const;
