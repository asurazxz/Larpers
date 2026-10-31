'use client';

// The map key, always on screen under the map so it never covers the network. Colours and marker
// shapes copy app/Map.tsx. Line styles copy lib/routes.ts piece kinds.
import type { ReactNode } from 'react';
import { useApp } from '../../lib/store';
import { LEG_COLOR } from '../heroNetwork';

export type GlyphKind = 'airport' | 'refinery' | 'depot' | 'site' | 'stranded';

/** One map marker at legend size, so a row of text can name what the map draws. */
export function FacilityGlyph({ kind }: { kind: GlyphKind }) {
    if (kind === 'airport') {
        return <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-deep bg-white text-[10px] leading-none text-deep" aria-hidden="true">&#9992;</span>;
    }
    if (kind === 'refinery') return <span className="h-3.5 w-3.5 shrink-0 rounded-[3px] border-2 border-[#075e70] bg-[#0ea5c6]" aria-hidden="true" />;
    if (kind === 'depot') return <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-[#8a5a00] bg-[#f0a30a]" aria-hidden="true" />;
    if (kind === 'site') return <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#2f9e4f]" aria-hidden="true" />;
    return <span className="h-3.5 w-3.5 shrink-0 rounded-full border-2 border-dashed border-[#c0392b]" aria-hidden="true" />;
}

function Line({ color, dash, width = 3 }: { color: string; dash?: string; width?: number }) {
    return (
        <svg width={26} height={8} viewBox="0 0 26 8" className="shrink-0" aria-hidden="true">
            <line x1="1" y1="4" x2="25" y2="4" stroke={color} strokeWidth={width} strokeDasharray={dash} />
        </svg>
    );
}

function Item({ mark, children }: { mark: ReactNode; children: ReactNode }) {
    return (
        <li className="flex items-center gap-1.5 whitespace-nowrap">
            {mark}
            {children}
        </li>
    );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="flex items-start gap-3">
            <div className="w-[62px] shrink-0 text-muted">{label}</div>
            <ul className="flex min-w-0 flex-wrap items-center gap-x-3.5 gap-y-0.5">{children}</ul>
        </div>
    );
}

export default function MapLegend() {
    const { solution } = useApp();
    const stranded = (solution?.stranded.length ?? 0) > 0;
    return (
        <div role="group" aria-label="Map legend" className="space-y-1 border-t border-line px-4 py-2 text-[12px] leading-[18px] text-deep">
            <Row label="Legs">
                <Item mark={<Line color={LEG_COLOR.supply_depot} />}>Site → Depot</Item>
                <Item mark={<Line color={LEG_COLOR.depot_refinery} />}>Depot → Refinery</Item>
                <Item mark={<Line color={LEG_COLOR.refinery_airport} />}>Refinery → Airport</Item>
            </Row>
            <Row label="Facilities">
                <Item mark={<FacilityGlyph kind="airport" />}>Airport</Item>
                <Item mark={<FacilityGlyph kind="refinery" />}>Refinery</Item>
                <Item mark={<FacilityGlyph kind="depot" />}>Depot</Item>
                <Item mark={<FacilityGlyph kind="site" />}>Collection site</Item>
                {stranded && <Item mark={<FacilityGlyph kind="stranded" />}>Stranded site</Item>}
            </Row>
            <Row label="Line style">
                <Item mark={<Line color="#475569" />}>Road route</Item>
                <Item mark={<Line color="#475569" dash="5 3" />}>Barge to Tarakan</Item>
                <Item mark={<Line color="#94A3B8" dash="3 3" width={2} />}>No stored route</Item>
            </Row>
            <p className="text-muted">Lines follow OpenStreetMap roads for display. Cost uses straight-line km × road factor.</p>
        </div>
    );
}
