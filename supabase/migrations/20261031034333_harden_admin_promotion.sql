-- Closes a takeover path: a user could sign in with their own Google account, change its
-- email to an allowlisted address (PUT /auth/v1/user still works with the email provider off),
-- then pick up the real owner's Google identity when they sign in. Re-adding the allowlist
-- row would then promote the attacker's account.

-- Sign-in is Google-only, so self-service email changes are blocked outright. The admin API
-- and the SQL editor set auth.users.email directly and are unaffected; soft-deleted users are
-- skipped because GoTrue obfuscates email_change when soft-deleting.
create function private.block_email_change_request()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.deleted_at is null
     and coalesce(new.email_change, '') <> ''
     and new.email_change is distinct from old.email_change then
    raise exception 'email changes are disabled' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.block_email_change_request() from public, anon, authenticated, service_role;

create trigger block_email_change_request
  before update of email_change on auth.users
  for each row execute function private.block_email_change_request();

-- Promotion now also requires every identity on the account to be a Google identity,
-- verified by Google, for exactly the allowlisted address.
create or replace function private.sync_allowlist_to_profiles()
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
        where i.user_id = u.id
          and i.provider = 'google'
          and i.email = new.email
          and i.identity_data -> 'email_verified' = 'true'::jsonb
      )
      and not exists (
        select 1 from auth.identities i
        where i.user_id = u.id
          and (i.provider <> 'google' or i.email is distinct from new.email)
      );
  end if;
  return null;
end;
$$;
