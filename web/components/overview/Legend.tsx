'use client';

// Compact key for the Overview map preview. Colours match NetworkMap and the Network Explorer legend.
import type { ReactNode } from 'react';

const LEGS = [
    { color: '#2f9e4f', label: 'Supply to depot' },
    { color: '#e5a00d', label: 'Depot to refinery' },
    { color: '#0ea5c6', label: 'Refinery to airport' },
];

function Item({ children, label }: { children: ReactNode; label: string }) {
    return (
        <li className="flex items-center gap-1.5">
            <svg width={18} height={14} viewBox="0 0 18 14" aria-hidden="true" className="shrink-0">{children}</svg>
            <span>{label}</span>
        </li>
    );
}

export default function Legend() {
    return (
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-muted" aria-label="Map legend">
            {LEGS.map((l) => (
                <Item key={l.label} label={l.label}>
                    <line x1={1} y1={7} x2={17} y2={7} stroke={l.color} strokeWidth={3} strokeLinecap="round" />
                </Item>
            ))}
            <Item label="Tarakan barge">
                <line x1={1} y1={7} x2={17} y2={7} stroke="#0ea5c6" strokeWidth={2.5} strokeDasharray="4 3" />
            </Item>
            <Item label="Depot"><circle cx={9} cy={7} r={5} fill="#f59e0b" stroke="#fff" strokeWidth={1.5} /></Item>
            <Item label="Refinery"><rect x={4} y={2} width={10} height={10} fill="#0ea5c6" stroke="#fff" strokeWidth={1.5} /></Item>
            <Item label="Airport"><text x={9} y={12} textAnchor="middle" fontSize={13} fill="#1e3a8a">✈</text></Item>
            <Item label="Collection site"><circle cx={9} cy={7} r={3.5} fill="#2f9e4f" /></Item>
            <Item label="Offshore site"><circle cx={9} cy={7} r={3.5} fill="none" stroke="#2f9e4f" strokeWidth={1.5} /></Item>
            <Item label="Stranded supply"><circle cx={9} cy={7} r={5} fill="none" stroke="#dc2626" strokeWidth={1.5} strokeDasharray="2.5 2" /></Item>
        </ul>
    );
}
