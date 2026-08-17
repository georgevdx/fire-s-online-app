-- Fire-S: Fix company personnel roles for a known team layout.
-- Run in Supabase SQL Editor after replacing v_company_id with your company UUID
-- (or leave null to target the company georgevdx@gmail.com belongs to).
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

-- Deactivate duplicate shell company so login always lands on the main team (Company S).
update public.company_members as cm
   set status = 'inactive'
  from public.profiles as p, public.companies as c
 where cm.user_id = p.id
   and cm.company_id = c.id
   and lower(trim(p.email)) = 'johandb@live.com'
   and lower(trim(c.name)) like '%fire-s company%'
   and exists (
     select 1
       from public.company_members as cm2
       join public.companies as c2 on c2.id = cm2.company_id
      where cm2.user_id = p.id
        and coalesce(cm2.status, 'active') = 'active'
        and cm2.company_id <> cm.company_id
        and (
          select count(*)
            from public.company_members as cm3
           where cm3.company_id = cm2.company_id
             and coalesce(cm3.status, 'active') = 'active'
        ) > (
          select count(*)
            from public.company_members as cm4
           where cm4.company_id = cm.company_id
             and coalesce(cm4.status, 'active') = 'active'
        )
   );

commit;

-- Verify:
-- select p.email, cm.role, cm.status
-- from company_members cm
-- join profiles p on p.id = cm.user_id
-- order by cm.role, p.email;
