'use client';

// anime.js helpers. Every tween ends by handing the text back to format(value), so the final string is exact.
import { animate } from 'animejs';
import { useEffect, useRef, useState } from 'react';

export function reducedMotion(): boolean {
    return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Tweens between successive values; shows format(value) at rest. `from` starts the first tween (count-up). */
export function Tween({
    value,
    format,
    from,
    start = true,
    duration = 700,
    id,
    className,
}: {
    value: number | null | undefined;
    format: (v: number | null | undefined) => string;
    from?: number;
    start?: boolean;
    duration?: number;
    id?: string;
    className?: string;
}) {
    const [text, setText] = useState<string | null>(null);
    const prev = useRef<number | null | undefined>(from);
    useEffect(() => {
        if (!start) return;
        const a = prev.current;
        prev.current = value;
        if (!finite(a) || !finite(value) || a === value || reducedMotion()) {
            setText(null);
            return;
        }
        const o = { v: a };
        const anim = animate(o, {
            v: value,
            duration,
            ease: 'outExpo',
            onUpdate: () => setText(format(o.v)),
            onComplete: () => setText(null),
        });
        return () => {
            anim.pause();
            setText(null);
        };
        // format is a stable module function at every call site
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value, start, duration]);
    return (
        <span id={id} className={className}>
            {text ?? format(value)}
        </span>
    );
}
