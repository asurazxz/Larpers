// Minimal outline icons (24x24, stroke currentColor). No icon dependency.
import type { SVGProps } from 'react';

const base = (d: React.ReactNode) =>
    function Icon(p: SVGProps<SVGSVGElement>) {
        return (
            <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
                {d}
            </svg>
        );
    };

export const IconHome = base(<><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /></>);
export const IconMap = base(<><path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2z" /><path d="M9 4v14M15 6v14" /></>);
export const IconSliders = base(<><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></>);
export const IconChart = base(<><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>);
export const IconShield = base(<><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z" /><path d="M9 12l2 2 4-4" /></>);
export const IconDollar = base(<><path d="M12 2v20" /><path d="M17 6H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" /></>);
export const IconFactory = base(<><path d="M3 21V10l6 4V10l6 4V4h6v17H3z" /></>);
export const IconTruck = base(<><path d="M3 6h11v10H3zM14 10h4l3 3v3h-7" /><circle cx="7" cy="18" r="1.8" /><circle cx="17" cy="18" r="1.8" /></>);
export const IconCheck = base(<><circle cx="12" cy="12" r="9" /><path d="M8 12l3 3 5-6" /></>);
export const IconChevron = base(<path d="M9 6l6 6-6 6" />);
export const IconCollapse = base(<path d="M15 6l-6 6 6 6" />);
export const IconPlane = base(<path d="M10 14l-7-3 1-2 8 1 4-6h2l-2 7 5 1 1 2-6 1-3 6h-2l1-6z" />);
export const IconLayers = base(<><path d="M12 3l9 5-9 5-9-5 9-5z" /><path d="M3 13l9 5 9-5" /></>);
export const IconClose = base(<path d="M6 6l12 12M18 6L6 18" />);
export const IconSearch = base(<><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></>);
export const IconBell = base(<><path d="M6 8a6 6 0 0112 0c0 7 3 8 3 8H3s3-1 3-8" /><path d="M10 20a2 2 0 004 0" /></>);
export const IconGear = base(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" /></>);
export const IconHelp = base(<><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 015 .5c0 1.5-2.5 2-2.5 3.5M12 17h.01" /></>);
export const IconChevronDown = base(<path d="M6 9l6 6 6-6" />);
export const IconCheckCircle = (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" width={15} height={15} aria-hidden="true" {...p}>
        <circle cx="12" cy="12" r="10" fill="currentColor" />
        <path d="M7.5 12.5l3 3 6-6.5" stroke="#fff" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);
export const IconBolt = base(<path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />);
