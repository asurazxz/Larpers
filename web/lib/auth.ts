// Google sign-in through Supabase Auth (PKCE), client-side only.
import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { authEnabled, getSupabase } from './supabase';

// Token helpers live in supabase.ts so api.ts can use them without importing React.
export { authEnabled, getAccessToken, refreshAccessToken } from './supabase';

export type SessionStatus = 'loading' | 'disabled' | 'signed_out' | 'signed_in';

export interface SessionUser {
    id: string;
    email: string | null;
    name: string | null;
    avatarUrl: string | null;
}

export interface SessionState {
    status: SessionStatus;
    user: SessionUser | null;
    // Set when Google or Supabase sent back an error, or the code exchange failed.
    error: string | null;
}

// Query params Supabase or Google may leave on the return URL.
const CALLBACK_PARAMS = ['code', 'sb_flow_id', 'state', 'error', 'error_code', 'error_description'];

const PENDING_KEY = 'larpers.pendingScenario.v1';
const PENDING_MAX_AGE_MS = 60 * 60 * 1000;


function toUser(session: Session | null): SessionUser | null {
    if (!session) {
        return null;
    }
    const meta = (session.user.user_metadata ?? {}) as Record<string, unknown>;
    const pick = (...keys: string[]): string | null => {
        for (const key of keys) {
            const value = meta[key];
            if (typeof value === 'string' && value.trim()) {
                return value.trim();
            }
        }
        return null;
    };
    return {
        id: session.user.id,
        email: session.user.email ?? pick('email'),
        name: pick('full_name', 'name'),
        avatarUrl: pick('avatar_url', 'picture'),
    };
}

function readCallbackError(): string | null {
    if (typeof window === 'undefined') {
        return null;
    }
    const url = new URL(window.location.href);
    const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
    const description =
        url.searchParams.get('error_description') ?? hash.get('error_description');
    const code = url.searchParams.get('error') ?? hash.get('error');
    if (!description && !code) {
        return null;
    }
    return description ?? code;
}

// Removes OAuth leftovers (?code=, ?error=...) from the address bar without a reload.
export function cleanAuthParamsFromUrl(): void {
    if (typeof window === 'undefined') {
        return;
    }
    const url = new URL(window.location.href);
    let changed = false;
    for (const key of CALLBACK_PARAMS) {
        if (url.searchParams.has(key)) {
            url.searchParams.delete(key);
            changed = true;
        }
    }
    if (url.hash && /(^#|&)(error|error_description|access_token)=/.test(url.hash)) {
        url.hash = '';
        changed = true;
    }
    if (changed) {
        window.history.replaceState(window.history.state, '', url.toString());
    }
}

// ---------- Pending scenario inputs (survive the Google round trip) ----------

export function savePendingInputs<T>(inputs: T): void {
    try {
        window.sessionStorage.setItem(
            PENDING_KEY,
            JSON.stringify({ savedAt: Date.now(), inputs }),
        );
    } catch {
        // Storage blocked or full: the user re-enters inputs, nothing else breaks.
    }
}

export function peekPendingInputs<T>(): T | null {
    try {
        const raw = window.sessionStorage.getItem(PENDING_KEY);
        if (!raw) {
            return null;
        }
        const parsed = JSON.parse(raw) as { savedAt?: number; inputs?: T };
        if (typeof parsed.savedAt !== 'number' || Date.now() - parsed.savedAt > PENDING_MAX_AGE_MS) {
            return null;
        }
        return parsed.inputs ?? null;
    } catch {
        return null;
    }
}

export function clearPendingInputs(): void {
    try {
        window.sessionStorage.removeItem(PENDING_KEY);
    } catch {
        // ignore
    }
}

// Returns the inputs saved before sign-in (once), then clears them.
export function restorePendingInputs<T>(): T | null {
    const inputs = peekPendingInputs<T>();
    clearPendingInputs();
    return inputs;
}

// ---------- Actions ----------

// Redirects to Google. Pass the current scenario inputs to keep them across the round trip.
export async function signInWithGoogle(pendingInputs?: unknown): Promise<void> {
    const supabase = await getSupabase();
    if (!supabase) {
        throw new Error('Sign-in is not available here (stored runs only).');
    }
    if (pendingInputs !== undefined) {
        savePendingInputs(pendingInputs);
    }
    const redirectTo = window.location.origin + window.location.pathname;
    const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo },
    });
    if (error) {
        throw error;
    }
}

export async function signOut(): Promise<void> {
    const supabase = await getSupabase();
    if (!supabase) {
        return;
    }
    // 'local' signs out this browser only; it does not need the network to succeed.
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) {
        throw error;
    }
}

// ---------- Hook ----------

export function useSession(): SessionState {
    const [state, setState] = useState<SessionState>({
        status: 'loading',
        user: null,
        error: null,
    });

    useEffect(() => {
        if (!authEnabled) {
            setState({ status: 'disabled', user: null, error: null });
            return;
        }
        let cancelled = false;
        let unsubscribe: (() => void) | null = null;
        const callbackError = readCallbackError();

        getSupabase()
            .then(async (supabase) => {
                if (cancelled) {
                    return;
                }
                if (!supabase) {
                    setState({ status: 'disabled', user: null, error: null });
                    return;
                }
                // initialize() resolves after supabase-js has exchanged any ?code= (PKCE).
                const init = await supabase.auth.initialize();
                const { data } = await supabase.auth.getSession();
                cleanAuthParamsFromUrl();
                if (cancelled) {
                    return;
                }
                const user = toUser(data.session);
                setState({
                    status: user ? 'signed_in' : 'signed_out',
                    user,
                    error: user ? null : (callbackError ?? init.error?.message ?? null),
                });
                const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
                    // Only set state here: awaiting other auth calls inside this callback deadlocks.
                    const next = toUser(session);
                    setState({ status: next ? 'signed_in' : 'signed_out', user: next, error: null });
                });
                unsubscribe = () => sub.subscription.unsubscribe();
                if (cancelled) {
                    unsubscribe();
                }
            })
            .catch((err: unknown) => {
                if (!cancelled) {
                    const message = err instanceof Error ? err.message : 'Sign-in failed to load.';
                    setState({ status: 'signed_out', user: null, error: message });
                }
            });

        return () => {
            cancelled = true;
            if (unsubscribe) {
                unsubscribe();
            }
        };
    }, []);

    return state;
}
