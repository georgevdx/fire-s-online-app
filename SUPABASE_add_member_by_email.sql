-- Fire-S: add team member by email (works even if profiles row is missing)
-- Run once in Supabase SQL Editor.

create or replace function public.fire_s_ensure_profile(
  p_user_id uuid,
  p_email text,
  p_role text default 'inspector'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    p_user_id,
    lower(trim(p_email)),
    split_part(lower(trim(p_email)), '@', 1),
    coalesce(nullif(trim(p_role), ''), 'inspector')
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(public.profiles.full_name, excluded.full_name);
exception when undefined_table then
  null;
when others then
  -- Best effort only
  null;
end;
$$;

drop function if exists public.fire_s_add_member_by_email(uuid, text, text);

create or replace function public.fire_s_add_member_by_email(
  p_company_id uuid,
  p_email text,
  p_role text default 'inspector'
)
returns table (
  out_user_id uuid,
  out_email text,
  out_role text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(trim(p_email));
  v_role text := lower(trim(coalesce(p_role, 'inspector')));
  v_target uuid;
  v_can boolean := false;
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

  -- Caller must manage this company, or be super_admin on profiles.
  select exists (
    select 1
    from public.company_members m
    where m.company_id = p_company_id
      and m.user_id = v_uid
      and m.role in ('company_owner', 'manager', 'super_admin')
      and coalesce(m.status, 'active') = 'active'
  )
  into v_can;

  if not v_can then
    begin
      select exists (
        select 1 from public.profiles p
        where p.id = v_uid and p.role = 'super_admin'
      ) into v_can;
    exception when others then
      v_can := false;
    end;
  end if;

  if not v_can then
    raise exception 'Only Manager or Owner can add team members';
  end if;

  -- 1) Find in profiles
  select p.id into v_target
  from public.profiles p
  where lower(trim(p.email)) = v_email
  limit 1;

  -- 2) Fallback: auth.users
  if v_target is null then
    select u.id into v_target
    from auth.users u
    where lower(trim(u.email)) = v_email
    limit 1;
  end if;

  if v_target is null then
    raise exception 'No login found for that email yet. Ask them to open Fire-S and create their login first.';
  end if;

  perform public.fire_s_ensure_profile(v_target, v_email, v_role);

  insert into public.company_members (company_id, user_id, role, status)
  values (p_company_id, v_target, v_role, 'active')
  on conflict (company_id, user_id)
  do update set role = excluded.role, status = 'active';

  begin
    update public.profiles
       set role = v_role
     where id = v_target;
  exception when others then
    null;
  end;

  return query select v_target, v_email, v_role;
end;
$$;

grant execute on function public.fire_s_ensure_profile(uuid, text, text) to authenticated;
grant execute on function public.fire_s_add_member_by_email(uuid, text, text) to authenticated;

select 'fire_s_add_member_by_email ready' as status;
