// Larpers mark: a leaf whose vein is a road route, three stops coloured by leg (biomass, depot, refinery).
export function LogoMark({ size = 32, className = '' }: { size?: number; className?: string }) {
    return (
        <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden="true" focusable="false">
            <rect width="64" height="64" rx="12" fill="#0b1f33" />
            <path d="M13 51C13 29 27 14 52 12C51 37 37 51 13 51Z" fill="#1f9d6b" />
            <path d="M17 47L27 37L37 33L47 18" fill="none" stroke="#071521" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="17" cy="47" r="4" fill="#ffffff" />
            <circle cx="32" cy="35" r="3.4" fill="#e5a00d" stroke="#071521" strokeWidth="1.5" />
            <rect x="43.5" y="14.5" width="7" height="7" rx="1.6" fill="#0ea5c6" stroke="#071521" strokeWidth="1.5" />
        </svg>
    );
}

export default function Logo({ size = 32, tone = 'dark', className = '' }: { size?: number; tone?: 'dark' | 'light'; className?: string }) {
    return (
        <span className={`inline-flex items-center gap-2.5 ${className}`}>
            <LogoMark size={size} />
            <span
                className={`text-[1.15rem] font-semibold leading-none tracking-[-0.02em] ${tone === 'light' ? 'text-white' : 'text-brand-ink'}`}
            >
                Larpers
            </span>
        </span>
    );
}
