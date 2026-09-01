-- ============================================================
-- LIVE fireye-sync — keep Fire-S, merge Great Sample Co, delete tests
--
-- STOP. Look at the TOP LEFT of this Supabase page.
-- The project name MUST say:  fireye-sync
-- If it says Fire-S Test, close this page. Do not Run.
--
-- Johan 1 Sep 2026:
--   KEEP name Fire-S (#1, 108 inspections)
--   MERGE Great Sample Co (#5) into Fire-S
--   Owner login: georgevdx@gmail.com  (access to all those inspections)
--   KEEP Secure (#10)
--   DELETE:
--     Test Company Demo
--     johandb Fire Safety
--     Fire-S Company
--     co1
--     1co
--     co2
--     Test Fire Safety Company
--
-- Does NOT delete auth.users.
-- Moves Great Sample Co inspections onto Fire-S (they stay).
-- Deletes inspections that sit only on the seven test companies.
--
-- WORKFLOW:
--   1) Run section A (PREVIEW) — read only
--   2) If the preview matches the list, run section B (APPLY)
--   3) Run section C (VERIFY)
--   4) Logout and Login as georgevdx@gmail.com
-- ============================================================


-- =============================================================================
-- A) PREVIEW — read-only
-- Paste ONLY this select. Clear the editor first. Do not paste comments.
-- =============================================================================

select
  c.name as company_name,
  coalesce(a.action, 'LEAVE (not on Johan list)') as action,
  (select count(*) from public.company_members m where m.company_id = c.id) as people,
  (select count(*) from public.inspections i where i.company_id = c.id) as inspections
from public.companies c
left join (
  values
    (concat('Fire', '-', 'S'), 'KEEP and receive Great Sample Co inspections'),
    ('Great Sample Co', 'MERGE into the main company, then remove this name'),
    ('Secure', 'KEEP'),
    ('Test Company Demo', 'DELETE'),
    ('johandb Fire Safety', 'DELETE'),
    (concat('Fire', '-', 'S Company'), 'DELETE'),
    ('co1', 'DELETE'),
    ('1co', 'DELETE'),
    ('co2', 'DELETE'),
    ('Test Fire Safety Company', 'DELETE')
) as a(name, action)
  on lower(trim(c.name)) = lower(trim(a.name))
order by c.created_at;


-- =============================================================================
-- B) APPLY — run only after preview looks right
-- =============================================================================

begin;

do $$
declare
  v_keep uuid;
  v_merge uuid;
  v_george uuid;
  v_before int := 0;
  v_moved int := 0;
  v_drop_insp int := 0;
  v_drop_members int := 0;
  v_drop_invites int := 0;
  v_drop_cos int := 0;
  v_keep_count int := 0;
begin
  if to_regclass('public.companies') is null
     or to_regclass('public.company_members') is null then
    raise exception 'Company tables missing. Wrong project?';
  end if;

  select c.id into v_keep
  from public.companies c
  where lower(trim(c.name)) = lower(concat('Fire', '-', 'S'))
  order by c.created_at
  limit 1;

  if v_keep is null then
    raise exception 'STOP: company Fire-S not found. Wrong cloud?';
  end if;

  select count(*) into v_before
  from public.inspections i
  where i.company_id = v_keep;

  if v_before < 100 then
    raise exception
      'STOP: Fire-S has only % inspections. This does not look like live fireye-sync.',
      v_before;
  end if;

  select c.id into v_merge
  from public.companies c
  where lower(trim(c.name)) = 'great sample co'
  order by c.created_at
  limit 1;

  select u.id into v_george
  from auth.users u
  where lower(trim(u.email)) = 'georgevdx@gmail.com'
  limit 1;

  if v_george is null then
    raise exception 'STOP: georgevdx@gmail.com is not in Auth. Do not continue.';
  end if;

  -- Move Great Sample Co inspections onto Fire-S
  if v_merge is not null then
    update public.inspections i
       set company_id = v_keep,
           inspection_data = coalesce(i.inspection_data, '{}'::jsonb)
             || jsonb_build_object('companyId', v_keep, 'company_id', v_keep)
     where i.company_id = v_merge;
    get diagnostics v_moved = row_count;

    -- People already on Fire-S: drop their Great Sample Co row
    delete from public.company_members m
     where m.company_id = v_merge
       and exists (
         select 1 from public.company_members x
         where x.company_id = v_keep
           and x.user_id = m.user_id
       );

    -- Remaining Great Sample Co people: move onto Fire-S
    update public.company_members m
       set company_id = v_keep,
           status = 'active'
     where m.company_id = v_merge;

    if to_regclass('public.company_invites') is not null then
      delete from public.company_invites i
       where i.company_id = v_merge
         and exists (
           select 1 from public.company_invites x
           where x.company_id = v_keep
             and lower(trim(x.email)) = lower(trim(i.email))
         );
      update public.company_invites i
         set company_id = v_keep
       where i.company_id = v_merge;
    end if;

    delete from public.companies c where c.id = v_merge;
  end if;

  -- georgevdx@gmail.com is owner of Fire-S
  insert into public.company_members (company_id, user_id, role, status)
  values (v_keep, v_george, 'company_owner', 'active')
  on conflict (company_id, user_id)
  do update set role = 'company_owner', status = 'active';

  update public.profiles
     set role = 'company_owner',
         email = 'georgevdx@gmail.com'
   where id = v_george;

  -- Drop the seven test companies
  if to_regclass('public.inspections') is not null then
    delete from public.inspections i
     using public.companies c
     where i.company_id = c.id
       and lower(trim(c.name)) in (
         'test company demo',
         'johandb fire safety',
         lower(concat('Fire', '-', 'S Company')),
         'co1',
         '1co',
         'co2',
         'test fire safety company'
       );
    get diagnostics v_drop_insp = row_count;
  end if;

  if to_regclass('public.company_invites') is not null then
    delete from public.company_invites i
     using public.companies c
     where i.company_id = c.id
       and lower(trim(c.name)) in (
         'test company demo',
         'johandb fire safety',
         lower(concat('Fire', '-', 'S Company')),
         'co1',
         '1co',
         'co2',
         'test fire safety company'
       );
    get diagnostics v_drop_invites = row_count;
  end if;

  delete from public.company_members m
   using public.companies c
   where m.company_id = c.id
     and lower(trim(c.name)) in (
       'test company demo',
       'johandb fire safety',
       lower(concat('Fire', '-', 'S Company')),
       'co1',
       '1co',
       'co2',
       'test fire safety company'
     );
  get diagnostics v_drop_members = row_count;

  delete from public.companies c
   where lower(trim(c.name)) in (
     'test company demo',
     'johandb fire safety',
     lower(concat('Fire', '-', 'S Company')),
     'co1',
     '1co',
     'co2',
     'test fire safety company'
   );
  get diagnostics v_drop_cos = row_count;

  select count(*) into v_keep_count
  from public.inspections i
  where i.company_id = v_keep;

  if v_keep_count < v_before then
    raise exception
      'STOP: Fire-S inspections dropped from % to %. Rolling back.',
      v_before, v_keep_count;
  end if;

  raise notice
    'Fire-S kept. Moved % Great Sample Co inspection(s). Fire-S now has %. Removed % test inspection(s), % membership(s), % invite(s), % test company/companies.',
    v_moved, v_keep_count, v_drop_insp, v_drop_members, v_drop_invites, v_drop_cos;
end $$;

commit;


-- =============================================================================
-- C) VERIFY
-- =============================================================================

select
  c.name as company_name,
  c.status,
  (
    select string_agg(coalesce(u.email, p.email), ', ' order by u.email)
    from public.company_members m
    left join auth.users u on u.id = m.user_id
    left join public.profiles p on p.id = m.user_id
    where m.company_id = c.id
      and coalesce(m.status, 'active') = 'active'
      and lower(coalesce(m.role, '')) in ('company_owner', 'owner', 'super_admin')
  ) as owner_email,
  (select count(*) from public.company_members m where m.company_id = c.id) as people,
  (select count(*) from public.inspections i where i.company_id = c.id) as inspections
from public.companies c
order by c.created_at;

-- Expect: Fire-S (about 118 inspections, owner georgevdx@gmail.com) and Secure.
-- Fire-S inspections must not be below 108.
