-- Optional: keep company letterhead (address, phones, email, logo) in the cloud
-- so owner/manager changes appear on other phones too.
-- Run once in the Supabase SQL Editor.

begin;

alter table public.companies
  add column if not exists address text,
  add column if not exists phone text,
  add column if not exists mobile text,
  add column if not exists email text,
  add column if not exists logo_data text;

create or replace function public.fire_s_update_company_letterhead(
  p_name text,
  p_address text,
  p_phone text,
  p_mobile text,
  p_email text,
  p_logo_data text
)
returns table (
  out_company_id uuid,
  out_company_name text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_company_id uuid;
  v_role text;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select m.company_id, m.role::text
    into v_company_id, v_role
  from public.company_members as m
  where m.user_id = v_uid
    and coalesce(m.status, 'active') = 'active'
  order by case m.role
    when 'company_owner' then 0
    when 'manager' then 1
    else 2
  end
  limit 1;

  if v_company_id is null then
    raise exception 'No company linked';
  end if;

  if coalesce(v_role, '') not in ('company_owner', 'manager', 'super_admin', 'owner') then
    raise exception 'Only the owner or manager can edit company details';
  end if;

  update public.companies as c
     set name = coalesce(nullif(trim(p_name), ''), c.name),
         address = p_address,
         phone = p_phone,
         mobile = p_mobile,
         email = p_email,
         logo_data = p_logo_data
   where c.id = v_company_id;

  return query
    select c.id, c.name
    from public.companies as c
    where c.id = v_company_id;
end;
$$;

grant execute on function public.fire_s_update_company_letterhead(text, text, text, text, text, text)
  to authenticated;

commit;
