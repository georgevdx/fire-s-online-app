-- Fire-S: Fix company personnel roles for a known team layout.
-- Run in Supabase SQL Editor.
--
-- RUN ORDER:
--   1) SUPABASE_cleanup_test_companies.sql  (deactivate old test companies)
--   2) This file                             (set roles on Company S)
--   3) SUPABASE_my_company.sql               (optional — refresh login picker RPC)
--
-- Intended layout:
--   georgevdx@gmail.com     → company_owner
--   johandb@live.com        → manager
--   johandb1974ik@gmail.com → inspector
--   com1@gmail.com          → inspector
--   coi1@gmail.com          → inspector
--   1@gmail.com             → inspector

begin;

create or replace function public.fire_s_set_member_role_by_email(
  p_email text,
  p_role text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
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

  update public.company_members as cm
     set role = p_role,
         status = 'active'
   where cm.user_id = v_uid
     and coalesce(cm.status, 'active') = 'active';

  begin
    update public.profiles as p
       set role = p_role
     where p.id = v_uid;
  exception when others then
    null;
  end;
end;
$$;

grant execute on function public.fire_s_set_member_role_by_email(text, text) to authenticated;

select public.fire_s_set_member_role_by_email('georgevdx@gmail.com', 'company_owner');
select public.fire_s_set_member_role_by_email('johandb@live.com', 'manager');
select public.fire_s_set_member_role_by_email('johandb1974ik@gmail.com', 'inspector');
select public.fire_s_set_member_role_by_email('com1@gmail.com', 'inspector');
select public.fire_s_set_member_role_by_email('coi1@gmail.com', 'inspector');
select public.fire_s_set_member_role_by_email('1@gmail.com', 'inspector');

-- Ensure only one owner per company (optional safety check)
-- Demote duplicate owners except georgevdx@gmail.com
update public.company_members as cm
   set role = 'manager'
  from public.profiles as p
 where cm.user_id = p.id
   and cm.role = 'company_owner'
   and lower(trim(p.email)) <> 'georgevdx@gmail.com'
   and lower(trim(p.email)) = 'johandb@live.com';

-- Deactivate duplicate shell companies: see SUPABASE_cleanup_test_companies.sql
-- (lists all test companies for team emails and deactivates everything except Company S)

commit;

-- Verify:
-- select p.email, cm.role, cm.status
-- from company_members cm
-- join profiles p on p.id = cm.user_id
-- order by cm.role, p.email;
