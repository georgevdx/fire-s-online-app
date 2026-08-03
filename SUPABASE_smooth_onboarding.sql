-- Fire-S smooth onboarding: invites + add/edit staff
-- Run ALL of this in Supabase SQL Editor once.

begin;

-- Pending invites (owner adds email before person installs the app)
create table if not exists public.company_invites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  email text not null,
  role text not null default 'inspector',
  status text not null default 'pending',
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (company_id, email)
);

create index if not exists company_invites_email_idx
  on public.company_invites (lower(email));

alter table public.company_invites enable row level security;

drop policy if exists "fire_s_invites_select" on public.company_invites;
drop policy if exists "fire_s_invites_insert" on public.company_invites;
drop policy if exists "fire_s_invites_update" on public.company_invites;
drop policy if exists "fire_s_invites_delete" on public.company_invites;

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
  using (public.fire_s_can_manage_company(company_id))
  with check (true);

create policy "fire_s_invites_delete"
  on public.company_invites for delete to authenticated
  using (public.fire_s_can_manage_company(company_id));

-- Ensure profile helper
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

-- Claim any pending invites for the signed-in user
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
  r record;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select lower(trim(email)) into v_email from auth.users where id = v_uid;
  if v_email is null then
    return;
  end if;

  perform public.fire_s_ensure_profile(v_uid, v_email, 'inspector');

  for r in
    select i.id, i.company_id, i.role, c.name as company_name
    from public.company_invites i
    join public.companies c on c.id = i.company_id
    where lower(i.email) = v_email
      and coalesce(i.status, 'pending') = 'pending'
  loop
    insert into public.company_members (company_id, user_id, role, status)
    values (r.company_id, v_uid, r.role, 'active')
    on conflict (company_id, user_id)
    do update set role = excluded.role, status = 'active';

    update public.company_invites
       set status = 'accepted'
     where id = r.id;

    begin
      update public.profiles set role = r.role where id = v_uid;
    exception when others then
      null;
    end;

    out_company_id := r.company_id;
    out_company_name := r.company_name;
    out_role := r.role;
    return next;
  end loop;
end;
$$;

-- Add member OR create invite if they have not installed yet
drop function if exists public.fire_s_add_member_by_email(uuid, text, text);

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
    begin
      select exists (
        select 1 from public.profiles p
        where p.id = v_uid and p.role = 'super_admin'
      ) into v_can;
    exception when others then
      v_can := false;
    end;
  end if;

  if not v_can then
    raise exception 'Only Manager or Owner can add team members';
  end if;

  select p.id into v_target
  from public.profiles p
  where lower(trim(p.email)) = v_email
  limit 1;

  if v_target is null then
    select u.id into v_target
    from auth.users u
    where lower(trim(u.email)) = v_email
    limit 1;
  end if;

  if v_target is not null then
    perform public.fire_s_ensure_profile(v_target, v_email, v_role);

    insert into public.company_members (company_id, user_id, role, status)
    values (p_company_id, v_target, v_role, 'active')
    on conflict (company_id, user_id)
    do update set role = excluded.role, status = 'active';

    begin
      update public.profiles set role = v_role where id = v_target;
    exception when others then
      null;
    end;

    -- Clear any pending invite for this email
    update public.company_invites
       set status = 'accepted'
     where company_id = p_company_id
       and lower(email) = v_email;

    return query select v_target, v_email, v_role, 'added'::text;
    return;
  end if;

  -- Person has not installed yet → save invite
  insert into public.company_invites (company_id, email, role, status, created_by)
  values (p_company_id, v_email, v_role, 'pending', v_uid)
  on conflict (company_id, email)
  do update set role = excluded.role, status = 'pending', created_by = v_uid;

  return query select null::uuid, v_email, v_role, 'invited'::text;
end;
$$;

-- Remove / deactivate a member
create or replace function public.fire_s_remove_member(
  p_company_id uuid,
  p_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if not public.fire_s_can_manage_company(p_company_id) then
    raise exception 'Only Manager or Owner can remove team members';
  end if;

  if p_user_id = v_uid then
    raise exception 'You cannot remove yourself';
  end if;

  update public.company_members
     set status = 'inactive'
   where company_id = p_company_id
     and user_id = p_user_id;

  return true;
end;
$$;

grant execute on function public.fire_s_ensure_profile(uuid, text, text) to authenticated;
grant execute on function public.fire_s_claim_my_invites() to authenticated;
grant execute on function public.fire_s_add_member_by_email(uuid, text, text) to authenticated;
grant execute on function public.fire_s_remove_member(uuid, uuid) to authenticated;

commit;

select 'smooth onboarding ready' as status;
