-- Fire-S: enable "Begin as brand-new company"
-- Run this once in Supabase SQL Editor.

drop function if exists public.fire_s_start_fresh_company(text);

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

  update public.company_members
     set status = 'inactive'
   where user_id = v_uid
     and coalesce(status, 'active') = 'active';

  insert into public.companies (name, status, plan)
  values (v_name, 'active', 'development')
  returning id into v_company_id;

  insert into public.company_members as cm (company_id, user_id, role, status)
  values (v_company_id, v_uid, 'company_owner', 'active')
  on conflict (company_id, user_id)
  do update set role = 'company_owner', status = 'active';

  begin
    update public.profiles
       set role = 'company_owner'
     where id = v_uid;
  exception when others then
    null;
  end;

  return query
    select c.id, c.name, 'company_owner'::text
    from public.companies c
    where c.id = v_company_id;
end;
$$;

grant execute on function public.fire_s_start_fresh_company(text) to authenticated;

select 'fire_s_start_fresh_company ready' as status;
