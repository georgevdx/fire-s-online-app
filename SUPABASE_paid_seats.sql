-- Fire-S: paid seats are per email (monthly or annual)
-- One email = one seat. Phone and desktop share that login.
-- Run once in Supabase SQL Editor.

begin;

alter table public.companies
  add column if not exists billing_interval text;

update public.companies
   set billing_interval = coalesce(nullif(billing_interval, ''), 'monthly')
 where billing_interval is null or billing_interval = '';

drop function if exists public.fire_s_set_company_plan(text);
drop function if exists public.fire_s_set_company_plan(text, text);

create or replace function public.fire_s_set_company_plan(p_plan text, p_interval text default 'monthly')
returns table (
  out_company_id uuid,
  out_plan text,
  out_interval text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_company_id uuid;
  v_plan text := lower(nullif(trim(p_plan), ''));
  v_interval text := lower(nullif(trim(p_interval), ''));
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if v_plan is null or v_plan not in ('field', 'operations', 'executive', 'enterprise') then
    v_plan := 'executive';
  end if;

  if v_interval is null or v_interval not in ('monthly', 'annual') then
    v_interval := 'monthly';
  end if;

  select m.company_id
    into v_company_id
  from public.company_members as m
  where m.user_id = v_uid
    and coalesce(m.status, 'active') = 'active'
    and m.role in ('company_owner', 'owner', 'super_admin')
  order by case m.role when 'company_owner' then 0 else 1 end
  limit 1;

  if v_company_id is null then
    raise exception 'Only the Owner can change the package';
  end if;

  update public.companies
     set plan = v_plan,
         billing_interval = v_interval
   where id = v_company_id;

  return query
    select v_company_id, v_plan, v_interval;
end;
$$;

grant execute on function public.fire_s_set_company_plan(text, text) to authenticated;

drop function if exists public.fire_s_add_member_by_email(uuid, text, text);

create or replace function public.fire_s_add_member_by_email(
  p_company_id uuid,
  p_email text,
  p_role text default 'inspector'
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
  v_target uuid;
  v_can boolean := false;
  v_existing uuid;
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

  if exists (
    select 1
    from public.company_invites i
    where i.company_id = p_company_id
      and lower(trim(i.email)) = v_email
      and coalesce(i.status, 'pending') = 'pending'
  ) then
    raise exception 'This email is already a paid seat. They log in on any phone or desktop with that email. Do not enter it again.';
  end if;

  select p.id into v_target
  from public.profiles p
  where lower(trim(p.email)) = v_email
  limit 1;

  if v_target is null then
    select u.id into v_target
    from auth.users u
    where lower(trim(u.email)) = v_email
    limit 1;
  end if;

  if v_target is not null then
    select m.user_id into v_existing
    from public.company_members m
    where m.user_id = v_target
      and coalesce(m.status, 'active') = 'active'
    limit 1;

    if v_existing is not null then
      raise exception 'This email is already a paid seat. They log in on any phone or desktop with that email. Do not enter it again.';
    end if;

    perform public.fire_s_ensure_profile(v_target, v_email, v_role);

    insert into public.company_members (company_id, user_id, role, status)
    values (p_company_id, v_target, v_role, 'active')
    on conflict (company_id, user_id)
    do update set role = excluded.role, status = 'active';

    begin
      update public.profiles set role = v_role where id = v_target;
    exception when others then
      null;
    end;

    update public.company_invites
       set status = 'accepted'
     where company_id = p_company_id
       and lower(email) = v_email;

    return query select v_target, v_email, v_role, 'added'::text;
    return;
  end if;

  insert into public.company_invites (company_id, email, role, status, created_by)
  values (p_company_id, v_email, v_role, 'pending', v_uid)
  on conflict (company_id, email)
  do update set role = excluded.role, status = 'pending', created_by = v_uid;

  return query select null::uuid, v_email, v_role, 'invited'::text;
end;
$$;

grant execute on function public.fire_s_add_member_by_email(uuid, text, text) to authenticated;

commit;

select 'paid seats per email ready' as status;
