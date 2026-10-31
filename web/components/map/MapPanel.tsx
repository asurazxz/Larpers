'use client';

// The map card used by Overview and Network Explorer: header, map body, legend. Controls live in the
// header and the legend sits under the map, so nothing floats over the network.
import { useEffect, useRef, type ReactNode } from 'react';
import MapLegend from './MapLegend';

interface Props {
    title: string;
    heading?: 'h1' | 'h2';
    subtitle?: ReactNode;
    actions?: ReactNode;
    className?: string;
    children: ReactNode;
}

export default function MapPanel({ title, heading: Heading = 'h2', subtitle, actions, className = '', children }: Props) {
    const body = useRef<HTMLDivElement>(null);
    // Leaflet only re-measures on window resize, so report panel size changes (inspector, sidebar) as one.
    useEffect(() => {
        const el = body.current;
        if (!el || typeof ResizeObserver === 'undefined') return;
        let frame = 0;
        const observer = new ResizeObserver(() => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
        });
        observer.observe(el);
        return () => {
            cancelAnimationFrame(frame);
            observer.disconnect();
        };
    }, []);
    return (
        <section aria-label={title} className={`flex min-w-0 flex-col rounded-xl border border-line bg-white ${className}`}>
            <header className="relative z-[1100] flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-line px-4 py-2.5">
                <div className="min-w-0">
                    <Heading className="text-[15px] font-semibold leading-5 text-deep">{title}</Heading>
                    {subtitle && <p className="text-[12px] leading-4 text-muted">{subtitle}</p>}
                </div>
                {actions}
            </header>
            <div ref={body} className="relative isolate min-h-[300px] flex-1 overflow-hidden bg-[#fbfbfd]">
                {children}
            </div>
            <MapLegend />
        </section>
    );
}
