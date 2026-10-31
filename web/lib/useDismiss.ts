'use client';

// Closes a popover on Escape or a mousedown outside it, and returns focus to its trigger on Escape.
import { useEffect, useRef, type RefObject } from 'react';

export function useDismiss(
    open: boolean,
    onClose: () => void,
    refs: RefObject<HTMLElement | null>[],
    triggerRef?: RefObject<HTMLElement | null>,
) {
    const closeRef = useRef(onClose);
    closeRef.current = onClose;
    const refsRef = useRef(refs);
    refsRef.current = refs;
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            closeRef.current();
            triggerRef?.current?.focus();
        };
        const onDown = (e: MouseEvent) => {
            const t = e.target as Node | null;
            if (t && refsRef.current.some((r) => r.current?.contains(t))) return;
            closeRef.current();
        };
        document.addEventListener('keydown', onKey);
        document.addEventListener('mousedown', onDown);
        return () => {
            document.removeEventListener('keydown', onKey);
            document.removeEventListener('mousedown', onDown);
        };
    }, [open, triggerRef]);
}
