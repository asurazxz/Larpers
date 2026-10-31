-- User profiles, admin/member roles and RLS. Guide for new tables: docs/RLS.md

-- Not exposed by the Data API. authenticated needs USAGE only so that RLS policies
-- can call private.is_admin(); every table and function in here is revoked below.
create schema private;
grant usage on schema private to authenticated;

-- Postgres lets PUBLIC execute every new function. This drops that for functions postgres
-- creates from now on; Supabase's per-schema defaults still grant anon, authenticated and
-- service_role on functions in public. A per-schema REVOKE can't remove a global default.
alter default privileges for role postgres revoke execute on functions from public;

create type public.app_role as enum ('admin', 'member');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text check (char_length(full_name) <= 200),
  avatar_url text check (avatar_url ~ '^https://' and char_length(avatar_url) <= 2048),
  role public.app_role not null default 'member',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table private.admin_allowlist (
  email text primary key check (email = lower(btrim(email))),
  added_at timestamptz not null default now()
);

-- Reusable: any table with an updated_at column can attach this as a BEFORE UPDATE trigger.
create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

-- security definer: Auth inserts as supabase_auth_admin, which has no access to
-- public.profiles or the allowlist. The email and user metadata are user-supplied, but they
-- are only stored as data (sanitised to pass the column checks, so they can't make signup
-- fail). Admin is granted only for a Google signup with a Google-verified email: GoTrue sets
-- app_metadata.provider, which users can't edit, and at insert time the user metadata is
-- Google's own claims. Email/password and magic-link rows prove nothing at this point, so
-- an allowlisted address squatted that way stays member.
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}');
  v_name text := left(coalesce(nullif(meta ->> 'full_name', ''), nullif(meta ->> 'name', '')), 200);
  v_avatar text := coalesce(nullif(meta ->> 'avatar_url', ''), nullif(meta ->> 'picture', ''));
begin
  if v_avatar !~ '^https://' or char_length(v_avatar) > 2048 then
    v_avatar := null;
  end if;

  insert into public.profiles (id, email, full_name, avatar_url, role)
  values (
    new.id,
    new.email,
    v_name,
    v_avatar,
    case
      when new.raw_app_meta_data ->> 'provider' = 'google'
       and meta -> 'email_verified' = 'true'::jsonb
       and exists (select 1 from private.admin_allowlist a where a.email = lower(new.email))
        then 'admin'::public.app_role
      else 'member'::public.app_role
    end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Moving off an allowlisted address demotes, so that deleting the allowlist row later still
-- revokes. Moving onto one never promotes.
create function private.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
  set email = new.email,
      role = case
        when role = 'admin'
         and exists (select 1 from private.admin_allowlist a where a.email = lower(old.email))
         and not exists (select 1 from private.admin_allowlist a where a.email = lower(new.email))
          then 'member'::public.app_role
        else role
      end
  where id = new.id;
  return null;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function private.handle_user_email_change();

create function private.normalize_allowlist_email()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.email := lower(btrim(new.email));
  return new;
end;
$$;

create trigger normalize_email
  before insert or update of email on private.admin_allowlist
  for each row execute function private.normalize_allowlist_email();

-- Adding an email promotes an existing user only if Google has proven they own it: confirmed,
-- no password (a squatter's email/password account later linked by Google keeps the
-- squatter's password) and a Google identity for that exact address. Removing an email
-- demotes that user; admins they promoted are not touched.
create function private.sync_allowlist_to_profiles()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op in ('DELETE', 'UPDATE') then
    update public.profiles set role = 'member'
    where lower(email) = old.email and role = 'admin';
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    update public.profiles p set role = 'admin'
    from auth.users u
    where u.id = p.id
      and lower(p.email) = new.email
      and p.role <> 'admin'
      and u.email_confirmed_at is not null
      and coalesce(u.encrypted_password, '') = ''
      and exists (
        select 1 from auth.identities i
        where i.user_id = u.id and i.provider = 'google' and i.email = new.email
      );
  end if;
  return null;
end;
$$;

create trigger sync_profiles_role
  after insert or delete or update of email on private.admin_allowlist
  for each row execute function private.sync_allowlist_to_profiles();

-- security definer so it can read profiles without recursing into the profiles RLS
-- policies that call it. Safe: no arguments, and it only reveals whether the caller
-- (auth.uid()) is an admin.
create function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

-- Column grants apply to the whole authenticated DB role, so they can't stop a member
-- from writing `role` without also stopping admins. This trigger makes that call.
-- It must stay security invoker: current_user is how it tells API callers apart from
-- postgres (SQL editor), service_role and security definer code, which all bypass RLS
-- anyway and are trusted to change roles.
create function private.guard_profile_role()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.role is not distinct from old.role then
    return new;
  end if;

  if exists (
    select 1 from pg_catalog.pg_roles
    where rolname = current_user and (rolsuper or rolbypassrls)
  ) then
    return new;
  end if;

  if not private.is_admin() then
    raise exception 'only admins can change roles'
      using errcode = '42501';
  end if;

  if old.role = 'admin' then
    -- Serialises demotions so two admins can't demote each other at the same time.
    perform pg_advisory_xact_lock(hashtext('public.profiles:last_admin'));
    if not exists (
      select 1 from public.profiles where role = 'admin' and id <> old.id
    ) then
      raise exception 'cannot demote the last admin'
        using hint = 'Promote another user first, or use the SQL editor.';
    end if;
  end if;

  return new;
end;
$$;

create trigger guard_role
  before update on public.profiles
  for each row execute function private.guard_profile_role();

-- Not forced: the owner (postgres) has BYPASSRLS on Supabase, so FORCE would change nothing.
alter table public.profiles enable row level security;
alter table private.admin_allowlist enable row level security;

-- Supabase grants everything in public to anon/authenticated by default; start from zero.
revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
grant update (full_name, avatar_url, role) on table public.profiles to authenticated;
grant all on table public.profiles to service_role;

revoke all on all tables in schema private from public, anon, authenticated, service_role;
revoke all on all functions in schema private from public, anon, authenticated, service_role;
grant execute on function private.is_admin() to authenticated;

create policy "Users read own profile; admins read all"
  on public.profiles for select
  to authenticated
  using (id = (select auth.uid()) or (select private.is_admin()));

create policy "Users update own profile; admins update all"
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()) or (select private.is_admin()))
  with check (id = (select auth.uid()) or (select private.is_admin()));

-- Safety net: new tables in public get RLS enabled, so a forgotten
-- `enable row level security` means "API sees nothing" rather than "API sees everything".
-- Only covers tables created by non-superusers; docs/RLS.md lists the gaps, and the pgTAP
-- invariant test catches them. Security invoker so the ALTER runs as the table's owner.
create function private.enable_rls_on_new_public_tables()
returns event_trigger
language plpgsql
set search_path = ''
as $$
declare
  obj record;
begin
  for obj in
    select objid from pg_event_trigger_ddl_commands()
    where object_type = 'table' and schema_name = 'public'
  loop
    execute format('alter table %s enable row level security', obj.objid::regclass);
  end loop;
end;
$$;

revoke all on function private.enable_rls_on_new_public_tables() from public, anon, authenticated, service_role;

create event trigger enable_rls_on_new_public_tables
  on ddl_command_end
  when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  execute function private.enable_rls_on_new_public_tables();
