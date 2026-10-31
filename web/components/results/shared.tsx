'use client';

import { useMemo, useState, type ReactNode } from 'react';

export type SortDir = 'asc' | 'desc';

/** Sort state for simple tables. */
export function useSort<K extends string>(initial: K, dir: SortDir = 'desc') {
    const [state, set] = useState<{ key: K; dir: SortDir }>({ key: initial, dir });
    const toggle = (key: K) => set((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' }));
    return { ...state, toggle };
}

export function sortRows<T>(rows: T[], get: (r: T) => string | number | null, dir: SortDir): T[] {
    return [...rows].sort((a, b) => {
        const x = get(a);
        const y = get(b);
        if (x === y) return 0;
        if (x === null) return 1;
        if (y === null) return -1;
        const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
        return dir === 'asc' ? c : -c;
    });
}

export function Th({ label, k, sort, align = 'left' }: { label: ReactNode; k: string; sort: { key: string; dir: SortDir; toggle: (k: never) => void }; align?: 'left' | 'right' }) {
    const on = sort.key === k;
    return (
        <th className={align === 'right' ? 'text-right' : 'text-left'}>
            <button type="button" onClick={() => sort.toggle(k as never)} className="whitespace-nowrap font-semibold hover:text-primary">
                {label} <span aria-hidden="true" className="text-xs text-muted">{on ? (sort.dir === 'asc' ? '▲' : '▼') : ''}</span>
            </button>
        </th>
    );
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
    return <input className="input w-64" type="search" value={value} placeholder={placeholder} aria-label={placeholder} onChange={(e) => onChange(e.target.value)} />;
}

export function useDebouncedFilter<T>(rows: T[], q: string, text: (r: T) => string): T[] {
    return useMemo(() => {
        const s = q.trim().toLowerCase();
        return s ? rows.filter((r) => text(r).toLowerCase().includes(s)) : rows;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rows, q]);
}
