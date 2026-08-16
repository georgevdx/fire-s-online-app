-- Fire-S: keep only the main owner email, clear other people/invites
-- Run in Supabase SQL Editor.
-- Change the email below if needed.

begin;

-- >>> MAIN EMAIL TO KEEP <<<
create temporary table keep_users as
select id, email
from auth.users
where lower(email) = lower('johandb@live.com');

-- 1) Cancel / delete all invites
do $$
begin
  delete from public.company_invites where true;
exception
  when undefined_table then null;
end $$;

-- 2) Remove every membership except the keep-user
delete from public.company_members m
where m.user_id not in (select id from keep_users);

-- 3) Keep keep-user as active owner on their company (if any)
update public.company_members cm
   set role = 'company_owner',
       status = 'active'
 where cm.user_id in (select id from keep_users);

-- 4) Remove orphan companies with no members
delete from public.companies c
where not exists (
  select 1 from public.company_members m where m.company_id = c.id
);

commit;

-- Optional (Dashboard): Authentication → Users
-- Delete every Auth user except johandb@live.com if you want a fully clean slate.

select
  (select count(*) from auth.users) as auth_users_left,
  (select email from auth.users where lower(email)=lower('johandb@live.com') limit 1) as kept_email,
  (select count(*) from public.company_invites where coalesce(status,'pending')='pending') as pending_invites,
  (select count(*) from public.company_members where coalesce(status,'active')='active') as active_members;
