'use client';

import type { ReactNode, SVGProps } from 'react';

const base = (d: ReactNode) =>
    function Icon(p: SVGProps<SVGSVGElement>) {
        return (
            <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
                {d}
            </svg>
        );
    };

export const IconFlame = base(<><path d="M12 3c1 3 5 5 5 10a5 5 0 01-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-6 1-9z" /></>);
export const IconDepot = base(<><path d="M4 20V9l8-5 8 5v11" /><path d="M9 20v-6h6v6M3 20h18" /></>);
export const IconPlaneSm = base(<path d="M10 14l-7-3 1-2 8 1 4-6h2l-2 7 5 1 1 2-6 1-3 6h-2l1-6z" />);
export const IconPin = base(<><path d="M12 21s7-6 7-11a7 7 0 10-14 0c0 5 7 11 7 11z" /><circle cx="12" cy="10" r="2.5" /></>);
export const IconNetwork = base(<><circle cx="6" cy="6" r="2.5" /><circle cx="18" cy="8" r="2.5" /><circle cx="12" cy="18" r="2.5" /><path d="M8 7l8 1M7 8l4 8M17 10l-4 6" /></>);
export const IconArrow = base(<path d="M5 12h14M13 6l6 6-6 6" />);
export const IconTrend = base(<><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" /></>);
export const IconBuilding = base(<><path d="M5 21V4h9v17M14 9h5v12M3 21h18" /><path d="M8 8h3M8 12h3M8 16h3" /></>);

/** Decorative landscape: layered mountains, river, mist fading to white on the left. */
export function HeroArt() {
    return (
        <svg viewBox="0 0 640 200" preserveAspectRatio="xMaxYMid slice" className="absolute inset-y-0 right-0 h-full w-[68%]" aria-hidden="true">
            <defs>
                <linearGradient id="ov-sky" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#BFDBFE" />
                    <stop offset="1" stopColor="#EFF6FF" />
                </linearGradient>
                <linearGradient id="ov-mist" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0" stopColor="#fff" stopOpacity="1" />
                    <stop offset="0.45" stopColor="#fff" stopOpacity="0.7" />
                    <stop offset="1" stopColor="#fff" stopOpacity="0" />
                </linearGradient>
                <linearGradient id="ov-haze" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#fff" stopOpacity="0" />
                    <stop offset="1" stopColor="#fff" stopOpacity="0.75" />
                </linearGradient>
                <linearGradient id="ov-river" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0" stopColor="#93C5FD" />
                    <stop offset="1" stopColor="#60A5FA" />
                </linearGradient>
            </defs>
            <rect width="640" height="200" fill="url(#ov-sky)" />
            <path d="M0 120 L70 70 L130 105 L210 40 L290 100 L350 60 L430 110 L520 50 L590 95 L640 70 V200 H0Z" fill="#94A3B8" opacity="0.55" />
            <path d="M0 140 L90 95 L160 125 L250 70 L330 125 L410 85 L500 130 L570 90 L640 120 V200 H0Z" fill="#60A5FA" opacity="0.55" />
            <path d="M0 160 L60 125 L140 150 L230 105 L320 150 L400 120 L480 155 L560 125 L640 150 V200 H0Z" fill="#3B82F6" opacity="0.5" />
            <path d="M0 180 L80 150 L170 175 L260 140 L350 175 L440 150 L540 178 L640 155 V200 H0Z" fill="#16A34A" opacity="0.65" />
            <path d="M0 192 L100 172 L200 190 L300 170 L420 192 L520 175 L640 190 V200 H0Z" fill="#15803D" opacity="0.8" />
            <path d="M380 200 C400 185 360 175 390 160 C420 145 380 140 410 125" stroke="url(#ov-river)" strokeWidth="7" fill="none" strokeLinecap="round" opacity="0.9" />
            <rect y="90" width="640" height="110" fill="url(#ov-haze)" />
            <rect width="640" height="200" fill="url(#ov-mist)" />
        </svg>
    );
}

export function Tile({ tone, children, size = 'lg' }: { tone: 'blue' | 'green' | 'amber' | 'red' | 'orange' | 'violet'; children: ReactNode; size?: 'lg' | 'md' | 'sm' }) {
    const t = {
        blue: 'bg-blue-50 text-primary',
        green: 'bg-green-50 text-success',
        amber: 'bg-amber-50 text-warning',
        red: 'bg-red-50 text-danger',
        orange: 'bg-orange-50 text-orange-600',
        violet: 'bg-violet-50 text-violet-600',
    }[tone];
    const s = { lg: 'h-12 w-12 rounded-xl', md: 'h-10 w-10 rounded-lg', sm: 'h-8 w-8 rounded-lg' }[size];
    return <div className={`flex shrink-0 items-center justify-center ${s} ${t}`}>{children}</div>;
}

export function Kpi({ tone, icon, label, value, children }: { tone: 'blue' | 'green' | 'amber' | 'red' | 'orange' | 'violet'; icon: ReactNode; label: string; value: ReactNode; children?: ReactNode }) {
    return (
        <div className="flex min-w-0 items-center gap-3 rounded-xl border border-line bg-white p-4 shadow-sm">
            <Tile tone={tone}>{icon}</Tile>
            <div className="min-w-0">
                <div className="truncate text-[12.5px] text-muted">{label}</div>
                <div className="num truncate text-[24px] font-bold leading-tight text-deep">{value}</div>
                {children && <div className="mt-0.5 text-[12px] leading-snug text-muted">{children}</div>}
            </div>
        </div>
    );
}

export function OutcomeRow({ ok, children }: { ok: boolean | null; children: ReactNode }) {
    const cls = ok === null ? 'bg-slate-100 text-muted' : ok ? 'bg-green-50 text-success' : 'bg-red-50 text-danger';
    return (
        <li className="flex items-start gap-2.5 text-[13.5px] text-deep">
            <span className={`mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${cls}`} aria-hidden="true">
                {ok === null ? (
                    <span className="text-xs font-bold">–</span>
                ) : ok ? (
                    <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5 9-10" /></svg>
                ) : (
                    <span className="text-xs font-bold">!</span>
                )}
            </span>
            <span className="min-w-0">{children}</span>
        </li>
    );
}
