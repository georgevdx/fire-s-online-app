-- Fire-S CLEANUP: keep only the database owner account (georgevdx@gmail.com)
-- Run in Supabase SQL Editor AFTER testing fresh registration.
-- WARNING: Deletes other companies, memberships, invites, and non-owner profiles.

begin;

-- 1) Keep this email only
-- Change if your main owner email is different:
--   georgevdx@gmail.com

create temporary table keep_users as
select id, email
from auth.users
where lower(email) = lower('georgevdx@gmail.com');

-- 2) Clear invites (ignore if table not created yet)
do $$
begin
  delete from public.company_invites where true;
exception
  when undefined_table then null;
end $$;

-- 3) Remove memberships for everyone except keep-user
delete from public.company_members m
where m.user_id not in (select id from keep_users);

-- 4) Remove companies that have no remaining members
delete from public.companies c
where not exists (
  select 1 from public.company_members m where m.company_id = c.id
);

-- 5) Soft-clean profiles for non-keep users (keep row if FK requires, else delete)
delete from public.profiles p
where p.id not in (select id from keep_users);

-- 6) Deactivate keep-user memberships so they can start a brand-new company cleanly
update public.company_members
   set status = 'inactive'
 where user_id in (select id from keep_users);

commit;

-- IMPORTANT: also delete other Auth users in Supabase Dashboard:
-- Authentication → Users → delete every user except georgevdx@gmail.com

select
  (select count(*) from auth.users) as auth_users_left,
  (select count(*) from public.companies) as companies_left,
  (select count(*) from public.company_members where coalesce(status,'active')='active') as active_memberships;
