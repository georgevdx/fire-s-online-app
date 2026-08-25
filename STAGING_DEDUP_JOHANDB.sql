-- ============================================================
-- Fire-S Test ONLY — one johandb@live.com.
--
-- STOP. Look at the TOP LEFT of this Supabase page.
-- The project name MUST say:  Fire-S Test
-- If it says fireye-sync, close this page. Do not Run.
--
-- This does NOT touch the live cloud (fireye-sync).
--
-- Keeps ONE johandb@live.com login — the one on the company
-- owned by georgevdx@gmail.com (the main account).
-- Removes extra johandb logins, extra memberships, and extra
-- invites. Other kept logins stay (george, johandb1974, @supabase.io).
-- ============================================================

begin;

do $$
declare
  v_inspections int := 0;
  v_keep_owner text := 'georgevdx@gmail.com';
  v_keep_email text := 'johandb@live.com';
  v_keep_company uuid;
  v_keep_johandb uuid;
  v_owner_user uuid;
  v_extra uuid;
  v_removed_logins int := 0;
  v_removed_members int := 0;
  v_removed_invites int := 0;
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
    into v_owner_user
    from auth.users u
   where lower(trim(u.email)) = v_keep_owner
   limit 1;

  if v_owner_user is not null then
    select m.company_id
      into v_keep_company
      from public.company_members m
     where m.user_id = v_owner_user
       and coalesce(m.status, 'active') = 'active'
       and lower(coalesce(m.role, '')) in ('company_owner', 'owner', 'super_admin')
     order by m.created_at asc
     limit 1;

    if v_keep_company is null then
      select m.company_id
        into v_keep_company
        from public.company_members m
       where m.user_id = v_owner_user
         and coalesce(m.status, 'active') = 'active'
       order by m.created_at asc
       limit 1;
    end if;
  end if;

  -- Prefer the johandb login that already sits on george's company.
  if v_keep_company is not null then
    select u.id
      into v_keep_johandb
      from auth.users u
      join public.company_members m on m.user_id = u.id
     where lower(trim(u.email)) = v_keep_email
       and m.company_id = v_keep_company
     order by case
                when lower(coalesce(m.role, '')) in ('company_owner', 'owner', 'super_admin', 'manager')
                  then 0
                else 1
              end,
              u.created_at asc
     limit 1;
  end if;

  if v_keep_johandb is null then
    select u.id
      into v_keep_johandb
      from auth.users u
     where lower(trim(u.email)) = v_keep_email
     order by u.created_at asc
     limit 1;
  end if;

  if v_keep_johandb is null then
    raise exception
      'STOP: % is not in Fire-S Test. Nothing to clean.',
      v_keep_email;
  end if;

  if v_keep_company is null then
    select m.company_id
      into v_keep_company
      from public.company_members m
     where m.user_id = v_keep_johandb
     order by m.created_at asc
     limit 1;
  end if;

  if to_regclass('public.company_invites') is not null then
    delete from public.company_invites i
     where lower(trim(i.email)) = v_keep_email;
    get diagnostics v_removed_invites = row_count;
  end if;

  delete from public.company_members m
   where m.user_id in (
           select u.id
           from auth.users u
          where lower(trim(u.email)) = v_keep_email
         )
     and m.user_id is distinct from v_keep_johandb;

  get diagnostics v_removed_members = row_count;

  delete from public.company_members m
   where m.user_id = v_keep_johandb
     and v_keep_company is not null
     and m.company_id is distinct from v_keep_company;

  if to_regclass('public.inspections') is not null then
    update public.inspections i
       set user_id = v_keep_johandb
     where i.user_id in (
             select u.id
             from auth.users u
            where lower(trim(u.email)) = v_keep_email
              and u.id is distinct from v_keep_johandb
           );
  end if;

  for v_extra in
    select u.id
    from auth.users u
    where lower(trim(u.email)) = v_keep_email
      and u.id is distinct from v_keep_johandb
  loop
    if to_regclass('public.profiles') is not null then
      delete from public.profiles where id = v_extra;
    end if;
    begin
      delete from auth.refresh_tokens where user_id = v_extra;
    exception when others then
      null;
    end;
    begin
      delete from auth.sessions where user_id = v_extra;
    exception when others then
      null;
    end;
    begin
      delete from auth.identities where user_id = v_extra;
    exception when others then
      null;
    end;
    delete from auth.users where id = v_extra;
    v_removed_logins := v_removed_logins + 1;
  end loop;

  if v_keep_company is not null then
    insert into public.company_members (company_id, user_id, role, status)
    values (v_keep_company, v_keep_johandb, 'manager', 'active')
    on conflict (company_id, user_id)
    do update set status = 'active';
  end if;

  if to_regclass('public.profiles') is not null then
    update public.profiles
       set email = v_keep_email
     where id = v_keep_johandb;
  end if;

  if to_regclass('public.companies') is not null then
    delete from public.companies c
     where not exists (
       select 1
       from public.company_members m
       where m.company_id = c.id
     );
  end if;

  raise notice
    'Kept one % on company %. Removed % extra login(s), % extra membership(s), % extra invite(s).',
    v_keep_email,
    v_keep_company,
    v_removed_logins,
    v_removed_members,
    v_removed_invites;
end $$;

commit;

select
  u.email as kept_login,
  c.name as company_name,
  m.role as role_on_that_company,
  (
    select count(*)
    from auth.users x
    where lower(trim(x.email)) = 'johandb@live.com'
  ) as johandb_logins_left,
  (
    select count(*)
    from public.company_members cm
    join auth.users x on x.id = cm.user_id
    where lower(trim(x.email)) = 'johandb@live.com'
  ) as johandb_memberships_left,
  (
    select count(*)
    from public.company_invites i
    where lower(trim(i.email)) = 'johandb@live.com'
  ) as johandb_invites_left
from auth.users u
left join public.company_members m
  on m.user_id = u.id
 and coalesce(m.status, 'active') = 'active'
left join public.companies c on c.id = m.company_id
where lower(trim(u.email)) = 'johandb@live.com';
