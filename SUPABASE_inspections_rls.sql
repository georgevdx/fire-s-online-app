-- Fire-S: inspections save via SECURITY DEFINER RPC
-- Fixes: Cloud upload failed: new row violates row-level security policy (USING expression)
--
-- Paste ALL of this into Supabase → SQL Editor → Run (must say Success)

begin;

-- Membership helper
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
      select 1
      from public.company_members m
      where m.company_id = p_company_id
        and m.user_id = auth.uid()
        and coalesce(m.status, 'active') = 'active'
    );
$$;

revoke all on function public.fire_s_is_company_member(uuid) from public;
grant execute on function public.fire_s_is_company_member(uuid) to authenticated;

-- Drop every old inspections policy
alter table public.inspections enable row level security;

do $$
declare
  r record;
begin
  for r in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'inspections'
  loop
    execute format('drop policy if exists %I on public.inspections', r.policyname);
  end loop;
end $$;

-- Keep basic table policies (RPC bypasses them as definer, but reads still need these)
create policy "fire_s_inspections_select"
  on public.inspections for select to authenticated
  using (
    user_id = auth.uid()
    or public.fire_s_is_company_member(company_id)
  );

create policy "fire_s_inspections_insert"
  on public.inspections for insert to authenticated
  with check (user_id = auth.uid());

create policy "fire_s_inspections_update"
  on public.inspections for update to authenticated
  using (
    user_id = auth.uid()
    or public.fire_s_is_company_member(company_id)
  )
  with check (true);

create policy "fire_s_inspections_delete"
  on public.inspections for delete to authenticated
  using (
    user_id = auth.uid()
    or public.fire_s_is_company_member(company_id)
  );

-- MAIN FIX: app saves through this function (bypasses RLS safely)
drop function if exists public.fire_s_upsert_inspection(uuid, jsonb, uuid);

create or replace function public.fire_s_upsert_inspection(
  p_id uuid,
  p_inspection_data jsonb,
  p_company_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_company uuid := null;
  v_owner uuid := null;
  v_existing_company uuid := null;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if p_id is null then
    raise exception 'Inspection id required';
  end if;

  -- Prefer explicit company if caller is an active member
  if p_company_id is not null
     and public.fire_s_is_company_member(p_company_id) then
    v_company := p_company_id;
  else
    select m.company_id
      into v_company
    from public.company_members m
    where m.user_id = v_uid
      and coalesce(m.status, 'active') = 'active'
    limit 1;
  end if;

  select i.user_id, i.company_id
    into v_owner, v_existing_company
  from public.inspections i
  where i.id = p_id;

  if v_owner is not null then
    -- Update existing row only if owner or same-company member
    if v_owner <> v_uid
       and not public.fire_s_is_company_member(v_existing_company) then
      raise exception 'Not allowed to update this inspection';
    end if;

    update public.inspections
       set inspection_data = coalesce(p_inspection_data, '{}'::jsonb),
           updated_at = now(),
           company_id = coalesce(v_existing_company, v_company)
     where id = p_id;
  else
    insert into public.inspections as i (
      id,
      user_id,
      company_id,
      inspection_data,
      updated_at
    ) values (
      p_id,
      v_uid,
      v_company,
      coalesce(p_inspection_data, '{}'::jsonb),
      now()
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'id', p_id,
    'company_id', coalesce(v_existing_company, v_company)
  );
end;
$$;

revoke all on function public.fire_s_upsert_inspection(uuid, jsonb, uuid) from public;
grant execute on function public.fire_s_upsert_inspection(uuid, jsonb, uuid) to authenticated;

commit;
