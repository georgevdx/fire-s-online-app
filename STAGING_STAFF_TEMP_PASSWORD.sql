-- Fire-S Test: owner gives a temporary password when adding an inspector
-- or manager email. Run this in the Fire-S Test project → SQL Editor → Run.
-- Do NOT run this on fireye-sync (the live cloud).
--
-- After this:
--   1. Owner types a temporary password (twice) on Subscribe this email.
--   2. That email can Login immediately with the temporary password.
--   3. After Login they must choose and confirm their own password.
--   4. Any signed-in role can Change password from Home.

begin;

create extension if not exists pgcrypto;

alter table public.profiles
  add column if not exists must_change_password boolean not null default false;

create or replace function public.fire_s_insert_staff_auth_user(
  p_email text,
  p_password text
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_email text := lower(trim(p_email));
  v_id uuid;
  v_hash text;
  v_instance uuid;
begin
  if v_email is null or position('@' in v_email) = 0 then
    raise exception 'Enter a valid email address';
  end if;
  if length(trim(coalesce(p_password, ''))) < 6 then
    raise exception 'Temporary password must be at least 6 characters';
  end if;

  select u.id into v_id from auth.users u where lower(trim(u.email)) = v_email limit 1;
  if found and v_id is not null then
    return v_id;
  end if;

  v_id := gen_random_uuid();
  begin
    v_hash := extensions.crypt(trim(p_password), extensions.gen_salt('bf'));
  exception when others then
    v_hash := crypt(trim(p_password), gen_salt('bf'));
  end;

  select u.instance_id into v_instance from auth.users u limit 1;
  if v_instance is null then
    v_instance := '00000000-0000-0000-0000-000000000000';
  end if;

  insert into auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
  ) values (
    v_instance,
    v_id,
    'authenticated',
    'authenticated',
    v_email,
    v_hash,
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('must_change_password', true),
    now(),
    now(),
    '',
    '',
    '',
    ''
  );

  begin
    insert into auth.identities (
      id,
      user_id,
      identity_data,
      provider,
      provider_id,
      last_sign_in_at,
      created_at,
      updated_at
    ) values (
      gen_random_uuid(),
      v_id,
      jsonb_build_object('sub', v_id::text, 'email', v_email),
      'email',
      v_id::text,
      now(),
      now(),
      now()
    );
  exception when undefined_column then
    insert into auth.identities (
      id,
      user_id,
      identity_data,
      provider,
      last_sign_in_at,
      created_at,
      updated_at
    ) values (
      v_id,
      v_id,
      jsonb_build_object('sub', v_id::text, 'email', v_email),
      'email',
      now(),
      now(),
      now()
    );
  end;

  perform public.fire_s_ensure_profile(v_id, v_email, 'inspector');
  begin
    update public.profiles
       set must_change_password = true,
           email = v_email
     where id = v_id;
  exception when others then
    null;
  end;

  return v_id;
end;
$$;

revoke all on function public.fire_s_insert_staff_auth_user(text, text) from public;
revoke all on function public.fire_s_insert_staff_auth_user(text, text) from anon, authenticated;

drop function if exists public.fire_s_add_member_by_email(uuid, text, text);
drop function if exists public.fire_s_add_member_by_email(uuid, text, text, text);

create or replace function public.fire_s_add_member_by_email(
  p_company_id uuid,
  p_email text,
  p_role text default 'inspector',
  p_password text default null
)
returns table (
  out_user_id uuid,
  out_email text,
  out_role text,
  out_status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(trim(p_email));
  v_role text := lower(trim(coalesce(p_role, 'inspector')));
  v_password text := trim(coalesce(p_password, ''));
  v_target uuid;
  v_can boolean := false;
  v_existing uuid;
  v_created boolean := false;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if v_email is null or position('@' in v_email) = 0 then
    raise exception 'Enter a valid email address';
  end if;
  if v_role not in ('inspector', 'manager', 'company_owner', 'viewer') then
    v_role := 'inspector';
  end if;

  select public.fire_s_can_manage_company(p_company_id) into v_can;
  if not v_can then
    raise exception 'Only Manager or Owner can add team members';
  end if;

  if exists (
    select 1 from public.company_invites i
    where i.company_id = p_company_id
      and lower(trim(i.email)) = v_email
      and coalesce(i.status, 'pending') = 'pending'
  ) then
    raise exception 'This email is already a paid seat. They log in on any phone or desktop with that email. Do not enter it again.';
  end if;

  select p.id into v_target from public.profiles p where lower(trim(p.email)) = v_email limit 1;
  if v_target is null then
    select u.id into v_target from auth.users u where lower(trim(u.email)) = v_email limit 1;
  end if;

  if v_target is null then
    if length(v_password) < 6 then
      raise exception 'Type a temporary password so they can Login.';
    end if;
    v_target := public.fire_s_insert_staff_auth_user(v_email, v_password);
    v_created := true;
  end if;

  if v_target is not null then
    update public.company_members
       set status = 'active',
           role = v_role
     where company_id = p_company_id
       and user_id = v_target
       and coalesce(status, 'active') = 'inactive';
    if found then
      update public.profiles set role = v_role where id = v_target;
      update public.company_invites
         set status = 'accepted',
             role = v_role
       where company_id = p_company_id
         and lower(trim(email)) = v_email
         and lower(coalesce(status, 'pending')) in (
           'pending', 'cancelled', 'canceled', 'expired', 'declined', 'rejected'
         );
      return query select v_target, v_email, v_role, 'added'::text;
      return;
    end if;

    select m.company_id into v_existing
    from public.company_members m
    where m.user_id = v_target and coalesce(m.status, 'active') = 'active'
    limit 1;
    if v_existing is not null then
      if v_existing = p_company_id then
        raise exception 'This email is already a paid seat. They log in on any phone or desktop with that email. Do not enter it again.';
      end if;
      raise exception 'This email already belongs to a company. One person is one company. They Login with that email.';
    end if;

    perform public.fire_s_ensure_profile(v_target, v_email, v_role);
    begin
      insert into public.company_members (company_id, user_id, role, status)
      values (p_company_id, v_target, v_role, 'active')
      on conflict (company_id, user_id)
      do update set role = excluded.role, status = 'active';
    exception when unique_violation then
      raise exception 'This email already belongs to a company. One person is one company. They Login with that email.';
    end;
    update public.profiles set role = v_role where id = v_target;
    if v_created then
      begin
        update public.profiles set must_change_password = true where id = v_target;
      exception when others then
        null;
      end;
    end if;
    update public.company_invites
       set status = 'accepted',
           role = v_role
     where company_id = p_company_id
       and lower(trim(email)) = v_email
       and lower(coalesce(status, 'pending')) in (
         'pending', 'cancelled', 'canceled', 'expired', 'declined', 'rejected'
       );
    return query select
      v_target,
      v_email,
      v_role,
      case when v_created then 'created'::text else 'added'::text end;
    return;
  end if;

  raise exception 'Type a temporary password so they can Login.';
end;
$$;

grant execute on function public.fire_s_add_member_by_email(uuid, text, text, text) to authenticated;

create or replace function public.fire_s_clear_must_change_password()
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  begin
    update public.profiles
       set must_change_password = false
     where id = v_uid;
  exception when others then
    null;
  end;
  begin
    update auth.users
       set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
         || jsonb_build_object('must_change_password', false)
     where id = v_uid;
  exception when others then
    null;
  end;
  return true;
end;
$$;

grant execute on function public.fire_s_clear_must_change_password() to authenticated;

commit;

select 'fire_s staff temp password ready' as status;
