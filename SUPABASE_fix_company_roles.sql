-- Fire-S: Fix company personnel roles for a known team layout.
-- Run in Supabase SQL Editor.
--
-- RUN ORDER:
--   1) SUPABASE_cleanup_test_companies.sql  (deactivate old test companies)
--   2) This file                             (set roles on Company S only)
--   3) SUPABASE_my_company.sql               (login picker RPC)
--   4) Optional: SUPABASE_delete_empty_test_companies.sql
--
-- Intended layout (Company S only — other companies are left unchanged):
--   georgevdx@gmail.com     → company_owner
--   johandb@live.com        → manager
--   johandb1974ik@gmail.com → inspector
--   com1@gmail.com          → inspector
--   coi1@gmail.com          → inspector
--   1@gmail.com             → inspector

begin;

drop function if exists public.fire_s_set_member_role_by_email(text, text);
drop function if exists public.fire_s_set_member_role_by_email(text, text, uuid);

create or replace function public.fire_s_set_member_role_by_email(
  p_email text,
  p_role text,
  p_company_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_company uuid := p_company_id;
begin
  select p.id
    into v_uid
  from public.profiles as p
  where lower(trim(p.email)) = lower(trim(p_email))
  limit 1;

  if v_uid is null then
    raise notice 'No profile for % — skip (invite them in Personnel first)', p_email;
    return;
  end if;

  if v_company is null then
    select c.id
      into v_company
    from public.companies as c
    where lower(trim(c.name)) = lower(trim('Company S'))
    order by c.created_at nulls last
    limit 1;
  end if;

  if v_company is null then
    raise notice 'Company S not found — skip role update for %', p_email;
    return;
  end if;

  update public.company_members as cm
     set role = p_role,
         status = 'active'
   where cm.user_id = v_uid
     and cm.company_id = v_company;

  begin
    update public.profiles as p
       set role = p_role
     where p.id = v_uid;
  exception when others then
    null;
  end;
end;
$$;

grant execute on function public.fire_s_set_member_role_by_email(text, text, uuid) to authenticated;

select public.fire_s_set_member_role_by_email('georgevdx@gmail.com', 'company_owner');
select public.fire_s_set_member_role_by_email('johandb@live.com', 'manager');
select public.fire_s_set_member_role_by_email('johandb1974ik@gmail.com', 'inspector');
select public.fire_s_set_member_role_by_email('com1@gmail.com', 'inspector');
select public.fire_s_set_member_role_by_email('coi1@gmail.com', 'inspector');
select public.fire_s_set_member_role_by_email('1@gmail.com', 'inspector');

-- Safety: johandb@live.com must not remain owner on Company S
update public.company_members as cm
   set role = 'manager'
  from public.profiles as p,
       public.companies as c
 where cm.user_id = p.id
   and cm.company_id = c.id
   and lower(trim(c.name)) = lower(trim('Company S'))
   and cm.role = 'company_owner'
   and lower(trim(p.email)) = 'johandb@live.com';

commit;

-- Verify:
-- select c.name, p.email, cm.role, cm.status
-- from company_members cm
-- join profiles p on p.id = cm.user_id
-- join companies c on c.id = cm.company_id
-- where coalesce(cm.status,'active') = 'active'
-- order by c.name, cm.role, p.email;
