'use client';

import { useState } from 'react';
import NetworkMap from '../map/NetworkMap';
import Inspector from '../network/Inspector';
import { LayersPanel, SearchBox } from '../network/MapOverlays';
import { IconChevron, IconCollapse } from '../common/icons';

export default function NetworkExplorerPage() {
    const [open, setOpen] = useState(true);
    return (
        <div className="flex h-[calc(100vh-64px)] min-w-0">
            <div className="relative min-w-0 flex-1">
                <div className="absolute inset-0">
                    <NetworkMap />
                </div>
                <div className="absolute left-3 top-3 z-[1000] flex flex-col gap-2">
                    <SearchBox />
                    <LayersPanel />
                </div>
                {!open && (
                    <button type="button" onClick={() => setOpen(true)} className="btn-secondary absolute right-3 top-3 z-[1000] flex items-center gap-1 shadow-sm" aria-label="Open inspector">
                        <IconCollapse width={16} height={16} />
                        Inspector
                    </button>
                )}
            </div>
            {open && (
                <aside className="relative w-[380px] shrink-0 overflow-y-auto border-l border-line bg-white" aria-label="Inspector">
                    <div className="flex justify-end border-b border-line px-2 py-1">
                        <button type="button" onClick={() => setOpen(false)} className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted hover:bg-app" aria-label="Collapse inspector">
                            Collapse <IconChevron width={14} height={14} />
                        </button>
                    </div>
                    <Inspector />
                </aside>
            )}
        </div>
    );
}
