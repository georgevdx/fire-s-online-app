-- Fire-S Test (staging) one-time setup.
-- Run ALL of this once in the Fire-S Test project → SQL Editor → Run.
-- Do NOT run this on fireye-sync (the live cloud).

begin;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  role text default 'inspector',
  created_at timestamptz not null default now()
);

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'active',
  plan text default 'standard',
  billing_interval text default 'monthly',
  address text,
  phone text,
  mobile text,
  email text,
  logo_data text,
  created_at timestamptz not null default now()
);

create table if not exists public.company_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'inspector',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  unique (company_id, user_id)
);

create table if not exists public.company_invites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  email text not null,
  role text not null default 'inspector',
  status text not null default 'pending',
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (company_id, email)
);

create table if not exists public.inspections (
  id uuid primary key,
  user_id uuid references auth.users (id) on delete set null,
  company_id uuid references public.companies (id) on delete set null,
  created_by_email text,
  inspection_data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.service_requests (
  id uuid primary key default gen_random_uuid(),
  selected_service text,
  client_name text,
  client_phone text,
  client_email text,
  message text,
  status text default 'new',
  created_by_user_id uuid,
  created_by_email text,
  created_at timestamptz not null default now()
);

create table if not exists public.beta_feedback (
  id uuid primary key default gen_random_uuid(),
  status text,
  followup_note text,
  payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists company_members_user_idx on public.company_members (user_id);
do $$
begin
  execute $idx$
    create unique index if not exists company_members_one_active_user
      on public.company_members (user_id)
      where coalesce(status, 'active') = 'active'
  $idx$;
exception when unique_violation then
  raise notice
    'Skipped one-person-one-company index: a login is still on two companies. Run STAGING_ONE_COMPANY.sql in Fire-S Test next.';
end $$;
create index if not exists company_invites_email_idx on public.company_invites (lower(email));
create index if not exists inspections_company_idx on public.inspections (company_id);
create index if not exists inspections_user_idx on public.inspections (user_id);

create or replace function public.fire_s_ensure_profile(
  p_user_id uuid,
  p_email text,
  p_role text default 'inspector'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    p_user_id,
    lower(trim(p_email)),
    split_part(lower(trim(p_email)), '@', 1),
    coalesce(nullif(trim(p_role), ''), 'inspector')
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(nullif(public.profiles.full_name, ''), excluded.full_name);
exception when others then
  null;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    lower(coalesce(new.email, new.id::text)),
    split_part(lower(coalesce(new.email, 'user')), '@', 1),
    'inspector'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.fire_s_is_company_member(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_company_id is not null
    and exists (
      select 1 from public.company_members m
      where m.company_id = p_company_id
        and m.user_id = auth.uid()
        and coalesce(m.status, 'active') = 'active'
    );
$$;

create or replace function public.fire_s_can_manage_company(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.company_members m
    where m.company_id = p_company_id
      and m.user_id = auth.uid()
      and m.role in ('company_owner', 'manager', 'super_admin', 'owner')
      and coalesce(m.status, 'active') = 'active'
  );
$$;

create or replace function public.fire_s_create_company(p_name text, p_plan text default 'standard')
returns table (
  out_company_id uuid,
  out_company_name text,
  out_member_role text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_company_id uuid;
  v_name text := nullif(trim(p_name), '');
  v_role text;
  v_plan text := lower(nullif(trim(p_plan), ''));
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if v_name is null then
    v_name := 'Fire-S Company';
  end if;
  if v_plan is null or v_plan not in ('standard', 'seat', 'field', 'operations', 'executive', 'enterprise') then
    v_plan := 'standard';
  end if;

  perform public.fire_s_ensure_profile(v_uid, coalesce((select email from auth.users where id = v_uid), v_uid::text), 'company_owner');

  select m.company_id, m.role
    into v_company_id, v_role
    from public.company_members as m
   where m.user_id = v_uid
     and coalesce(m.status, 'active') = 'active'
   order by case m.role when 'company_owner' then 0 else 1 end
   limit 1;

  if v_company_id is not null then
    return query
      select c.id, c.name, coalesce(v_role, 'company_owner')::text
      from public.companies as c
      where c.id = v_company_id;
    return;
  end if;

  insert into public.companies as c (name, status, plan, billing_interval)
  values (v_name, 'active', v_plan, 'monthly')
  returning c.id into v_company_id;

  insert into public.company_members as cm (company_id, user_id, role, status)
  values (v_company_id, v_uid, 'company_owner', 'active')
  on conflict (company_id, user_id)
  do update set role = 'company_owner', status = 'active';

  update public.profiles set role = 'company_owner' where id = v_uid;

  return query select c.id, c.name, 'company_owner'::text from public.companies c where c.id = v_company_id;
end;
$$;

create or replace function public.fire_s_set_company_plan(p_plan text, p_interval text default 'monthly')
returns table (
  out_company_id uuid,
  out_plan text,
  out_interval text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_company_id uuid;
  v_plan text := lower(nullif(trim(p_plan), ''));
  v_interval text := lower(nullif(trim(p_interval), ''));
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if v_plan is null or v_plan not in ('standard', 'seat', 'field', 'operations', 'executive', 'enterprise') then
    v_plan := 'standard';
  end if;
  if v_interval is null or v_interval not in ('monthly', 'annual') then
    v_interval := 'monthly';
  end if;

  select m.company_id into v_company_id
  from public.company_members as m
  where m.user_id = v_uid
    and coalesce(m.status, 'active') = 'active'
    and m.role in ('company_owner', 'owner', 'super_admin')
  order by case m.role when 'company_owner' then 0 else 1 end
  limit 1;

  if v_company_id is null then
    raise exception 'Only the Owner can change the package';
  end if;

  update public.companies
     set plan = v_plan,
         billing_interval = v_interval
   where id = v_company_id;

  return query select v_company_id, v_plan, v_interval;
end;
$$;

create or replace function public.fire_s_start_fresh_company(p_name text)
returns table (
  out_company_id uuid,
  out_company_name text,
  out_member_role text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_company_id uuid;
  v_name text := nullif(trim(p_name), '');
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if v_name is null then
    v_name := 'New Fire-S Company';
  end if;

  if exists (
    select 1
    from public.company_members m
    where m.user_id = v_uid
      and coalesce(m.status, 'active') = 'active'
      and lower(coalesce(m.role, '')) not in ('company_owner', 'owner', 'super_admin')
  ) then
    raise exception
      'You already belong to a company. Only that Owner can remove you under Personnel. Then you can Subscribe under a new company name.';
  end if;

  update public.company_members
     set status = 'inactive'
   where user_id = v_uid
     and coalesce(status, 'active') = 'active';

  insert into public.companies (name, status, plan)
  values (v_name, 'active', 'standard')
  returning id into v_company_id;

  insert into public.company_members as cm (company_id, user_id, role, status)
  values (v_company_id, v_uid, 'company_owner', 'active')
  on conflict (company_id, user_id)
  do update set role = 'company_owner', status = 'active';

  update public.profiles set role = 'company_owner' where id = v_uid;

  return query select c.id, c.name, 'company_owner'::text from public.companies c where c.id = v_company_id;
end;
$$;

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

  return query select c.id, c.name from public.companies c where c.id = v_company_id;
end;
$$;

create or replace function public.fire_s_add_member_by_email(
  p_company_id uuid,
  p_email text,
  p_role text default 'inspector'
)
returns table (
  out_user_id uuid,
  out_email text,
  out_role text,
  out_status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(trim(p_email));
  v_role text := lower(trim(coalesce(p_role, 'inspector')));
  v_target uuid;
  v_can boolean := false;
  v_existing uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if v_email is null or position('@' in v_email) = 0 then
    raise exception 'Enter a valid email address';
  end if;
  if v_role not in ('inspector', 'manager', 'company_owner', 'viewer') then
    v_role := 'inspector';
  end if;

  select public.fire_s_can_manage_company(p_company_id) into v_can;
  if not v_can then
    raise exception 'Only Manager or Owner can add team members';
  end if;

  if exists (
    select 1 from public.company_invites i
    where i.company_id = p_company_id
      and lower(trim(i.email)) = v_email
      and coalesce(i.status, 'pending') = 'pending'
  ) then
    raise exception 'This email is already a paid seat. They log in on any phone or desktop with that email. Do not enter it again.';
  end if;

  select p.id into v_target from public.profiles p where lower(trim(p.email)) = v_email limit 1;
  if v_target is null then
    select u.id into v_target from auth.users u where lower(trim(u.email)) = v_email limit 1;
  end if;

  if v_target is not null then
    update public.company_members
       set status = 'active',
           role = v_role
     where company_id = p_company_id
       and user_id = v_target
       and coalesce(status, 'active') = 'inactive';
    if found then
      update public.profiles set role = v_role where id = v_target;
      update public.company_invites
         set status = 'accepted'
       where company_id = p_company_id
         and lower(trim(email)) = v_email;
      return query select v_target, v_email, v_role, 'added'::text;
      return;
    end if;

    select m.company_id into v_existing
    from public.company_members m
    where m.user_id = v_target and coalesce(m.status, 'active') = 'active'
    limit 1;
    if v_existing is not null then
      if v_existing = p_company_id then
        raise exception 'This email is already a paid seat. They log in on any phone or desktop with that email. Do not enter it again.';
      end if;
      raise exception 'This email already belongs to a company. One person is one company. They Login with that email.';
    end if;

    perform public.fire_s_ensure_profile(v_target, v_email, v_role);
    begin
      insert into public.company_members (company_id, user_id, role, status)
      values (p_company_id, v_target, v_role, 'active')
      on conflict (company_id, user_id)
      do update set role = excluded.role, status = 'active';
    exception when unique_violation then
      raise exception 'This email already belongs to a company. One person is one company. They Login with that email.';
    end;
    update public.profiles set role = v_role where id = v_target;
    update public.company_invites
       set status = 'accepted'
     where company_id = p_company_id and lower(trim(email)) = v_email;
    return query select v_target, v_email, v_role, 'added'::text;
    return;
  end if;

  update public.company_invites
     set status = 'pending',
         role = v_role,
         created_by = v_uid
   where company_id = p_company_id
     and lower(trim(email)) = v_email
     and lower(coalesce(status, 'pending')) in (
       'cancelled', 'canceled', 'expired', 'declined', 'rejected'
     );
  if found then
    return query select null::uuid, v_email, v_role, 'invited'::text;
    return;
  end if;

  begin
    insert into public.company_invites (company_id, email, role, status, created_by)
    values (p_company_id, v_email, v_role, 'pending', v_uid)
    on conflict (company_id, email)
    do update set role = excluded.role, status = 'pending', created_by = v_uid;
  exception when unique_violation then
    update public.company_invites
       set status = 'pending',
           role = v_role,
           created_by = v_uid
     where company_id = p_company_id
       and lower(trim(email)) = v_email;
    if not found then
      raise;
    end if;
  when others then
    update public.company_invites
       set status = 'pending',
           role = v_role,
           created_by = v_uid
     where company_id = p_company_id
       and lower(trim(email)) = v_email;
    if not found then
      raise;
    end if;
  end;

  return query select null::uuid, v_email, v_role, 'invited'::text;
end;
$$;

create or replace function public.fire_s_upsert_inspection(
  p_id text,
  p_inspection_data jsonb,
  p_company_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := null;
  v_company uuid := null;
  v_company_text text := nullif(trim(coalesce(p_company_id, '')), '');
  v_id_text text := nullif(trim(coalesce(p_id, '')), '');
  v_owner uuid := null;
  v_existing_company uuid := null;
  v_saved_company uuid := null;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if v_id_text is null then
    raise exception 'Inspection id required';
  end if;

  select u.email into v_email from auth.users u where u.id = v_uid;
  perform public.fire_s_ensure_profile(v_uid, coalesce(v_email, v_uid::text), 'inspector');

  if v_company_text is null then
    v_company_text := nullif(trim(coalesce(
      p_inspection_data->>'companyId',
      p_inspection_data->>'company_id',
      ''
    )), '');
  end if;

  if v_company_text is not null then
    begin
      if public.fire_s_is_company_member(v_company_text::uuid) then
        v_company := v_company_text::uuid;
      end if;
    exception when others then
      v_company := null;
    end;
  end if;

  if v_company is null then
    select m.company_id into v_company
    from public.company_members m
    where m.user_id = v_uid and coalesce(m.status, 'active') = 'active'
    limit 1;
  end if;

  select i.user_id, i.company_id
    into v_owner, v_existing_company
  from public.inspections i
  where i.id::text = v_id_text
  limit 1;

  if v_owner is not null then
    if v_owner <> v_uid and not public.fire_s_is_company_member(v_existing_company) then
      raise exception 'Not allowed to update this inspection';
    end if;
    v_saved_company := coalesce(v_existing_company, v_company);
    update public.inspections
       set inspection_data = coalesce(p_inspection_data, '{}'::jsonb),
           updated_at = now(),
           company_id = v_saved_company
     where id::text = v_id_text;
  else
    v_saved_company := v_company;
    insert into public.inspections (id, user_id, company_id, created_by_email, inspection_data, updated_at)
    values (v_id_text::uuid, v_uid, v_saved_company, v_email, coalesce(p_inspection_data, '{}'::jsonb), now());
  end if;

  return jsonb_build_object('ok', true, 'id', v_id_text, 'company_id', v_saved_company);
end;
$$;

alter table public.profiles enable row level security;
alter table public.companies enable row level security;
alter table public.company_members enable row level security;
alter table public.company_invites enable row level security;
alter table public.inspections enable row level security;
alter table public.inspections no force row level security;
alter table public.service_requests enable row level security;
alter table public.beta_feedback enable row level security;

drop policy if exists "fire_s_profiles_select" on public.profiles;
drop policy if exists "fire_s_profiles_update_own" on public.profiles;
drop policy if exists "fire_s_companies_select" on public.companies;
drop policy if exists "fire_s_companies_insert" on public.companies;
drop policy if exists "fire_s_companies_update" on public.companies;
drop policy if exists "fire_s_company_members_select" on public.company_members;
drop policy if exists "fire_s_company_members_insert" on public.company_members;
drop policy if exists "fire_s_invites_select" on public.company_invites;
drop policy if exists "fire_s_invites_insert" on public.company_invites;
drop policy if exists "fire_s_invites_update" on public.company_invites;
drop policy if exists "fire_s_inspections_select" on public.inspections;
drop policy if exists "fire_s_inspections_insert" on public.inspections;
drop policy if exists "fire_s_inspections_update" on public.inspections;
drop policy if exists "fire_s_inspections_delete" on public.inspections;
drop policy if exists "fire_s_service_requests_all" on public.service_requests;
drop policy if exists "fire_s_beta_feedback_all" on public.beta_feedback;

create policy "fire_s_profiles_select"
  on public.profiles for select to authenticated
  using (true);
create policy "fire_s_profiles_update_own"
  on public.profiles for update to authenticated
  using (id = auth.uid());

create policy "fire_s_companies_select"
  on public.companies for select to authenticated
  using (public.fire_s_is_company_member(id));
create policy "fire_s_companies_insert"
  on public.companies for insert to authenticated
  with check (true);
create policy "fire_s_companies_update"
  on public.companies for update to authenticated
  using (public.fire_s_can_manage_company(id));

create policy "fire_s_company_members_select"
  on public.company_members for select to authenticated
  using (user_id = auth.uid() or public.fire_s_is_company_member(company_id));
create policy "fire_s_company_members_insert"
  on public.company_members for insert to authenticated
  with check (public.fire_s_can_manage_company(company_id) or user_id = auth.uid());

create policy "fire_s_invites_select"
  on public.company_invites for select to authenticated
  using (
    public.fire_s_can_manage_company(company_id)
    or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
create policy "fire_s_invites_insert"
  on public.company_invites for insert to authenticated
  with check (public.fire_s_can_manage_company(company_id));
create policy "fire_s_invites_update"
  on public.company_invites for update to authenticated
  using (public.fire_s_can_manage_company(company_id));

create policy "fire_s_inspections_select"
  on public.inspections for select to authenticated
  using (user_id = auth.uid() or public.fire_s_is_company_member(company_id));
create policy "fire_s_inspections_insert"
  on public.inspections for insert to authenticated
  with check (user_id = auth.uid());
create policy "fire_s_inspections_update"
  on public.inspections for update to authenticated
  using (user_id = auth.uid() or public.fire_s_is_company_member(company_id));
create policy "fire_s_inspections_delete"
  on public.inspections for delete to authenticated
  using (user_id = auth.uid() or public.fire_s_is_company_member(company_id));

create policy "fire_s_service_requests_all"
  on public.service_requests for all to authenticated
  using (true) with check (true);
drop policy if exists "fire_s_service_requests_guest_insert" on public.service_requests;
create policy "fire_s_service_requests_guest_insert"
  on public.service_requests for insert to anon
  with check (true);
create policy "fire_s_beta_feedback_all"
  on public.beta_feedback for all to authenticated
  using (true) with check (true);

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
    -- Keep the invite. The inspector may already belong to a company.
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

create or replace function public.fire_s_is_company_owner(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.company_members m
    where m.company_id = p_company_id
      and m.user_id = auth.uid()
      and coalesce(m.status, 'active') = 'active'
      and lower(coalesce(m.role, '')) in ('company_owner', 'owner', 'super_admin')
  );
$$;

create or replace function public.fire_s_delete_cloud_login(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null then
    return;
  end if;

  if to_regclass('public.company_invites') is not null then
    delete from public.company_invites i
     using auth.users u
     where u.id = p_user_id
       and lower(trim(i.email)) = lower(trim(u.email));
  end if;

  if to_regclass('public.company_members') is not null then
    delete from public.company_members where user_id = p_user_id;
  end if;

  if to_regclass('public.profiles') is not null then
    delete from public.profiles where id = p_user_id;
  end if;

  begin
    delete from auth.refresh_tokens where user_id = p_user_id;
  exception when others then
    null;
  end;
  begin
    delete from auth.sessions where user_id = p_user_id;
  exception when others then
    null;
  end;
  begin
    delete from auth.identities where user_id = p_user_id;
  exception when others then
    null;
  end;

  delete from auth.users where id = p_user_id;
end;
$$;

revoke all on function public.fire_s_delete_cloud_login(uuid) from public;
revoke all on function public.fire_s_delete_cloud_login(uuid) from anon, authenticated;

drop function if exists public.fire_s_remove_member(uuid, uuid);

create or replace function public.fire_s_remove_member(
  p_company_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_keep text[] := array[
    'johandb@live.com',
    'johandb1974ik@gmail.com',
    'georgevdx@gmail.com'
  ];
  v_protected boolean := false;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if not public.fire_s_is_company_owner(p_company_id) then
    raise exception
      'Only the Owner can remove personnel. That deletes their email and password from the cloud.';
  end if;

  if p_user_id is null then
    raise exception 'Missing person';
  end if;

  if p_user_id = v_uid then
    raise exception 'You cannot remove yourself';
  end if;

  if not exists (
    select 1
    from public.company_members m
    where m.company_id = p_company_id
      and m.user_id = p_user_id
  ) then
    raise exception 'That person is not on this company';
  end if;

  if exists (
    select 1
    from public.company_members m
    where m.company_id = p_company_id
      and m.user_id = p_user_id
      and lower(coalesce(m.role, '')) in ('company_owner', 'owner', 'super_admin')
  ) then
    raise exception
      'A manager cannot remove the Owner. Only the Owner can remove a Manager.';
  end if;

  select lower(trim(u.email))
    into v_email
    from auth.users u
   where u.id = p_user_id
   limit 1;

  v_protected :=
    v_email is not null
    and (
      v_email = any (v_keep)
      or v_email like '%@supabase.io'
    );

  if to_regclass('public.company_invites') is not null and v_email is not null then
    update public.company_invites
       set status = 'cancelled'
     where company_id = p_company_id
       and lower(trim(email)) = v_email
       and coalesce(status, 'pending') = 'pending';
  end if;

  if v_protected then
    delete from public.company_members
     where company_id = p_company_id
       and user_id = p_user_id;
    return jsonb_build_object(
      'ok', true,
      'login_deleted', false,
      'email', v_email
    );
  end if;

  perform public.fire_s_delete_cloud_login(p_user_id);

  return jsonb_build_object(
    'ok', true,
    'login_deleted', true,
    'email', v_email
  );
end;
$$;

grant execute on function public.fire_s_ensure_profile(uuid, text, text) to authenticated;
grant execute on function public.fire_s_is_company_member(uuid) to authenticated;
grant execute on function public.fire_s_can_manage_company(uuid) to authenticated;
grant execute on function public.fire_s_is_company_owner(uuid) to authenticated;
grant execute on function public.fire_s_create_company(text, text) to authenticated;
grant execute on function public.fire_s_set_company_plan(text, text) to authenticated;
grant execute on function public.fire_s_start_fresh_company(text) to authenticated;
grant execute on function public.fire_s_update_company_letterhead(text, text, text, text, text, text) to authenticated;
grant execute on function public.fire_s_add_member_by_email(uuid, text, text) to authenticated;
grant execute on function public.fire_s_remove_member(uuid, uuid) to authenticated;
grant execute on function public.fire_s_claim_my_invites() to authenticated;
grant execute on function public.fire_s_upsert_inspection(text, jsonb, text) to authenticated;

insert into storage.buckets (id, name, public)
values ('inspection-photos', 'inspection-photos', true)
on conflict (id) do update set public = true;

drop policy if exists "fire_s_photos_public_read" on storage.objects;
drop policy if exists "fire_s_photos_auth_write" on storage.objects;
create policy "fire_s_photos_public_read"
  on storage.objects for select
  using (bucket_id = 'inspection-photos');
create policy "fire_s_photos_auth_write"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'inspection-photos');

commit;

select 'Fire-S Test bootstrap ready' as status;
