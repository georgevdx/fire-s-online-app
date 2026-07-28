-- Fire-S premises-name identity guard v2
-- Run once in the Supabase SQL Editor after resolving any legacy duplicates.
--
-- v1 incorrectly treated Site / Branch / Location as the unique field.
-- Remove that rule first so different organisations may share the same site.
drop index if exists public.inspections_company_premises_name_unique;

-- The Organisation / Company name is the protected premises name.
-- Examples:
--   Checkers Menlyn + Menlyn Shopping Centre = allowed
--   Pick n Pay Menlyn + Menlyn Shopping Centre = allowed
--   A second Checkers Menlyn in the same Fire-S company = blocked
create unique index if not exists inspections_company_organisation_name_unique
on public.inspections (
  company_id,
  lower(
    regexp_replace(
      btrim(
        coalesce(
          inspection_data ->> 'organisationName',
          inspection_data ->> 'organizationName',
          inspection_data ->> 'premisesName'
        )
      ),
      '\s+',
      ' ',
      'g'
    )
  )
)
where
  company_id is not null
  and nullif(
    btrim(
      coalesce(
        inspection_data ->> 'organisationName',
        inspection_data ->> 'organizationName',
        inspection_data ->> 'premisesName'
      )
    ),
    ''
  ) is not null;
