# Google sign-in (Supabase Auth)

The admin dashboard signs in with Google through Supabase Auth. Supabase talks to Google; the
frontend only calls `signInWithOAuth`. The Google client secret never goes in frontend code.

| Value | |
| --- | --- |
| Supabase project | `https://cpfymmjjpdmidhtlzgbt.supabase.co` |
| Google redirect URI (cloud) | `https://cpfymmjjpdmidhtlzgbt.supabase.co/auth/v1/callback` |
| Google redirect URI (local stack) | `http://127.0.0.1:54321/auth/v1/callback` |
| App dev URLs | `http://localhost:3000` (Next.js), `http://localhost:5173` (Vite) |

## 1. Google Cloud Console (one person, once)

Open [console.cloud.google.com/auth/overview](https://console.cloud.google.com/auth/overview)
(the **Google Auth Platform**).

1. **Project.** Pick a project in the top bar, or create one (e.g. `Larpers`).
2. **Get started / Branding.** App name (e.g. `Larpers Admin`), user support email, developer
   contact email. Choose audience **External**. Skip the logo: uploading one triggers brand
   verification, which can take days.
3. **Data Access.** *Add or remove scopes* and tick `openid`, `.../auth/userinfo.email` and
   `.../auth/userinfo.profile`. Save. Don't add other scopes; anything sensitive needs a Google review.
4. **Audience.** A new app starts in **Testing**. Pick one:
   - Stay in Testing and add the 4 teammates plus any demo accounts under **Test users** (max 100).
     Google's docs say basic-scope apps may let unlisted accounts through, but don't rely on it:
     plan for unlisted accounts being blocked.
   - Or click **Publish app** (status becomes *In production*). With only the three basic scopes
     above and no logo, no verification is needed, and any Google account can sign in. Strangers
     then become signed-in members (the `authenticated` role), but nobody gets admin unless
     Google has verified their address and it's on the allowlist (section 4). Users can't
     change their own email: the database blocks it, so nobody can move an account onto an
     allowlisted address. So never write a policy that treats "signed in" as "on the team"
     ([RLS.md](RLS.md), template 2).
5. **Clients → Create client.** Application type **Web application**, name e.g. `Supabase`.
   - **Authorized JavaScript origins:** `http://localhost:3000`, `http://localhost:5173`, and
     later the deployed origin (e.g. `https://<your-app>.vercel.app`).
   - **Authorized redirect URIs:**
     `https://cpfymmjjpdmidhtlzgbt.supabase.co/auth/v1/callback` and
     `http://127.0.0.1:54321/auth/v1/callback`.
   - Click **Create**, then copy the **Client ID** and **Client secret** right away. Google only
     shows the secret once; if you lose it, add a new secret to the client and disable the old one.

If the console says a domain isn't authorized, add `cpfymmjjpdmidhtlzgbt.supabase.co` under
**Branding → Authorized domains**. Google changes can take a few minutes to apply.

## 2. Turn Google on in Supabase

`supabase/config.toml` already enables Google and reads the credentials from two env vars. Put
them in **`supabase/.env`** (gitignored), not the root `.env`:

```sh
SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=1234567890-abc.apps.googleusercontent.com
SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET=GOCSPX-...
```

The Supabase CLI (v2.122.0) resolves `env()` values for `config diff`/`config push` only from
`supabase/.env`, `supabase/.env.local` and your shell. It ignores the root `.env`, despite what
the Supabase docs say. `supabase start` reads both. Teammates who only use the cloud project
don't need these vars at all.

### Option A: `config push` (keeps config.toml as the source of truth)

Say in the group chat first, same as `db push`. Then:

```sh
npx supabase config diff    # read-only preview
npx supabase config push    # asks once per service before writing
```

Before you answer `y`, check the diff:

- `auth.external.google.client_id` must show your real ID with `(from env SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID)`.
  If it shows the text `env(SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID)`, stop: the var isn't
  loaded, and pushing would save that literal string as the client ID. An unresolved secret is
  never sent; the CLI prints a `Note:` instead.
- **Push overwrites every cloud setting that config.toml declares and that differs**, not just
  Google. That covers the whole `[auth]` tree (site URL, redirect URLs, email confirmations, OTP,
  rate limits, MFA, SMS, password rules) plus `[api]` and `[storage]`. Settings the file doesn't
  declare are left alone. You approve a whole service at a time (`auth`, `storage`, ...), so you
  can't take the Google change and skip another auth change in the same prompt.
- As of 2026-10-31 the auth diff should contain only these changes, and everything else
  matches the cloud project. If it shows anything more, someone changed config.toml or the
  Dashboard: find out why before pushing.
  - `additional_redirect_urls`: the localhost URLs added
  - email signup: on → **off** (`[auth.email] enable_signup = false`; sign-in is Google-only,
    because admin trusts only Google-verified addresses. See [RLS.md](RLS.md#pitfalls))
  - Google: enabled, with `client_id` (and the secret, if set)
- Answer `n` to **storage**: it would turn on vector buckets (a Pro-plan feature).
- `additional_redirect_urls` replaces the cloud list. A URL added only in the Dashboard is
  removed by the next push, so add deployed URLs to config.toml.

### Option B: Dashboard

**Authentication → Sign In / Providers → Google**: enable it, paste the client ID and secret,
save. Then **Authentication → URL Configuration**: Site URL `http://localhost:3000`, and the
same redirect URLs as `additional_redirect_urls` in config.toml.

This is quicker and has no side effects, but config.toml and the cloud project drift apart.
The next `config push` overwrites Dashboard edits to anything config.toml declares. If you use
the Dashboard, copy the change into config.toml, and run `config diff` before any later push.

### Local stack

`npx supabase start` loads the vars from `supabase/.env`. Without them the stack still starts,
and Google sign-in only fails at Google with `invalid_client`. The auth container reads its
config only at startup, so a restart (`npx supabase stop && npx supabase start`) is needed after
changing them. Check nobody else is using your local stack first.

## 3. Client code

```sh
npm i @supabase/supabase-js @supabase/ssr   # @supabase/ssr is only for Next.js
```

Env vars: `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (Next.js) or
`VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY` (Vite). See `.env.example`.

Every version comes down to this call:

```ts
await supabase.auth.signInWithOAuth({
  provider: 'google',
  options: { redirectTo: `${window.location.origin}/auth/callback` },
})
```

`redirectTo` must match an entry in the redirect allow list (`additional_redirect_urls`, or the
Dashboard's Redirect URLs). Otherwise Supabase silently sends the user to the Site URL instead.

### Next.js (App Router, `@supabase/ssr`)

`lib/supabase/client.ts`:

```ts
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  )
}
```

`lib/supabase/server.ts`:

```ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          } catch {
            // Server Components can't set cookies; proxy.ts refreshes the session instead.
          }
        },
      },
    },
  )
}
```

`lib/supabase/proxy.ts` refreshes the session on every request:

```ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
          Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value))
        },
      },
    },
  )

  // Must come straight after createServerClient, or users get randomly signed out.
  await supabase.auth.getClaims()

  // Return this exact response: it carries the refreshed auth cookies.
  return response
}
```

`proxy.ts` in the project root:

```ts
import type { NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'

// Next.js 16+. On Next.js 15 or older, name the file middleware.ts and the function `middleware`.
export async function proxy(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
```

Sign-in button, e.g. `components/google-sign-in.tsx`:

```tsx
'use client'

import { createClient } from '@/lib/supabase/client'

export function GoogleSignIn({ next = '/admin' }: { next?: string }) {
  async function signIn() {
    await createClient().auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    })
  }

  return <button onClick={signIn}>Sign in with Google</button>
}
```

`app/auth/callback/route.ts` swaps the one-time `code` for a session cookie:

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const nextParam = searchParams.get('next') ?? '/'
  // Same-site paths only, so ?next= can't send users to another domain.
  const next = nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(`${origin}${next}`)
  }

  return NextResponse.redirect(`${origin}/login?error=auth`)
}
```

Sign-out, `app/auth/signout/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  await supabase.auth.signOut()
  return NextResponse.redirect(new URL('/login', request.url), { status: 303 })
}
```

```tsx
<form action="/auth/signout" method="post">
  <button>Sign out</button>
</form>
```

### Vite + React (SPA)

There's no callback route: supabase-js finishes sign-in by itself when the page loads with
`?code=` in the URL.

`src/lib/supabase.ts`:

```ts
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  { auth: { flowType: 'pkce' } },
)
```

`src/App.tsx`:

```tsx
import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [role, setRole] = useState<string | null>(null)

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  // Kept out of onAuthStateChange: awaiting Supabase calls inside that callback can deadlock.
  useEffect(() => {
    if (!session) {
      setRole(null)
      return
    }
    supabase
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => setRole(data?.role ?? null))
  }, [session])

  const signIn = () =>
    supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
  const signOut = () => supabase.auth.signOut()

  if (!session) return <button onClick={signIn}>Sign in with Google</button>
  if (role !== 'admin') return <p>Not an admin. <button onClick={signOut}>Sign out</button></p>
  return <button onClick={signOut}>Sign out</button> // render the dashboard here
}
```

## 4. Admin gate

The database side lives in `supabase/migrations/*_auth_profiles_roles.sql` and
`*_harden_admin_promotion.sql`:

- `public.profiles` has one row per user: `id` (= `auth.users.id`), `email`, `full_name`,
  `avatar_url`, `role` (`public.app_role`: `'admin'` or `'member'`), `created_at`, `updated_at`.
  A trigger creates the row once, at signup, filling name and avatar from Google. Later
  sign-ins don't refresh them: a changed Google name or photo only shows up if the app or user
  updates `full_name`/`avatar_url`.
- Users can read their own row. Admins can read every row.
- Admins come from `private.admin_allowlist`. To make someone admin, run this in the
  Dashboard SQL editor:

  ```sql
  insert into private.admin_allowlist (email) values ('someone@gmail.com');
  ```

  If they haven't signed up yet, their first Google sign-in makes them admin. If they already
  have, the insert promotes them only if the account has no password and its only identities
  are Google identities, verified by Google, for that exact address. Any other account stays
  member; see [RLS.md](RLS.md#making-someone-admin).

  `supabase.auth.updateUser({ email })` is blocked in the database. Otherwise a user could
  move their own Google account onto an allowlisted address and absorb the teammate's Google
  identity when the teammate signs in. GoTrue still sends two confirmation mails before the
  database refuses, but their links don't work. Admins can still change a user's email via
  the admin API or the SQL editor.

  To revoke, delete the row; that demotes the user with that email. Then run
  `select id, email from public.profiles where role = 'admin';` and demote anyone they promoted
  meanwhile. The role is read from the table on each request, not stored in the login token,
  so changes apply without signing out.

To check the role, select `role` from `profiles` where `id = user.id`. A Next.js server-side
guard, `lib/auth/require-admin.ts`:

```ts
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function requireAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'admin') redirect('/')

  return { supabase, user }
}
```

`app/admin/layout.tsx`:

```tsx
import { requireAdmin } from '@/lib/auth/require-admin'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin()
  return <>{children}</>
}
```

Layouts don't run for Server Actions or Route Handlers, so call `requireAdmin()` at the top of
those too.

**UI gating is cosmetic. RLS is the real enforcement.** Anyone can call the Supabase API
directly with the publishable key and their own session, skipping your UI and your
`requireAdmin()`. What they can read or change is decided only by the RLS policies on each
table. For new tables, see [RLS.md](RLS.md).

## Troubleshooting

- **`Error 400: redirect_uri_mismatch`.** The error page shows the `redirect_uri` Google
  received. It must exactly match an *Authorized redirect URI* on the Google client. That URI
  is Supabase's callback, not your app's `/auth/callback`:
  `https://cpfymmjjpdmidhtlzgbt.supabase.co/auth/v1/callback` for cloud, or
  `http://127.0.0.1:54321/auth/v1/callback` for the local stack (`127.0.0.1`, `http`, no
  trailing slash). Wait a few minutes after editing the client.
- **"Access blocked: … has not completed the Google verification process" / `403 access_denied`
  (app in testing).** The account isn't a test user. Add it under **Audience → Test users**, or
  click **Publish app**. If publishing asks for verification, remove the logo and any extra
  scopes.
- **`invalid_client` / "The OAuth client was not found".** Supabase sent an empty or wrong
  client ID. Locally: the vars weren't in `supabase/.env` when the stack started. On cloud:
  check the provider in the Dashboard, or whether a push saved the literal `env(...)` text.
- **Deployed site sends you to `localhost:3000` after sign-in.** The `redirectTo` URL isn't in
  the redirect allow list, so Supabase fell back to the Site URL. Add
  `https://<your-app>.vercel.app/**` (previews: `https://*-<team>.vercel.app/**`) to
  `additional_redirect_urls` and push, or add it in **Authentication → URL Configuration**.
  Also add the deployed origin to the Google client's JavaScript origins.
- **Signed in, but the session vanishes or the callback fails ("code verifier" / "flow state"
  errors).** `localhost` and `127.0.0.1` are different sites to the browser: cookies and
  localStorage aren't shared. Sign-in saves a one-time verifier on the origin you started from,
  so the redirect must return to that same origin. Always open the app as
  `http://localhost:3000` or `:5173`, and build `redirectTo` from `window.location.origin`.
- **Signed in, but not admin.** The allowlist email must match the Google address exactly
  (`john.doe@gmail.com` ≠ `johndoe@gmail.com`). Compare with
  `select email, role from public.profiles;` in the SQL editor. If it matches, **don't
  re-add the row or promote by hand yet**. First run
  `select provider, email from auth.identities where user_id = '<profile id>';`.
  Only continue if the single identity is `google` with exactly their address. Anything else
  (an `email` identity, a second Google account) means someone else may control the account:
  delete it in **Authentication → Users** and have them sign in with Google again
  ([RLS.md](RLS.md#making-someone-admin)).
