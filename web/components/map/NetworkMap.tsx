'use client';

// The one network map, shared by Overview and Network Explorer. It wraps app/Map.tsx unchanged, so the Esri
// basemap and the OSRM road geometry in Map.tsx reach every page with no edits here.
// The optional `layers` prop hides parts of a COPY of the solution before it reaches the map.
import dynamic from 'next/dynamic';
import { useCallback, useMemo } from 'react';
import { useApp } from '../../lib/store';
import { sites } from '../../lib/bundle';
import type { Flow, Leg } from '../../lib/contract';
import type { ControlPosition } from 'leaflet';

const SafMap = dynamic(() => import('../../app/Map'), {
    ssr: false,
    loading: () => <div className="flex h-full items-center justify-center text-sm text-muted">Loading map…</div>,
});

/**
 * Layer visibility. Map.tsx draws airports from the run's refinery to airport flow ends, so
 * `airports` and `legs.refinery_airport` are one switch: hiding either hides both the airport markers
 * and those lines.
 */
export interface MapLayers {
    airports: boolean;
    refineries: boolean;
    depots: boolean;
    sites: boolean;
    legs: Record<Leg, boolean>;
}

export const ALL_LAYERS: MapLayers = {
    airports: true,
    refineries: true,
    depots: true,
    sites: true,
    legs: { supply_depot: true, depot_refinery: true, refinery_airport: true },
};

export default function NetworkMap({
    interactive = true,
    layers,
    zoomPosition,
}: {
    interactive?: boolean;
    layers?: MapLayers;
    /** Corner for the zoom +/- buttons; omitted keeps Leaflet's default (top left). */
    zoomPosition?: ControlPosition;
}) {
    const app = useApp();
    const { solution } = app;

    const shown = useMemo(() => {
        if (!layers || !solution) return solution;
        const flows = solution.flows.filter((f) => layers.legs[f.leg] && (f.leg !== 'refinery_airport' || layers.airports));
        const facilities = solution.facilities.filter((f) => (f.type === 'refinery' ? layers.refineries : layers.depots));
        return { ...solution, flows, facilities };
    }, [solution, layers]);

    // Map reports an index into the filtered flows; the app wants the index in the full run.
    const selectFlow = useCallback(
        (flow: Flow, index: number) => {
            const full = solution ? solution.flows.indexOf(flow) : -1;
            app.selectFlow({ flow, index: full >= 0 ? full : index });
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [solution, app.selectFlow],
    );

    return (
        <SafMap
            solution={shown}
            sites={layers && !layers.sites ? [] : sites}
            highlight={app.highlight}
            bandFor={app.bandFor}
            feed={app.feed}
            onSelectFlow={interactive ? selectFlow : undefined}
            onSelectNode={interactive ? (id) => app.selectNode(id) : undefined}
            zoomPosition={zoomPosition}
        />
    );
}
