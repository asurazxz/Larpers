'use client';

// The one network map, shared by Overview and Network Explorer. It wraps app/Map.tsx unchanged so
// basemap and OSRM route-geometry work in Map.tsx flows through to every page with no edits here.
import dynamic from 'next/dynamic';
import { useApp } from '../../lib/store';
import { sites } from '../../lib/bundle';

const SafMap = dynamic(() => import('../../app/Map'), {
    ssr: false,
    loading: () => <div className="flex h-full items-center justify-center text-sm text-muted">Loading map…</div>,
});

export default function NetworkMap({ interactive = true }: { interactive?: boolean }) {
    const app = useApp();
    return (
        <SafMap
            solution={app.solution}
            sites={sites}
            highlight={app.highlight}
            bandFor={app.bandFor}
            basemap={app.basemap}
            onSelectFlow={interactive ? (flow, index) => app.selectFlow({ flow, index }) : undefined}
            onSelectNode={interactive ? (id) => app.selectNode(id) : undefined}
        />
    );
}
