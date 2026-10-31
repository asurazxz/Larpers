// Browser-only Supabase client, used for Google login and nothing else (no table reads).
// The app is a static export, so there is no server, middleware or API route here.
import type { SupabaseClient } from '@supabase/supabase-js';

// Literal process.env references so Next inlines them at build time.
const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
const SUPABASE_PUBLISHABLE_KEY = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '').trim();

export const authConfigured = SUPABASE_URL.length > 0 && SUPABASE_PUBLISHABLE_KEY.length > 0;

// OAuth cannot redirect back to file://, so the Level 4 fallback runs with no login.
const onFileProtocol = typeof window !== 'undefined' && window.location.protocol === 'file:';

export const authEnabled = authConfigured && !onFileProtocol;

let clientPromise: Promise<SupabaseClient> | null = null;

// Lazily imports and constructs the client once. Returns null when auth is disabled,
// in which case @supabase/supabase-js is never loaded.
export function getSupabase(): Promise<SupabaseClient | null> {
    if (!authEnabled || typeof window === 'undefined') {
        return Promise.resolve(null);
    }
    if (!clientPromise) {
        clientPromise = import('@supabase/supabase-js').then(({ createClient }) =>
            createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
                auth: {
                    flowType: 'pkce',
                    detectSessionInUrl: true,
                    persistSession: true,
                    autoRefreshToken: true,
                },
            }),
        );
        clientPromise.catch(() => {
            clientPromise = null;
        });
    }
    return clientPromise;
}

// Refresh a little before expiry so a 90 s solve never starts with a dying token.
const EXPIRY_MARGIN_MS = 60 * 1000;

// Current access token, refreshed first if it is expired or about to expire. Null if signed out.
export async function getAccessToken(): Promise<string | null> {
    const supabase = await getSupabase();
    if (!supabase) {
        return null;
    }
    const { data } = await supabase.auth.getSession();
    const session = data.session;
    if (!session) {
        return null;
    }
    const expiresAtMs = (session.expires_at ?? 0) * 1000;
    if (expiresAtMs && expiresAtMs - Date.now() < EXPIRY_MARGIN_MS) {
        return refreshAccessToken();
    }
    return session.access_token;
}

// Forces a refresh with the stored refresh token. Null if there is no session to refresh.
export async function refreshAccessToken(): Promise<string | null> {
    const supabase = await getSupabase();
    if (!supabase) {
        return null;
    }
    try {
        const { data, error } = await supabase.auth.refreshSession();
        if (error || !data.session) {
            return null;
        }
        return data.session.access_token;
    } catch {
        return null;
    }
}
