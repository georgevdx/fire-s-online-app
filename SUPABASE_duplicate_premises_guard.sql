-- Fire-S premises identity guard
-- Run once in the Supabase SQL Editor after resolving any legacy duplicates.
--
-- This is the final database safeguard behind the app-level checks. It prevents
-- two inspection rows in the same company from using the same non-empty
-- Site / Premises name, ignoring case and repeated spaces.

create unique index if not exists inspections_company_premises_name_unique
on public.inspections (
  company_id,
  lower(
    regexp_replace(
      btrim(inspection_data ->> 'siteName'),
      '\s+',
      ' ',
      'g'
    )
  )
)
where
  company_id is not null
  and nullif(btrim(inspection_data ->> 'siteName'), '') is not null;
