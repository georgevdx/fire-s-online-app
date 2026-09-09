-- FIRE-S dashboard statistics, paginated Gateway list, and on-demand premise load
-- Toets-blad first: run this in Fire-S Test (staging) → SQL Editor → Run.
-- Safe to run more than once. Additive. Does not delete inspections or change RLS.
--
-- ROOT CAUSE (client, before this migration):
-- Home / Gateway counted local arrays while fetchCompanyInspectionsFromCloud
-- downloaded full inspection_data in pages of 100. Inventory count:exact included
-- deleted + Recycle leftover rows (e.g. 124). Visible premises after client filters
-- climbed 86 → 110. Dashboard and Gateway therefore showed different numbers.
--
-- THIS FILE:
-- One tenant-scoped definition of an active premise, counted in PostgreSQL.
-- List/search pages return summaries only. Full inspection_data is loaded by id.

begin;

-- ---------------------------------------------------------------------------
-- Membership helper (present on live/staging; recreate if missing)
-- ---------------------------------------------------------------------------
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

grant execute on function public.fire_s_is_company_member(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Active-premise definition (must match fireSIsDeletedPremises +
-- fireSIsEmptyRecycleLeftoverPremises + company-visible rows)
-- ---------------------------------------------------------------------------
create or replace function public.fire_s_json_text(d jsonb, k text)
returns text
language sql
immutable
as $$
  select nullif(btrim(coalesce(d ->> k, '')), '');
$$;

create or replace function public.fire_s_safe_date(raw text)
returns date
language plpgsql
immutable
as $$
begin
  if raw is null or btrim(raw) = '' then
    return null;
  end if;
  if left(btrim(raw), 10) !~ '^\d{4}-\d{2}-\d{2}$' then
    return null;
  end if;
  return left(btrim(raw), 10)::date;
exception when others then
  return null;
end;
$$;

create or replace function public.fire_s_inspection_is_deleted(d jsonb)
returns boolean
language sql
immutable
as $$
  select
    d is null
    or public.fire_s_json_text(d, 'deletedAt') is not null
    or public.fire_s_json_text(d, 'dataManagementDeletedAt') is not null
    or lower(coalesce(d ->> 'deleteType', '')) in ('entire_premises', 'permanently_deleted')
    or lower(coalesce(d ->> 'status', '')) in ('deleted', 'permanently_deleted')
    or lower(coalesce(d ->> 'archiveStatus', '')) in ('deleted', 'permanently_deleted');
$$;

create or replace function public.fire_s_json_array_len(d jsonb, k text)
returns integer
language sql
immutable
as $$
  select case
    when d is null then 0
    when jsonb_typeof(d -> k) = 'array' then jsonb_array_length(d -> k)
    else 0
  end;
$$;

create or replace function public.fire_s_inspection_is_recycle_leftover(d jsonb)
returns boolean
language sql
immutable
as $$
  select
    d is not null
    and jsonb_typeof(d -> 'recycleBin' -> 'currentInspections') = 'array'
    and jsonb_array_length(d -> 'recycleBin' -> 'currentInspections') > 0
    and public.fire_s_json_text(d, 'currentInspectionId') is null
    and public.fire_s_json_text(d, 'inspectionId') is null
    and public.fire_s_json_text(d, 'inspectionNumber') is null
    and public.fire_s_json_array_len(d, 'answers') = 0
    and public.fire_s_json_array_len(d, 'photos') = 0
    and lower(coalesce(d ->> 'scheduledStatus', '')) <> 'scheduled'
    and lower(coalesce(d ->> 'scheduleType', '')) not in ('new_site', 'existing_site')
    and lower(coalesce(d ->> 'scheduleFreshInspection', '')) not in ('true', 't')
    and public.fire_s_json_array_len(d, 'inspectionHistory') = 0;
$$;

create or replace function public.fire_s_inspection_is_active_premise(d jsonb)
returns boolean
language sql
immutable
as $$
  select
    not public.fire_s_inspection_is_deleted(d)
    and not public.fire_s_inspection_is_recycle_leftover(d);
$$;

create or replace function public.fire_s_inspection_is_closed(d jsonb)
returns boolean
language sql
immutable
as $$
  select
    public.fire_s_json_text(d, 'completedAt') is not null
    or public.fire_s_json_text(d, 'finalisedAt') is not null
    or public.fire_s_json_text(d, 'archivedAt') is not null
    or lower(coalesce(d ->> 'scheduledStatus', '')) = 'completed'
    or lower(coalesce(d ->> 'archiveStatus', '')) in ('completed', 'archived')
    or lower(coalesce(d ->> 'inspectionStatus', '')) in ('closed', 'completed')
    or lower(coalesce(d ->> 'status', '')) in ('closed', 'completed', 'archived');
$$;

create or replace function public.fire_s_inspection_planned_date(d jsonb)
returns date
language sql
immutable
as $$
  select public.fire_s_safe_date(
    coalesce(
      public.fire_s_json_text(d, 'scheduledDate'),
      public.fire_s_json_text(d, 'followUpDate'),
      public.fire_s_json_text(d, 'nextInspectionDate'),
      public.fire_s_json_text(d, 'nextDate'),
      public.fire_s_json_text(d, 'inspectionDueDate'),
      public.fire_s_json_text(d, 'dueDate')
    )
  );
$$;

create or replace function public.fire_s_inspection_activity_date(d jsonb)
returns date
language sql
immutable
as $$
  select public.fire_s_safe_date(
    coalesce(
      public.fire_s_json_text(d, 'inspectionDate'),
      public.fire_s_json_text(d, 'completedAt'),
      public.fire_s_json_text(d, 'finalisedAt'),
      public.fire_s_json_text(d, 'lastSaved'),
      public.fire_s_json_text(d, 'updatedAt'),
      public.fire_s_json_text(d, 'createdAt'),
      public.fire_s_json_text(d, 'scheduledDate'),
      public.fire_s_json_text(d, 'followUpDate')
    )
  );
$$;

create or replace function public.fire_s_json_as_array(d jsonb, k text)
returns jsonb
language sql
immutable
as $$
  select case
    when jsonb_typeof(d -> k) = 'array' then d -> k
    else '[]'::jsonb
  end;
$$;

create or replace function public.fire_s_inspection_open_action_count(d jsonb)
returns integer
language sql
immutable
as $$
  select
    (
      select count(*)::int
      from jsonb_array_elements(public.fire_s_json_as_array(d, 'answers')) a
      where lower(btrim(coalesce(a ->> 'answer', a ->> 'value', ''))) = 'no'
    )
    +
    (
      select count(*)::int
      from jsonb_array_elements(public.fire_s_json_as_array(d, 'actions')) a
      where lower(btrim(coalesce(a ->> 'status', 'open')))
        not in ('closed', 'complete', 'completed', 'resolved', 'done')
    );
$$;

create or replace function public.fire_s_inspection_has_answered_checklist(d jsonb)
returns boolean
language sql
immutable
as $$
  select exists (
    select 1
    from jsonb_array_elements(public.fire_s_json_as_array(d, 'answers')) a
    where lower(btrim(coalesce(a ->> 'answer', a ->> 'value', '')))
      in ('yes', 'no', 'na', 'n/a')
  );
$$;

create or replace function public.fire_s_inspection_search_haystack(d jsonb)
returns text
language sql
immutable
as $$
  select lower(concat_ws(
    ' ',
    d ->> 'organisationName',
    d ->> 'organizationName',
    d ->> 'premisesName',
    d ->> 'projectName',
    d ->> 'siteName',
    d ->> 'site_name',
    d ->> 'branchName',
    d ->> 'locationName',
    d ->> 'projectAddress',
    d ->> 'addressLine',
    d ->> 'address',
    d ->> 'inspectionNumber',
    d ->> 'inspectorName',
    d ->> 'contactPerson',
    d ->> 'contactTel',
    d ->> 'contactEmail',
    d ->> 'gps',
    d ->> 'occupancy'
  ));
$$;

create or replace function public.fire_s_inspection_is_scheduled_open(d jsonb)
returns boolean
language sql
immutable
as $$
  select
    public.fire_s_inspection_planned_date(d) is not null
    and public.fire_s_inspection_planned_date(d) >= current_date
    and not public.fire_s_inspection_is_closed(d);
$$;

create or replace function public.fire_s_inspection_is_overdue(d jsonb)
returns boolean
language sql
immutable
as $$
  select
    public.fire_s_inspection_planned_date(d) is not null
    and public.fire_s_inspection_planned_date(d) < current_date
    and not public.fire_s_inspection_is_closed(d)
    and not public.fire_s_inspection_is_recycle_leftover(d);
$$;

create or replace function public.fire_s_inspection_is_compliant(d jsonb)
returns boolean
language sql
immutable
as $$
  select
    public.fire_s_inspection_has_answered_checklist(d)
    and public.fire_s_inspection_is_closed(d)
    and public.fire_s_inspection_open_action_count(d) = 0
    and public.fire_s_json_text(d, 'archivedAt') is null
    and lower(coalesce(d ->> 'archiveStatus', '')) not like '%archiv%';
$$;

-- ---------------------------------------------------------------------------
-- Resolve the caller's company. Never accept another tenant's id.
-- ---------------------------------------------------------------------------
create or replace function public.fire_s_caller_company_id(p_company_id uuid default null)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_company uuid := null;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if p_company_id is not null then
    if not public.fire_s_is_company_member(p_company_id) then
      raise exception 'Not a member of this company';
    end if;
    return p_company_id;
  end if;

  select m.company_id
    into v_company
  from public.company_members m
  where m.user_id = v_uid
    and coalesce(m.status, 'active') = 'active'
  order by m.created_at desc
  limit 1;

  if v_company is null then
    raise exception 'No active company membership';
  end if;

  return v_company;
end;
$$;

grant execute on function public.fire_s_caller_company_id(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Authoritative dashboard snapshot
-- ---------------------------------------------------------------------------
create or replace function public.fire_s_company_dashboard_stats(p_company_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_company uuid;
  v_month_start date := date_trunc('month', current_date)::date;
  v_month_end date := (date_trunc('month', current_date) + interval '1 month - 1 day')::date;
  v_row record;
begin
  v_company := public.fire_s_caller_company_id(p_company_id);

  select
    count(*)::int as total_premises,
    count(*) filter (
      where public.fire_s_inspection_is_closed(i.inspection_data)
         or public.fire_s_json_array_len(i.inspection_data, 'inspectionHistory') > 0
         or public.fire_s_json_text(i.inspection_data, 'inspectionDate') is not null
    )::int as premises_inspected,
    coalesce(
      sum(public.fire_s_json_array_len(i.inspection_data, 'inspectionHistory'))
      + count(*) filter (where public.fire_s_inspection_is_closed(i.inspection_data)),
      0
    )::int as total_inspections,
    count(*) filter (where public.fire_s_inspection_is_scheduled_open(i.inspection_data))::int as scheduled_inspections,
    count(*) filter (where public.fire_s_inspection_is_compliant(i.inspection_data))::int as compliant_premises,
    count(*) filter (where public.fire_s_inspection_open_action_count(i.inspection_data) > 0)::int as premises_with_open_actions,
    coalesce(sum(public.fire_s_inspection_open_action_count(i.inspection_data)), 0)::int as open_action_items,
    count(*) filter (where public.fire_s_inspection_is_overdue(i.inspection_data))::int as overdue_inspections,
    count(*) filter (
      where public.fire_s_inspection_activity_date(i.inspection_data) between v_month_start and v_month_end
    )::int as inspections_this_month
  into v_row
  from public.inspections i
  where (
      i.company_id = v_company
      or (i.company_id is null and i.user_id = v_uid)
    )
    and public.fire_s_inspection_is_active_premise(i.inspection_data);

  return jsonb_build_object(
    'companyId', v_company,
    'totalPremises', coalesce(v_row.total_premises, 0),
    'premisesInspected', coalesce(v_row.premises_inspected, 0),
    'totalInspections', coalesce(v_row.total_inspections, 0),
    'scheduledInspections', coalesce(v_row.scheduled_inspections, 0),
    'compliantPremises', coalesce(v_row.compliant_premises, 0),
    'premisesWithOpenActions', coalesce(v_row.premises_with_open_actions, 0),
    'openActionItems', coalesce(v_row.open_action_items, 0),
    'overdueInspections', coalesce(v_row.overdue_inspections, 0),
    'inspectionsThisMonth', coalesce(v_row.inspections_this_month, 0),
    'lastUpdated', now()
  );
end;
$$;

revoke all on function public.fire_s_company_dashboard_stats(uuid) from public;
grant execute on function public.fire_s_company_dashboard_stats(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Paginated / searched Gateway list (summaries only, no photos)
-- ---------------------------------------------------------------------------
create or replace function public.fire_s_list_company_premises(
  p_search text default '',
  p_filter text default 'all',
  p_limit integer default 25,
  p_offset integer default 0,
  p_sort text default 'updated_desc',
  p_company_id uuid default null,
  p_inspector_email text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_company uuid;
  v_search text := lower(btrim(coalesce(p_search, '')));
  v_filter text := lower(btrim(regexp_replace(coalesce(p_filter, 'all'), '_', '-', 'g')));
  v_limit int := greatest(1, least(coalesce(p_limit, 25), 50));
  v_offset int := greatest(0, coalesce(p_offset, 0));
  v_sort text := lower(btrim(coalesce(p_sort, 'updated_desc')));
  v_email text := lower(btrim(coalesce(p_inspector_email, '')));
  v_total int := 0;
  v_items jsonb := '[]'::jsonb;
begin
  v_company := public.fire_s_caller_company_id(p_company_id);

  if v_filter in ('gateway', 'fs-kpi-all') then
    v_filter := 'all';
  elsif v_filter in ('scheduled', 'scheduled-inspections', 'fs-kpi-scheduled') then
    v_filter := 'scheduled-new';
  elsif v_filter in ('scheduled-priority', 'inspector-scheduled') then
    v_filter := 'scheduled-priority';
  elsif v_filter in ('compliant-sites', 'fs-kpi-compliant', 'clear-completed') then
    v_filter := 'compliant';
  elsif v_filter in ('overdue-inspections', 'fs-kpi-overdue', 'inspection-overdue') then
    v_filter := 'overdue';
  elsif v_filter in ('this-month', 'inspections-this-month', 'fs-kpi-month', 'inspections-month') then
    v_filter := 'month';
  elsif v_filter in ('action-required', 'actions-required') then
    v_filter := 'inspection-attention';
  end if;

  with scoped as (
    select
      i.id::text as id,
      i.updated_at,
      i.inspection_data as d
    from public.inspections i
    where (
        i.company_id = v_company
        or (i.company_id is null and i.user_id = v_uid)
      )
      and public.fire_s_inspection_is_active_premise(i.inspection_data)
  ),
  filtered as (
    select s.*
    from scoped s
    where (
        v_search = ''
        or public.fire_s_inspection_search_haystack(s.d) like '%' || v_search || '%'
      )
      and (
        v_filter = 'all'
        or (v_filter = 'compliant' and public.fire_s_inspection_is_compliant(s.d))
        or (v_filter = 'scheduled-new' and public.fire_s_inspection_is_scheduled_open(s.d))
        or (v_filter = 'overdue' and public.fire_s_inspection_is_overdue(s.d))
        or (
          v_filter = 'month'
          and public.fire_s_inspection_activity_date(s.d)
            between date_trunc('month', current_date)::date
                and (date_trunc('month', current_date) + interval '1 month - 1 day')::date
        )
        or (
          v_filter = 'inspection-attention'
          and public.fire_s_inspection_open_action_count(s.d) > 0
        )
        or (
          v_filter = 'scheduled-priority'
          and public.fire_s_inspection_is_scheduled_open(s.d)
          and not public.fire_s_inspection_is_closed(s.d)
          and (
            v_email = ''
            or lower(coalesce(s.d ->> 'assignedInspectorEmail', s.d ->> 'assigned_inspector_email', '')) = v_email
            or lower(coalesce(s.d ->> 'createdByEmail', '')) = v_email
          )
        )
      )
  )
  select count(*)::int into v_total from filtered;

  select coalesce(jsonb_agg(to_jsonb(x) - 'ord' order by x.ord), '[]'::jsonb)
    into v_items
  from (
    select
      row_number() over (
        order by
          case when v_sort = 'name_az' then lower(coalesce(f.d ->> 'organisationName', f.d ->> 'projectName', '')) end asc,
          case when v_sort = 'name_za' then lower(coalesce(f.d ->> 'organisationName', f.d ->> 'projectName', '')) end desc,
          case when v_sort = 'oldest' then f.updated_at end asc,
          case when v_sort in ('updated_desc', 'newest', '') then f.updated_at end desc,
          f.id desc
      ) as ord,
      f.id,
      coalesce(
        public.fire_s_json_text(f.d, 'organisationName'),
        public.fire_s_json_text(f.d, 'organizationName'),
        public.fire_s_json_text(f.d, 'premisesName'),
        public.fire_s_json_text(f.d, 'projectName'),
        'Unnamed premises'
      ) as "organisationName",
      coalesce(
        public.fire_s_json_text(f.d, 'siteName'),
        public.fire_s_json_text(f.d, 'site_name'),
        public.fire_s_json_text(f.d, 'branchName'),
        ''
      ) as "siteName",
      coalesce(public.fire_s_json_text(f.d, 'projectName'), '') as "projectName",
      coalesce(
        public.fire_s_json_text(f.d, 'projectAddress'),
        public.fire_s_json_text(f.d, 'addressLine'),
        public.fire_s_json_text(f.d, 'address'),
        ''
      ) as "projectAddress",
      coalesce(public.fire_s_json_text(f.d, 'inspectionNumber'), '') as "inspectionNumber",
      public.fire_s_inspection_planned_date(f.d)::text as "scheduledDate",
      left(coalesce(f.d ->> 'completedAt', f.d ->> 'inspectionDate', ''), 10) as "completedAt",
      left(coalesce(f.d ->> 'inspectionDate', f.d ->> 'completedAt', ''), 10) as "inspectionDate",
      public.fire_s_inspection_open_action_count(f.d) as "openActionCount",
      public.fire_s_json_array_len(f.d, 'photos') as "photoCount",
      public.fire_s_inspection_is_overdue(f.d) as overdue,
      public.fire_s_inspection_is_scheduled_open(f.d) as scheduled,
      public.fire_s_inspection_is_compliant(f.d) as compliant,
      f.updated_at as "updatedAt"
    from filtered f
    order by
      case when v_sort = 'name_az' then lower(coalesce(f.d ->> 'organisationName', f.d ->> 'projectName', '')) end asc,
      case when v_sort = 'name_za' then lower(coalesce(f.d ->> 'organisationName', f.d ->> 'projectName', '')) end desc,
      case when v_sort = 'oldest' then f.updated_at end asc,
      case when v_sort in ('updated_desc', 'newest', '') then f.updated_at end desc,
      f.id desc
    limit v_limit
    offset v_offset
  ) x;

  return jsonb_build_object(
    'companyId', v_company,
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset,
    'filter', v_filter,
    'search', v_search,
    'items', v_items
  );
end;
$$;

revoke all on function public.fire_s_list_company_premises(text, text, integer, integer, text, uuid, text) from public;
grant execute on function public.fire_s_list_company_premises(text, text, integer, integer, text, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Load one full premise (inspection_data) when the user opens it
-- ---------------------------------------------------------------------------
create or replace function public.fire_s_get_company_premise(p_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_company uuid;
  v_row record;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if nullif(btrim(coalesce(p_id, '')), '') is null then
    raise exception 'Premise id required';
  end if;

  begin
    v_company := public.fire_s_caller_company_id(null);
  exception when others then
    v_company := null;
  end;

  select
    i.id::text as id,
    i.company_id,
    i.updated_at,
    i.inspection_data
  into v_row
  from public.inspections i
  where i.id::text = btrim(p_id)
    and (
      (v_company is not null and (i.company_id = v_company or (i.company_id is null and i.user_id = v_uid)))
      or (v_company is null and i.user_id = v_uid)
    )
  limit 1;

  if v_row.id is null then
    return null;
  end if;

  if v_row.company_id is not null and not public.fire_s_is_company_member(v_row.company_id) and v_row.company_id is distinct from v_company then
    return null;
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'company_id', v_row.company_id,
    'updated_at', v_row.updated_at,
    'inspection_data', v_row.inspection_data
  );
end;
$$;

revoke all on function public.fire_s_get_company_premise(text) from public;
grant execute on function public.fire_s_get_company_premise(text) to authenticated;

-- Indexes that match these query shapes (skip if already present).
create index if not exists inspections_company_updated_at_idx
  on public.inspections (company_id, updated_at desc);

create index if not exists inspections_company_id_id_idx
  on public.inspections (company_id, id);

commit;
