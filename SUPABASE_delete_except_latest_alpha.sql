-- Live Fire-S cloud (ispsdmglyylcwkufphnv).
-- Paste into Supabase → SQL Editor.
-- Keeps the latest Alpha inspection and deletes every other inspection row.
-- Run the preview first. If no Alpha row is found, nothing is deleted.
--
-- After this, open the app on the phone and the laptop and let them download.
-- Do not sync from a device that still has the old inspections, or it can upload them again.

-- 1) Preview the Alpha row that stays, and how many other rows would go.
with labelled as (
  select
    i.id::text as id,
    i.updated_at,
    coalesce(i.inspection_data->>'organisationName', i.inspection_data->>'organizationName', '') as organisation,
    coalesce(i.inspection_data->>'siteName', '') as site,
    coalesce(i.inspection_data->>'projectName', '') as project_name,
    coalesce(i.inspection_data->>'premisesIdentityName', '') as premises_name,
    coalesce(
      nullif(i.inspection_data->>'completedAt', ''),
      nullif(i.inspection_data->>'inspectionDate', ''),
      nullif(i.inspection_data->>'lastSaved', ''),
      i.updated_at::text
    ) as sort_at
  from public.inspections i
),
alpha as (
  select *
  from labelled
  where organisation ilike '%alpha%'
     or site ilike '%alpha%'
     or project_name ilike '%alpha%'
     or premises_name ilike '%alpha%'
),
keep as (
  select id
  from alpha
  order by sort_at desc nulls last, updated_at desc nulls last
  limit 1
)
select
  (select count(*) from labelled) as inspections_now,
  (select count(*) from alpha) as alpha_rows,
  (select id from keep) as keep_id,
  (select organisation || ' – ' || site from alpha where id = (select id from keep)) as keep_name,
  (select sort_at from alpha where id = (select id from keep)) as keep_when;

-- 2) Delete every inspection except that Alpha row.
--    Run this only after the preview above shows the Alpha row you want to keep.

do $$
declare
  keep_id text;
  removed integer := 0;
begin
  with labelled as (
    select
      i.id::text as id,
      i.updated_at,
      coalesce(i.inspection_data->>'organisationName', i.inspection_data->>'organizationName', '') as organisation,
      coalesce(i.inspection_data->>'siteName', '') as site,
      coalesce(i.inspection_data->>'projectName', '') as project_name,
      coalesce(i.inspection_data->>'premisesIdentityName', '') as premises_name,
      coalesce(
        nullif(i.inspection_data->>'completedAt', ''),
        nullif(i.inspection_data->>'inspectionDate', ''),
        nullif(i.inspection_data->>'lastSaved', ''),
        i.updated_at::text
      ) as sort_at
    from public.inspections i
  ),
  alpha as (
    select *
    from labelled
    where organisation ilike '%alpha%'
       or site ilike '%alpha%'
       or project_name ilike '%alpha%'
       or premises_name ilike '%alpha%'
  )
  select id
    into keep_id
  from alpha
  order by sort_at desc nulls last, updated_at desc nulls last
  limit 1;

  if keep_id is null then
    raise exception 'No Alpha inspection was found. Nothing was deleted.';
  end if;

  delete from public.inspections
   where id::text <> keep_id;
  get diagnostics removed = row_count;

  raise notice 'Kept inspection % and deleted % other inspection(s).', keep_id, removed;
end $$;
