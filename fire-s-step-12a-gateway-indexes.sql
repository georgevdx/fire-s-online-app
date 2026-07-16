-- FIRE-S STEP 12A
-- Inspection Gateway production paging foundation
-- Safe to run more than once.
-- This step changes no application UI or existing inspection data.

begin;

-- Main tenant + newest-first Gateway query.
create index if not exists inspections_company_updated_at_idx
  on public.inspections (company_id, updated_at desc);

-- Inspector/user scoped fallback query.
create index if not exists inspections_user_updated_at_idx
  on public.inspections (user_id, updated_at desc);

-- Stable paging tie-breaker where updated_at values are equal.
create index if not exists inspections_company_updated_id_idx
  on public.inspections (company_id, updated_at desc, id desc);

-- Helps direct record opening and tenant-safe lookups.
create index if not exists inspections_company_id_id_idx
  on public.inspections (company_id, id);

commit;

-- Verification only: these statements do not change data.
select
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'inspections'
  and indexname in (
    'inspections_company_updated_at_idx',
    'inspections_user_updated_at_idx',
    'inspections_company_updated_id_idx',
    'inspections_company_id_id_idx'
  )
order by indexname;
