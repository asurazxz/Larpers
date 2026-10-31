begin;
create extension if not exists pgtap with schema extensions;
select plan(65);

-- Mirror what GoTrue writes: user row (app_metadata set by GoTrue, user_metadata from the
-- provider), then the identity, then email confirmation.
create function pg_temp.google_signup(uid uuid, addr text, meta jsonb default '{}', confirmed boolean default true)
returns void language sql as $$
  insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
  values (uid, addr, '{"provider": "google", "providers": ["google"]}', meta);
  insert into auth.identities (provider_id, user_id, provider, identity_data)
  values (uid::text, uid, 'google', jsonb_build_object('sub', uid::text, 'email', addr, 'email_verified', true));
  update auth.users set email_confirmed_at = now() where id = uid and confirmed;
$$;

create function pg_temp.email_signup(uid uuid, addr text, pw text, confirmed boolean)
returns void language sql as $$
  insert into auth.users (id, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
  values (uid, addr, pw, '{"provider": "email", "providers": ["email"]}', '{"email_verified": true}');
  insert into auth.identities (provider_id, user_id, provider, identity_data)
  values (uid::text, uid, 'email', jsonb_build_object('sub', uid::text, 'email', addr));
  update auth.users set email_confirmed_at = now() where id = uid and confirmed;
$$;

insert into private.admin_allowlist (email) values ('  Ada@Example.COM '), ('boss@example.com'), ('gus@example.com');

-- ada: allowlisted before signup. mia, max: plain members. lee: allowlisted after signup.
-- sam: squats the allowlisted boss@ via email/password. gus: Google without email_verified.
-- kim: Google identity but holds a password. uma: unconfirmed Google. eve: confirmed magic link.
select pg_temp.google_signup('11111111-1111-1111-1111-111111111111', 'ada@example.com', '{"name": "Ada Admin", "picture": "https://example.com/ada.png", "email_verified": true}');
select pg_temp.google_signup('22222222-2222-2222-2222-222222222222', 'mia@example.com', '{"full_name": "Mia Member", "avatar_url": "https://example.com/mia.png", "email_verified": true}');
select pg_temp.google_signup('33333333-3333-3333-3333-333333333333', 'max@example.com');
select pg_temp.google_signup('44444444-4444-4444-4444-444444444444', 'lee@example.com', '{"email_verified": true}');
select pg_temp.email_signup('55555555-5555-5555-5555-555555555555', 'boss@example.com', '$2a$10$squatterhash', false);
select pg_temp.google_signup('66666666-6666-6666-6666-666666666666', 'gus@example.com', '{"name": "Gus"}');
select pg_temp.google_signup('77777777-7777-7777-7777-777777777777', 'kim@example.com', '{"email_verified": true}');
update auth.users set encrypted_password = '$2a$10$squatterhash' where id = '77777777-7777-7777-7777-777777777777';
select pg_temp.google_signup('88888888-8888-8888-8888-888888888888', 'uma@example.com', '{"email_verified": true}', false);
select pg_temp.email_signup('99999999-9999-9999-9999-999999999999', 'eve@example.com', '', true);
select pg_temp.google_signup('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bad@example.com',
  jsonb_build_object('full_name', repeat('x', 5000), 'avatar_url', 'javascript:alert(1)', 'email_verified', true));

select is((select count(*)::int from public.profiles), 10, 'signup creates a profile per auth user');

select results_eq(
  $$ select full_name, avatar_url, email from public.profiles where id = '11111111-1111-1111-1111-111111111111' $$,
  $$ values ('Ada Admin'::text, 'https://example.com/ada.png'::text, 'ada@example.com'::text) $$,
  'Google name/picture metadata maps to full_name/avatar_url'
);

select results_eq(
  $$ select full_name, avatar_url from public.profiles where id = '22222222-2222-2222-2222-222222222222' $$,
  $$ values ('Mia Member'::text, 'https://example.com/mia.png'::text) $$,
  'full_name/avatar_url metadata maps directly'
);

select results_eq(
  $$ select char_length(full_name), avatar_url from public.profiles where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  $$ values (200, null::text) $$,
  'signup with oversized name and non-https avatar succeeds, sanitised'
);

select is(
  (select role from public.profiles where id = '33333333-3333-3333-3333-333333333333'),
  'member'::public.app_role,
  'non-allowlisted user signs up as member'
);

select ok(
  exists (select 1 from private.admin_allowlist where email = 'ada@example.com'),
  'allowlist emails are trimmed and lowercased'
);

select is(
  (select role from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  'admin'::public.app_role,
  'verified Google signup with an allowlisted email becomes admin'
);

select is(
  (select role from public.profiles where id = '55555555-5555-5555-5555-555555555555'),
  'member'::public.app_role,
  'email/password signup with an allowlisted email stays member'
);

select is(
  (select role from public.profiles where id = '66666666-6666-6666-6666-666666666666'),
  'member'::public.app_role,
  'Google signup without email_verified stays member'
);

insert into private.admin_allowlist (email) values ('LEE@example.com');
select is(
  (select role from public.profiles where id = '44444444-4444-4444-4444-444444444444'),
  'admin'::public.app_role,
  'allowlisting an existing Google user promotes them'
);

delete from private.admin_allowlist where email = 'lee@example.com';
select is(
  (select role from public.profiles where id = '44444444-4444-4444-4444-444444444444'),
  'member'::public.app_role,
  'removing an email from the allowlist demotes that user'
);

insert into private.admin_allowlist (email) values ('kim@example.com'), ('uma@example.com'), ('eve@example.com');
select is(
  (select role from public.profiles where id = '77777777-7777-7777-7777-777777777777'),
  'member'::public.app_role,
  'allowlisting a user who holds a password does not promote them'
);
select is(
  (select role from public.profiles where id = '88888888-8888-8888-8888-888888888888'),
  'member'::public.app_role,
  'allowlisting an unconfirmed user does not promote them'
);
select is(
  (select role from public.profiles where id = '99999999-9999-9999-9999-999999999999'),
  'member'::public.app_role,
  'allowlisting a user without a Google identity does not promote them'
);

select throws_ok(
  $$ update auth.users set email_change = 'ada@example.com' where id = '22222222-2222-2222-2222-222222222222' $$,
  '42501', 'email changes are disabled',
  'self-service email change requests are blocked'
);

select lives_ok(
  $$ update auth.users set email_change = '' where id = '22222222-2222-2222-2222-222222222222' $$,
  'clearing email_change is still allowed'
);

-- N1: own Google account (attacker@) moved to tess@, then the real owner's Google sign-in
-- links google(tess@) onto it.
select pg_temp.google_signup('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'attacker@example.com', '{"email_verified": true}');
select lives_ok(
  $$ update auth.users set email = 'tess@example.com' where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' $$,
  'admin-API-style direct email update still works'
);
insert into auth.identities (provider_id, user_id, provider, identity_data) values
  ('tess-email', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'email', '{"sub": "tess-email", "email": "tess@example.com"}'),
  ('tess-google', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'google', '{"sub": "tess-google", "email": "tess@example.com", "email_verified": true}');

select pg_temp.google_signup('cccccccc-cccc-cccc-cccc-cccccccccccc', 'ivy@example.com', '{"email_verified": true}');
insert into auth.identities (provider_id, user_id, provider, identity_data) values
  ('ivy-other-google', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'google', '{"sub": "ivy-other-google", "email": "other@example.com", "email_verified": true}');

insert into auth.users (id, email, raw_app_meta_data) values
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'otto@example.com', '{"provider": "google", "providers": ["google"]}');
insert into auth.identities (provider_id, user_id, provider, identity_data) values
  ('otto-google', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'google', '{"sub": "otto-google", "email": "otto@example.com"}');
update auth.users set email_confirmed_at = now() where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

insert into private.admin_allowlist (email) values ('tess@example.com'), ('ivy@example.com'), ('otto@example.com');
select is(
  (select role from public.profiles where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  'member'::public.app_role,
  'account with a foreign Google identity and an email identity is not promoted'
);
select is(
  (select role from public.profiles where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'),
  'member'::public.app_role,
  'account with two Google identities is not promoted'
);
select is(
  (select role from public.profiles where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'),
  'member'::public.app_role,
  'Google identity without email_verified is not promoted'
);

select lives_ok(
  $$ update auth.users set deleted_at = now(), email_change = 'obfuscated' where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd' $$,
  'soft delete can still set email_change'
);

insert into private.admin_allowlist (email) values ('lee@example.com');
select is(
  (select role from public.profiles where id = '44444444-4444-4444-4444-444444444444'),
  'admin'::public.app_role,
  're-adding an email to the allowlist promotes again'
);
update auth.users set email = 'lee.new@example.com' where id = '44444444-4444-4444-4444-444444444444';
select is(
  (select role from public.profiles where id = '44444444-4444-4444-4444-444444444444'),
  'member'::public.app_role,
  'changing email away from an allowlisted address demotes'
);

update auth.users set email = 'max.new@example.com' where id = '33333333-3333-3333-3333-333333333333';
select is(
  (select email from public.profiles where id = '33333333-3333-3333-3333-333333333333'),
  'max.new@example.com',
  'email change on auth.users syncs to profiles.email'
);

update public.profiles set updated_at = '2000-01-01' where id = '33333333-3333-3333-3333-333333333333';
select is(
  (select updated_at from public.profiles where id = '33333333-3333-3333-3333-333333333333'),
  now(),
  'updated_at is maintained by trigger'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass),
  'RLS is enabled on profiles'
);

set local role anon;

select throws_ok('select * from public.profiles', '42501', null, 'anon cannot read profiles');
select throws_ok('select * from private.admin_allowlist', '42501', null, 'anon cannot read the allowlist');
select throws_ok('select private.is_admin()', '42501', null, 'anon cannot call private.is_admin()');

reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';

select results_eq(
  'select id from public.profiles',
  array['22222222-2222-2222-2222-222222222222'::uuid],
  'member sees only their own row'
);

select is(private.is_admin(), false, 'is_admin() is false for a member');

select lives_ok(
  $$ update public.profiles set full_name = 'Mia M', avatar_url = 'https://example.com/m2.png' where id = '22222222-2222-2222-2222-222222222222' $$,
  'member can update their own full_name and avatar_url'
);

select throws_ok(
  $$ update public.profiles set role = 'admin' where id = '22222222-2222-2222-2222-222222222222' $$,
  '42501', 'only admins can change roles',
  'member cannot promote themselves'
);

select throws_ok(
  $$ update public.profiles set full_name = repeat('x', 201) where id = '22222222-2222-2222-2222-222222222222' $$,
  '23514', null,
  'full_name longer than 200 characters is rejected'
);

select throws_ok(
  $$ update public.profiles set avatar_url = 'javascript:alert(1)' where id = '22222222-2222-2222-2222-222222222222' $$,
  '23514', null,
  'non-https avatar_url is rejected'
);

select throws_ok(
  $$ update public.profiles set email = 'evil@example.com' where id = '22222222-2222-2222-2222-222222222222' $$,
  '42501', null,
  'member cannot change their own email'
);

select throws_ok(
  $$ update public.profiles set id = gen_random_uuid() where id = '22222222-2222-2222-2222-222222222222' $$,
  '42501', null,
  'member cannot change their id'
);

select throws_ok(
  $$ update public.profiles set created_at = now() where id = '22222222-2222-2222-2222-222222222222' $$,
  '42501', null,
  'member cannot change created_at'
);

select is_empty(
  $$ update public.profiles set full_name = 'hacked' where id = '33333333-3333-3333-3333-333333333333' returning id $$,
  'member cannot update another user''s row'
);

select is_empty(
  $$ update public.profiles set role = 'admin' where id = '33333333-3333-3333-3333-333333333333' returning id $$,
  'member cannot change another user''s role'
);

select throws_ok(
  $$ insert into public.profiles (id) values (gen_random_uuid()) $$,
  '42501', null,
  'member cannot insert profiles'
);

select throws_ok(
  $$ delete from public.profiles where id = '22222222-2222-2222-2222-222222222222' $$,
  '42501', null,
  'member cannot delete profiles'
);

select throws_ok('select * from private.admin_allowlist', '42501', null, 'authenticated cannot read the allowlist');

select throws_ok(
  $$ insert into private.admin_allowlist (email) values ('mia@example.com') $$,
  '42501', null,
  'authenticated cannot add itself to the allowlist'
);

reset role;

select results_eq(
  $$ select role::text, full_name from public.profiles where id in ('22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333') order by id $$,
  $$ values ('member', 'Mia M'), ('member', null) $$,
  'member escalation attempts left roles and other rows unchanged'
);

set local role authenticated;
set local request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';

select is((select count(*)::int from public.profiles), 13, 'admin sees all rows');
select is(private.is_admin(), true, 'is_admin() is true for an admin');

update public.profiles set role = 'admin' where id = '33333333-3333-3333-3333-333333333333';
select is(
  (select role from public.profiles where id = '33333333-3333-3333-3333-333333333333'),
  'admin'::public.app_role,
  'admin can promote another user'
);

update public.profiles set role = 'member' where id = '33333333-3333-3333-3333-333333333333';
select is(
  (select role from public.profiles where id = '33333333-3333-3333-3333-333333333333'),
  'member'::public.app_role,
  'admin can demote another user'
);

select throws_ok(
  $$ update public.profiles set email = 'x@example.com' where id = '33333333-3333-3333-3333-333333333333' $$,
  '42501', null,
  'admin cannot change emails via the API either'
);

-- The squatted, unconfirmed and password-holding allowlisted rows are all member, so ada is
-- the only admin the last-admin check can count.
select results_eq(
  $$ select id from public.profiles where role = 'admin' $$,
  array['11111111-1111-1111-1111-111111111111'::uuid],
  'unverified allowlisted rows never hold admin'
);

select throws_ok(
  $$ update public.profiles set role = 'member' where id = '11111111-1111-1111-1111-111111111111' $$,
  'P0001', 'cannot demote the last admin',
  'the last admin cannot demote themselves'
);

select throws_ok(
  $$ update public.profiles set role = 'member' $$,
  'P0001', 'cannot demote the last admin',
  'a bulk demotion that would leave no admin is rejected'
);

update public.profiles set role = 'admin' where id = '33333333-3333-3333-3333-333333333333';
select lives_ok(
  $$ update public.profiles set role = 'member' where id = '11111111-1111-1111-1111-111111111111' $$,
  'an admin can step down while another admin exists'
);

select is(private.is_admin(), false, 'a demoted admin loses admin rights immediately');

-- max is now the last admin.
set local request.jwt.claims = '{"sub": "33333333-3333-3333-3333-333333333333", "role": "authenticated"}';

select throws_ok(
  $$ update public.profiles set role = 'member' where id = '33333333-3333-3333-3333-333333333333' $$,
  'P0001', 'cannot demote the last admin',
  'the new last admin cannot demote themselves either'
);

reset role;

select lives_ok(
  $$ update public.profiles set role = 'member' where id = '33333333-3333-3333-3333-333333333333' $$,
  'postgres (SQL editor) can change any role, including the last admin'
);

set local role service_role;
select lives_ok(
  $$ update public.profiles set role = 'admin' where id = '22222222-2222-2222-2222-222222222222' $$,
  'service_role can change roles'
);
reset role;

select is(
  (select role from public.profiles where id = '22222222-2222-2222-2222-222222222222'),
  'admin'::public.app_role,
  'service_role role change was applied'
);

create table public.rls_autotest (id int);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.rls_autotest'::regclass),
  'CREATE TABLE in public enables RLS automatically'
);

create table public.rls_autotest_ctas as select 1 as id;
select ok(
  (select relrowsecurity from pg_class where oid = 'public.rls_autotest_ctas'::regclass),
  'CREATE TABLE AS in public enables RLS automatically'
);

create table private.rls_autotest_private (id int);
select ok(
  not (select relrowsecurity from pg_class where oid = 'private.rls_autotest_private'::regclass),
  'tables outside public are left alone'
);

-- Catches what the event trigger can't: SET SCHEMA, DISABLE RLS, superuser/extension tables.
select is_empty(
  $$ select c.oid::regclass::text from pg_class c
     where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') and not c.relrowsecurity $$,
  'every table in public has RLS enabled'
);

create function private.privs_probe() returns int language sql as 'select 1';
create function public.privs_probe() returns int language sql as 'select 1';
select ok(
  not has_function_privilege('anon', 'private.privs_probe()', 'execute')
    and not has_function_privilege('authenticated', 'private.privs_probe()', 'execute'),
  'new functions in private are not executable via PUBLIC'
);
select ok(
  has_function_privilege('anon', 'public.privs_probe()', 'execute')
    and has_function_privilege('authenticated', 'public.privs_probe()', 'execute')
    and has_function_privilege('service_role', 'public.privs_probe()', 'execute'),
  'new functions in public keep Supabase''s default API grants'
);

select * from finish();
rollback;
