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

-- Claim any pending invites for the signed-in user.
-- Returns the company even when the person is already a member, and
-- reactivates an inactive one-login row only for a pending invite.
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
    (select nullif(trim(u.email), '') from auth.users u where u.id = v_uid),
    (select nullif(trim(u.raw_user_meta_data ->> 'email'), '') from auth.users u where u.id = v_uid)
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
    update public.company_invites
       set status = 'accepted'
     where company_id = v_existing
       and lower(trim(email)) = v_email
       and coalesce(status, 'pending') = 'pending';
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

  update public.company_members
     set company_id = r.company_id,
         role = coalesce(nullif(trim(r.role), ''), 'inspector'),
         status = 'active'
   where user_id = v_uid
     and coalesce(status, 'active') <> 'active';

  if not found then
    begin
      insert into public.company_members (company_id, user_id, role, status)
      values (
        r.company_id,
        v_uid,
        coalesce(nullif(trim(r.role), ''), 'inspector'),
        'active'
      )
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
  end if;

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
