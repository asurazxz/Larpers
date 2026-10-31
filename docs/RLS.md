# Row Level Security (RLS) guide

How to add tables without leaking data. The auth layer itself lives in
`supabase/migrations/*_auth_profiles_roles.sql` and `*_harden_admin_promotion.sql`; its tests are in
`supabase/tests/database/auth_profiles_roles.test.sql`.

## What already exists

| Object | Purpose |
| --- | --- |
| `public.profiles` | One row per auth user: `id`, `email`, `full_name` (max 200 chars), `avatar_url` (`https://` only), `role`, timestamps. Created once at signup. |
| `public.app_role` | Enum: `'admin'`, `'member'`. |
| `private.admin_allowlist` | Emails that get admin. SQL editor only; the API can't see it. |
| `private.is_admin()` | `true` if the signed-in user is an admin. Use it in policies. |
| `private.set_updated_at()` | Trigger function that keeps `updated_at` current. |
| Event trigger | New tables created in `public` get RLS enabled automatically, with [gaps](#pitfalls). |

Users can read and update only their own profile's `full_name` and `avatar_url`. Admins can
read all profiles and change other users' roles. Nobody can change `email`, `id` or
`created_at` through the API, and only admins can change `role`.

## Making someone admin

Sign-in is Google-only (email signup is disabled in `supabase/config.toml`). Admin is granted
only when Google has proven the person owns an allowlisted address. Run this in the SQL editor:

```sql
insert into private.admin_allowlist (email) values ('teammate@gmail.com');
```

- **Before they sign up:** their first Google sign-in makes them admin.
- **After they signed up:** the insert promotes them only if the account's email is confirmed,
  it has no password, and its **only** identities are Google identities, verified by Google,
  for that exact address. Accounts with an email/password, magic-link or second Google
  identity are never promoted.
- Emails are lowercased and trimmed automatically.
- **Self-service email changes are blocked in the database.** `supabase.auth.updateUser({ email })`
  fails, even with the email provider off. Otherwise someone could sign in with their own
  Google account, move it to a teammate's address, and absorb the teammate's Google identity
  when they sign in. The admin API and the SQL editor can still set `auth.users.email`
  directly. GoTrue still sends the two "confirm email change" mails before the database
  refuses the change, but their links are dead.
- Admins can also promote and demote people from the dashboard (`update profiles set role = ...`).
  Beyond that, the allowlist acts at signup, when a row is added or removed, and when a user's
  email changes. It never undoes a dashboard change at any other time.
- Changing a user's email never promotes them. Moving away from an allowlisted address demotes
  them.
- Don't commit real emails in migrations or `seed.sql`. This repo may become public.

**If an allowlisted person is still `member`**, don't just re-add the row or promote them.
Check every identity on the account first:

```sql
select provider, email from auth.identities where user_id = '<profile id>';
```

Only go ahead if the single identity is `google` with exactly their address. Anything else
(an `email` identity, a second Google account) means someone else may control the account.
Delete it in **Authentication → Users** and have them sign in with Google again.

**Revoking admin** takes two steps. Deleting the row demotes the user with that email:

```sql
delete from private.admin_allowlist where email = 'teammate@gmail.com';
select id, email from public.profiles where role = 'admin';   -- then check for leftovers
```

It doesn't touch admins they promoted from the dashboard, so demote any leftovers by hand:
`update public.profiles set role = 'member' where id = '...';`.

**Last admin.** Through the API (the dashboard), an admin can't demote the last remaining
admin, themselves included. Everything else skips this check and can leave zero admins:
- the SQL editor and the secret key
- deleting an allowlist row
- a demotion triggered by an email change
- deleting the last admin's auth user

To recover, run the identity check above on the account, then promote it in the SQL editor:
`update public.profiles set role = 'admin' where id = '<profile id>';`.

To check the role in the frontend, read the user's own profile:
`supabase.from('profiles').select('role').eq('id', user.id).single()`.
Hiding admin UI is only cosmetic. RLS is what actually protects the data.

## Adding a table

1. `npx supabase migration new add_<thing>` and write the table.
2. RLS is enabled for you, and with no policies the API sees **nothing**. If your table
   returns `[]`, you haven't added a policy yet.
3. Pick a template below. Write `alter table ... enable row level security` anyway so the
   intent is visible.
4. Index every column your policies filter on (usually `user_id`).
5. Run `npx supabase test db`. The invariant test fails if any table in `public` lacks RLS.

`<table>` is a placeholder in every template.

### 1. Owner-only rows

```sql
create table public.<table> (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index on public.<table> (user_id);
alter table public.<table> enable row level security;

create policy "Owner has full access" on public.<table>
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
```

### 2. Any signed-in user can read; only the owner writes

`authenticated` means *anyone who can sign in with Google*, not just the team. If the Google
app is published (*In production*), that's every Google account in the world. In Testing mode,
it's only the listed test users. For team-only data, use template 3.

```sql
create policy "Signed-in users can read" on public.<table>
  for select to authenticated
  using (true);

create policy "Owner can insert" on public.<table>
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "Owner can update" on public.<table>
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Owner can delete" on public.<table>
  for delete to authenticated
  using (user_id = (select auth.uid()));
```

### 3. Admins have full access

```sql
create policy "Admins have full access" on public.<table>
  for all to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));
```

Policies for the same action are OR-ed together, so this adds to the templates above. For
hot tables, prefer a single policy, such as
`using (user_id = (select auth.uid()) or (select private.is_admin()))`.

### 4. Public read-only reference data (e.g. a dataset)

```sql
alter table public.<table> enable row level security;

create policy "Anyone can read" on public.<table>
  for select to anon, authenticated
  using (true);

-- No write policies: only the SQL editor and the secret key can write.
revoke insert, update, delete, truncate on public.<table> from anon, authenticated;
```

### 5. Written and read only by backend scripts (Python/ML) using the secret key

```sql
alter table public.<table> enable row level security;
-- No policies at all. The secret key bypasses RLS, and anon and authenticated get nothing.
revoke all on public.<table> from anon, authenticated;
```

### Keeping `updated_at` current

```sql
create trigger set_updated_at before update on public.<table>
  for each row execute function private.set_updated_at();
```

## Pitfalls

- **Auto-RLS has gaps.** It only fires on `CREATE TABLE`, `CREATE TABLE AS` and `SELECT INTO`
  run by a non-superuser. It does **not** cover:
  - `alter table ... set schema public`
  - `alter table ... disable row level security`
  - tables created by `supabase_admin` or by extensions (e.g. PostGIS's `spatial_ref_sys`)
  - views (see below)
  - materialized views and foreign tables. Postgres can't put RLS on them, and Supabase grants
    `anon`/`authenticated` select on them by default. Keep them out of `public`, or
    `revoke select on ... from anon, authenticated`.

  It also never writes policies. The pgTAP invariant test ("every table in public has RLS
  enabled") catches the table cases, but not views, materialized views or foreign tables. Run
  `npx supabase test db` after schema changes.
- **Views bypass RLS** by default, because they run as their owner (`postgres`). Always create
  them with `create view ... with (security_invoker = true) as ...`.
- **Never use `user_metadata` in policies** (`auth.jwt() -> 'user_metadata'` or
  `raw_user_meta_data`). Users can edit it with `supabase.auth.updateUser()`. Use
  `profiles.role` or `private.is_admin()`.
- **The secret (service_role) key bypasses RLS** entirely. Use it only in server-side code and
  scripts. Never put it in the frontend or in a `NEXT_PUBLIC_*` or `VITE_*` variable.
- **`security definer` functions bypass RLS and the role guard** because they run as
  `postgres`. Give them `set search_path = ''`, and check `auth.uid()` yourself.
- **Functions in `public` are callable by anyone** via `/rest/v1/rpc/...`: Supabase grants
  `anon` and `authenticated` execute on them by default. Put helpers in `private`.
  New functions in `private` are executable only by `postgres`; grant execute explicitly if a
  policy needs one, as the migration does for `private.is_admin()`. An Auth hook function
  needs `grant execute ... to supabase_auth_admin`.
- **RLS is row-level, not column-level.** To stop users editing one column (e.g. `status`),
  use column grants: `revoke update on t from authenticated; grant update (col_a, col_b) on t to authenticated;`.
- **Always add `to authenticated`** (or `to anon, authenticated`) to policies. Without it,
  the policy also applies to `anon`.
- **UPDATE needs a SELECT policy too.** Rows a user can't see can't be updated, and the update
  just affects 0 rows without an error. Also add `with check` to insert and update policies.
- **Wrap `auth.uid()` and `private.is_admin()` in `(select ...)`** so they run once per query,
  not once per row.
- **Don't re-enable email signup** (`[auth.email] enable_signup`) without revisiting how admin
  is granted. Admin trusts an email address only when Google has verified it.
  Confirmation emails don't help: someone could sign up with an allowlisted address, and the
  real owner might click the confirmation link.
- **Storage buckets** have their own policies on `storage.objects`.

## Testing

Put pgTAP tests in `supabase/tests/database/*.test.sql` and run them against the local stack:

```sh
npx supabase start
npx supabase db reset
npx supabase test db
```

Impersonate a user inside a test with:

```sql
set local role authenticated;
set local request.jwt.claims = '{"sub": "<user uuid>", "role": "authenticated"}';
```
