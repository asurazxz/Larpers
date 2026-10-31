'use client';

import { useMemo, useState } from 'react';
import NetworkMap, { ALL_LAYERS, type MapLayers } from '../map/NetworkMap';
import Inspector from '../network/Inspector';
import { LayersPanel, SearchBox } from '../network/MapOverlays';
import { IconCollapse, IconLayers } from '../common/icons';
import { useApp } from '../../lib/store';

export default function NetworkExplorerPage() {
    const { solution } = useApp();
    const [open, setOpen] = useState(true);
    const [layersOpen, setLayersOpen] = useState(true);
    const [layers, setLayers] = useState<MapLayers>(ALL_LAYERS);
    const counts = useMemo(() => {
        const fac = solution?.facilities ?? [];
        const flows = solution?.flows ?? [];
        return {
            airports: new Set(flows.filter((f) => f.leg === 'refinery_airport').map((f) => f.to)).size,
            refineries: fac.filter((f) => f.type === 'refinery').length,
            depots: fac.filter((f) => f.type === 'depot').length,
            sitesUsed: new Set(flows.filter((f) => f.leg === 'supply_depot').map((f) => f.from)).size,
        };
    }, [solution]);
    return (
        <div className="flex h-[calc(100vh-64px)] min-w-0">
            <div className="relative min-w-0 flex-1">
                <div className="absolute inset-0">
                    {/* Zoom sits bottom left: the search box and layers panel cover the top-left corner. */}
                    <NetworkMap layers={layers} zoomPosition="bottomleft" popupPaddingTopLeft={[290, 64]} />
                </div>
                <div className="absolute left-3 top-3 z-[1000] flex flex-col gap-2">
                    <SearchBox />
                    {layersOpen && <LayersPanel layers={layers} onChange={setLayers} counts={counts} onClose={() => setLayersOpen(false)} />}
                </div>
                <div className="absolute right-3 top-3 z-[1000] flex flex-col items-end gap-2">
                    {!layersOpen && (
                        <button type="button" onClick={() => setLayersOpen(true)} className="rounded-lg border border-line bg-white p-2 text-deep shadow-md hover:bg-app" aria-label="Open layers panel">
                            <IconLayers width={18} height={18} />
                        </button>
                    )}
                    {!open && (
                        <button type="button" onClick={() => setOpen(true)} className="btn-secondary flex items-center gap-1 shadow-md" aria-label="Open inspector">
                            <IconCollapse width={16} height={16} />
                            Inspector
                        </button>
                    )}
                </div>
            </div>
            {open && (
                <aside className="relative w-[400px] shrink-0 overflow-y-auto border-l border-line bg-white" aria-label="Inspector">
                    <Inspector onClose={() => setOpen(false)} />
                </aside>
            )}
        </div>
    );
}
