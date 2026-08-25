-- ============================================================
-- Fire-S Test ONLY — one person, one company.
--
-- STOP. Look at the TOP LEFT of this Supabase page.
-- The project name MUST say:  Fire-S Test
-- If it says fireye-sync, close this page. Do not Run.
--
-- This does NOT touch the live cloud (fireye-sync).
--
-- Keeps the company owned by georgevdx@gmail.com (the main
-- account for Johan and the app).
-- Removes extra memberships so nobody sits on two companies.
-- Then locks the cloud so one login can only be active in one
-- company.
-- ============================================================

begin;

do $$
declare
  v_inspections int := 0;
  v_keep_email text := 'georgevdx@gmail.com';
  v_keep_user uuid;
  v_keep_company uuid;
  v_removed_members int := 0;
  v_removed_companies int := 0;
begin
  if to_regclass('public.inspections') is not null then
    select count(*) into v_inspections from public.inspections;
  end if;

  if v_inspections > 20 then
    raise exception
      'STOP: % inspections found. This looks like the live cloud (fireye-sync). Do not run here.',
      v_inspections;
  end if;

  if to_regclass('public.company_members') is null
     or to_regclass('public.companies') is null then
    raise exception 'Company tables are missing. Run STAGING_BOOTSTRAP.sql first.';
  end if;

  select u.id
    into v_keep_user
    from auth.users u
   where lower(trim(u.email)) = v_keep_email
   limit 1;

  if v_keep_user is null then
    raise exception
      'STOP: % is not in Fire-S Test. Do not run this cleanup.',
      v_keep_email;
  end if;

  select m.company_id
    into v_keep_company
    from public.company_members m
   where m.user_id = v_keep_user
     and coalesce(m.status, 'active') = 'active'
     and lower(coalesce(m.role, '')) in ('company_owner', 'owner', 'super_admin')
   order by m.created_at asc
   limit 1;

  if v_keep_company is null then
    select m.company_id
      into v_keep_company
      from public.company_members m
     where m.user_id = v_keep_user
       and coalesce(m.status, 'active') = 'active'
     order by m.created_at asc
     limit 1;
  end if;

  if v_keep_company is null then
    raise exception
      'STOP: % has no company yet. Subscribe once as that email, then run this again.',
      v_keep_email;
  end if;

  -- Drop extra active memberships so one person is one company.
  -- Keep a person only if they belong to george's company.
  delete from public.company_members m
   where m.company_id is distinct from v_keep_company;

  get diagnostics v_removed_members = row_count;

  if to_regclass('public.company_invites') is not null then
    delete from public.company_invites i
     where i.company_id is distinct from v_keep_company;
  end if;

  if to_regclass('public.inspections') is not null then
    delete from public.inspections i
     where i.company_id is distinct from v_keep_company;
  end if;

  delete from public.companies c
   where c.id is distinct from v_keep_company;

  get diagnostics v_removed_companies = row_count;

  update public.company_members
     set status = 'active'
   where company_id = v_keep_company
     and user_id = v_keep_user;

  raise notice
    'Kept company % for %. Removed % extra membership(s) and % other company/companies.',
    v_keep_company,
    v_keep_email,
    v_removed_members,
    v_removed_companies;
end $$;

-- One login can only be active in one company.
drop index if exists public.company_members_one_active_user;
create unique index company_members_one_active_user
  on public.company_members (user_id)
  where coalesce(status, 'active') = 'active';

create or replace function public.fire_s_claim_my_invites()
returns table (
  out_company_id uuid,
  out_company_name text,
  out_role text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_existing uuid;
  v_name text;
  v_role text;
  r record;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  v_email := lower(trim(coalesce(
    nullif(auth.jwt() ->> 'email', ''),
    (select email from auth.users where id = v_uid)
  )));
  if v_email is null or v_email = '' then
    return;
  end if;

  perform public.fire_s_ensure_profile(v_uid, v_email, 'inspector');

  select m.company_id
    into v_existing
    from public.company_members m
   where m.user_id = v_uid
     and coalesce(m.status, 'active') = 'active'
   limit 1;

  if v_existing is not null then
    select c.name, m.role
      into v_name, v_role
      from public.company_members m
      left join public.companies c on c.id = m.company_id
     where m.user_id = v_uid
       and m.company_id = v_existing
     limit 1;
    out_company_id := v_existing;
    out_company_name := v_name;
    out_role := coalesce(v_role, 'inspector');
    return next;
    return;
  end if;

  select i.id, i.company_id, i.role, c.name as company_name
    into r
    from public.company_invites i
    join public.companies c on c.id = i.company_id
   where lower(trim(i.email)) = v_email
     and coalesce(i.status, 'pending') = 'pending'
   order by i.created_at asc
   limit 1;

  if not found then
    return;
  end if;

  begin
    insert into public.company_members (company_id, user_id, role, status)
    values (r.company_id, v_uid, r.role, 'active')
    on conflict (company_id, user_id)
    do update set role = excluded.role, status = 'active';
  exception when unique_violation then
    select m.company_id, c.name, m.role
      into out_company_id, out_company_name, out_role
      from public.company_members m
      left join public.companies c on c.id = m.company_id
     where m.user_id = v_uid
       and coalesce(m.status, 'active') = 'active'
     limit 1;
    if out_company_id is not null then
      return next;
    end if;
    return;
  end;

  update public.company_invites
     set status = 'accepted'
   where id = r.id;

  update public.company_invites
     set status = 'cancelled'
   where lower(trim(email)) = v_email
     and coalesce(status, 'pending') = 'pending'
     and id is distinct from r.id;

  begin
    update public.profiles set role = r.role where id = v_uid;
  exception when others then
    null;
  end;

  out_company_id := r.company_id;
  out_company_name := r.company_name;
  out_role := r.role;
  return next;
end;
$$;

grant execute on function public.fire_s_claim_my_invites() to authenticated;

commit;

select
  c.name as kept_company,
  u.email as owner_email,
  (
    select count(*)
    from public.company_members m
    where m.company_id = c.id
      and coalesce(m.status, 'active') = 'active'
  ) as people_in_that_company
from public.companies c
join public.company_members m on m.company_id = c.id
join auth.users u on u.id = m.user_id
where lower(trim(u.email)) = 'georgevdx@gmail.com'
  and coalesce(m.status, 'active') = 'active'
  and lower(coalesce(m.role, '')) in ('company_owner', 'owner', 'super_admin')
limit 1;
