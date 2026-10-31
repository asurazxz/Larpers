'use client';

import { useState } from 'react';
import { signInWithGoogle, signOut, useSession } from '../lib/auth';
import { liveEnabled } from '../lib/api';

export interface AuthButtonProps {
    // Called just before the Google redirect; its value is restored with restorePendingInputs().
    getPendingInputs?: () => unknown;
    className?: string;
}

const NO_SOLVE_NOTE = 'Login unlocks no solve on this URL: stored runs only.';

export default function AuthButton({ getPendingInputs, className = '' }: AuthButtonProps) {
    const { status, user, error } = useSession();
    const [busy, setBusy] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);

    const wrap = `flex flex-wrap items-center gap-3 text-base text-ink ${className}`.trim();
    const buttonClass =
        'inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-1.5 text-base font-medium text-ink shadow-thumb transition-colors duration-150 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60';

    if (status === 'disabled') {
        return (
            <div className={wrap}>
                <span className="text-base text-ink2">{liveEnabled ? 'Live solve, no login' : 'Stored runs only, no login'}</span>
            </div>
        );
    }

    if (status === 'loading') {
        return (
            <div className={wrap} aria-busy="true">
                <span className="text-base text-ink2">Checking sign-in…</span>
            </div>
        );
    }

    const handleSignIn = async () => {
        setBusy(true);
        setActionError(null);
        try {
            await signInWithGoogle(getPendingInputs ? getPendingInputs() : undefined);
            // The browser now navigates to Google; keep the button disabled.
        } catch (err) {
            setActionError(err instanceof Error ? err.message : 'Sign-in failed.');
            setBusy(false);
        }
    };

    const handleSignOut = async () => {
        setBusy(true);
        setActionError(null);
        try {
            await signOut();
        } catch (err) {
            setActionError(err instanceof Error ? err.message : 'Sign-out failed.');
        } finally {
            setBusy(false);
        }
    };

    const shownError = actionError ?? error;
    const label = user?.name ?? user?.email ?? 'Signed in';
    const initial = (user?.name ?? user?.email ?? '?').trim().charAt(0).toUpperCase() || '?';

    return (
        <div className={wrap}>
            {status === 'signed_in' && user ? (
                <>
                    <span
                        aria-hidden="true"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-blue-100 text-base font-semibold text-blue-900"
                    >
                        {initial}
                    </span>
                    <span className="max-w-[11rem] truncate text-base" title={user.email ?? undefined}>
                        {label}
                    </span>
                    <button type="button" className={buttonClass} onClick={handleSignOut} disabled={busy}>
                        Sign out
                    </button>
                </>
            ) : (
                <button type="button" className={buttonClass} onClick={handleSignIn} disabled={busy}>
                    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 48 48">
                        <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.2l7.8 6C12.4 13.6 17.7 9.5 24 9.5z" />
                        <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" />
                        <path fill="#FBBC05" d="M10.5 28.8c-.5-1.5-.8-3.1-.8-4.8s.3-3.3.8-4.8l-7.8-6C1 16.5 0 20.1 0 24s1 7.5 2.7 10.8l7.8-6z" />
                        <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.7l-7.8 6C6.6 42.6 14.6 48 24 48z" />
                    </svg>
                    {busy ? 'Redirecting to Google…' : 'Sign in with Google'}
                </button>
            )}
            {!liveEnabled && <span className="text-base text-ink2">{NO_SOLVE_NOTE}</span>}
            {shownError && (
                <span role="alert" className="text-base text-red-700">
                    {shownError}
                </span>
            )}
        </div>
    );
}
