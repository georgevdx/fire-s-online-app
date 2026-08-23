-- ============================================================
-- Fire-S Test ONLY — wipe the empty test cloud so Subscribe
-- can be done from the start.
--
-- STOP. Look at the TOP LEFT of this Supabase page.
-- The project name MUST say:  Fire-S Test
-- If it says fireye-sync, close this page. Do not Run.
--
-- This does NOT touch the live cloud (fireye-sync).
--
-- Keeps these logins (your real Supabase emails):
--   johandb@live.com
--   johandb1974ik@gmail.com
--   georgevdx@gmail.com
--   any @supabase.io address
--
-- Deletes other Fire-S Test logins (toets / +toets / extra test emails).
-- Also deletes test companies, members, invites and inspections.
-- ============================================================

begin;

do $$
declare
  v_inspections int := 0;
  v_keep text[] := array[
    'johandb@live.com',
    'johandb1974ik@gmail.com',
    'georgevdx@gmail.com'
  ];
  v_deleted text;
  v_kept text;
  v_deleted_n int := 0;
begin
  if to_regclass('public.inspections') is not null then
    select count(*) into v_inspections from public.inspections;
  end if;

  if v_inspections > 20 then
    raise exception
      'STOP: % inspections found. This looks like the live cloud (fireye-sync). Do not run here.',
      v_inspections;
  end if;

  select string_agg(email, ', ' order by email)
    into v_kept
    from auth.users
   where email is not null
     and (
       lower(trim(email)) = any (v_keep)
       or lower(trim(email)) like '%@supabase.io'
     );

  select string_agg(email, ', ' order by email)
    into v_deleted
    from auth.users
   where email is not null
     and not (
       lower(trim(email)) = any (v_keep)
       or lower(trim(email)) like '%@supabase.io'
     );

  raise notice 'Keeping: %', coalesce(v_kept, '(none)');
  raise notice 'Deleting test logins: %', coalesce(v_deleted, '(none)');

  if to_regclass('public.inspections') is not null then
    delete from public.inspections;
  end if;

  if to_regclass('public.service_requests') is not null then
    delete from public.service_requests;
  end if;

  if to_regclass('public.beta_feedback') is not null then
    delete from public.beta_feedback;
  end if;

  if to_regclass('public.company_invites') is not null then
    delete from public.company_invites;
  end if;

  if to_regclass('public.company_members') is not null then
    delete from public.company_members;
  end if;

  if to_regclass('public.companies') is not null then
    delete from public.companies;
  end if;

  -- Do not delete storage.objects here. Supabase blocks that
  -- (use the Storage API). Empty photos are not needed to Subscribe.

  delete from auth.users
   where email is not null
     and not (
       lower(trim(email)) = any (v_keep)
       or lower(trim(email)) like '%@supabase.io'
     );

  get diagnostics v_deleted_n = row_count;

  if to_regclass('public.profiles') is not null then
    delete from public.profiles p
     where not exists (select 1 from auth.users u where u.id = p.id);
  end if;

  raise notice 'Deleted % test login(s). Fire-S Test is empty. Ready for first Subscribe.', v_deleted_n;
end $$;

commit;

-- One Subscribe: confirm new Fire-S Test logins immediately.
-- The app can then sign in and create the company in the same tap.
-- Do not run this on fireye-sync.

do $$
declare
  v_inspections int := 0;
begin
  if to_regclass('public.inspections') is not null then
    select count(*) into v_inspections from public.inspections;
  end if;
  if v_inspections > 20 then
    raise exception 'STOP: do not add autoconfirm on the live cloud.';
  end if;
end $$;

create or replace function public.fire_s_test_autoconfirm()
returns trigger
language plpgsql
security definer
set search_path = auth, public
as $$
begin
  update auth.users
     set email_confirmed_at = coalesce(email_confirmed_at, now())
   where id = new.id;
  return new;
end;
$$;

drop trigger if exists fire_s_test_autoconfirm on auth.users;
create trigger fire_s_test_autoconfirm
  after insert on auth.users
  for each row
  execute function public.fire_s_test_autoconfirm();

select
  (select count(*) from auth.users) as logins_kept,
  (select string_agg(email, ', ' order by email) from auth.users) as emails_kept,
  (select count(*) from public.companies) as companies_left,
  'Fire-S Test reset ready' as status;
