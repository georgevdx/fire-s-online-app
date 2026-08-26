-- ============================================================
-- Fire-S Test ONLY — Owner Remove deletes that login.
--
-- STOP. Look at the TOP LEFT of this Supabase page.
-- The project name MUST say:  Fire-S Test
-- If it says fireye-sync, close this page. Do not Run.
--
-- This does NOT touch the live cloud (fireye-sync).
--
-- After this Run:
--   Only the Owner can Remove someone under Personnel.
--   That deletes their email and password from Fire-S Test.
--   Then that person can Subscribe under another company name.
--
-- Kept logins are never deleted:
--   johandb@live.com
--   johandb1974ik@gmail.com
--   georgevdx@gmail.com
--   any @supabase.io address
-- ============================================================

begin;

do $$
declare
  v_inspections int := 0;
begin
  if to_regclass('public.inspections') is not null then
    select count(*) into v_inspections from public.inspections;
  end if;
  if v_inspections > 20 then
    raise exception
      'STOP: % inspections found. This looks like the live cloud (fireye-sync). Do not run here.',
      v_inspections;
  end if;
end $$;

create or replace function public.fire_s_is_company_owner(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.company_members m
    where m.company_id = p_company_id
      and m.user_id = auth.uid()
      and coalesce(m.status, 'active') = 'active'
      and lower(coalesce(m.role, '')) in ('company_owner', 'owner', 'super_admin')
  );
$$;

create or replace function public.fire_s_delete_cloud_login(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null then
    return;
  end if;

  if to_regclass('public.company_invites') is not null then
    delete from public.company_invites i
     using auth.users u
     where u.id = p_user_id
       and lower(trim(i.email)) = lower(trim(u.email));
  end if;

  if to_regclass('public.company_members') is not null then
    delete from public.company_members where user_id = p_user_id;
  end if;

  if to_regclass('public.profiles') is not null then
    delete from public.profiles where id = p_user_id;
  end if;

  begin
    delete from auth.refresh_tokens where user_id = p_user_id;
  exception when others then
    null;
  end;
  begin
    delete from auth.sessions where user_id = p_user_id;
  exception when others then
    null;
  end;
  begin
    delete from auth.identities where user_id = p_user_id;
  exception when others then
    null;
  end;

  delete from auth.users where id = p_user_id;
end;
$$;

revoke all on function public.fire_s_delete_cloud_login(uuid) from public;
revoke all on function public.fire_s_delete_cloud_login(uuid) from anon, authenticated;

drop function if exists public.fire_s_remove_member(uuid, uuid);

create or replace function public.fire_s_remove_member(
  p_company_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_keep text[] := array[
    'johandb@live.com',
    'johandb1974ik@gmail.com',
    'georgevdx@gmail.com'
  ];
  v_protected boolean := false;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if not public.fire_s_is_company_owner(p_company_id) then
    raise exception
      'Only the Owner can remove personnel. That deletes their email and password from the cloud.';
  end if;

  if p_user_id is null then
    raise exception 'Missing person';
  end if;

  if p_user_id = v_uid then
    raise exception 'You cannot remove yourself';
  end if;

  if not exists (
    select 1
    from public.company_members m
    where m.company_id = p_company_id
      and m.user_id = p_user_id
  ) then
    raise exception 'That person is not on this company';
  end if;

  if exists (
    select 1
    from public.company_members m
    where m.company_id = p_company_id
      and m.user_id = p_user_id
      and lower(coalesce(m.role, '')) in ('company_owner', 'owner', 'super_admin')
  ) then
    raise exception
      'A manager cannot remove the Owner. Only the Owner can remove a Manager.';
  end if;

  select lower(trim(u.email))
    into v_email
    from auth.users u
   where u.id = p_user_id
   limit 1;

  v_protected :=
    v_email is not null
    and (
      v_email = any (v_keep)
      or v_email like '%@supabase.io'
    );

  if to_regclass('public.company_invites') is not null and v_email is not null then
    update public.company_invites
       set status = 'cancelled'
     where company_id = p_company_id
       and lower(trim(email)) = v_email
       and coalesce(status, 'pending') = 'pending';
  end if;

  if v_protected then
    delete from public.company_members
     where company_id = p_company_id
       and user_id = p_user_id;
    return jsonb_build_object(
      'ok', true,
      'login_deleted', false,
      'email', v_email
    );
  end if;

  perform public.fire_s_delete_cloud_login(p_user_id);

  return jsonb_build_object(
    'ok', true,
    'login_deleted', true,
    'email', v_email
  );
end;
$$;

create or replace function public.fire_s_start_fresh_company(p_name text)
returns table (
  out_company_id uuid,
  out_company_name text,
  out_member_role text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_company_id uuid;
  v_name text := nullif(trim(p_name), '');
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if v_name is null then
    v_name := 'New Fire-S Company';
  end if;

  if exists (
    select 1
    from public.company_members m
    where m.user_id = v_uid
      and coalesce(m.status, 'active') = 'active'
      and lower(coalesce(m.role, '')) not in ('company_owner', 'owner', 'super_admin')
  ) then
    raise exception
      'You already belong to a company. Only that Owner can remove you under Personnel. Then you can Subscribe under a new company name.';
  end if;

  update public.company_members
     set status = 'inactive'
   where user_id = v_uid
     and coalesce(status, 'active') = 'active';

  insert into public.companies (name, status, plan)
  values (v_name, 'active', 'standard')
  returning id into v_company_id;

  insert into public.company_members as cm (company_id, user_id, role, status)
  values (v_company_id, v_uid, 'company_owner', 'active')
  on conflict (company_id, user_id)
  do update set role = 'company_owner', status = 'active';

  update public.profiles set role = 'company_owner' where id = v_uid;

  return query select c.id, c.name, 'company_owner'::text from public.companies c where c.id = v_company_id;
end;
$$;

grant execute on function public.fire_s_is_company_owner(uuid) to authenticated;
grant execute on function public.fire_s_remove_member(uuid, uuid) to authenticated;
grant execute on function public.fire_s_start_fresh_company(text) to authenticated;

commit;

select 'Owner Remove deletes that email and password on Fire-S Test' as status;
