-- Fire-S premises Name + Site identity guard v3
-- Run once in the Supabase SQL Editor after resolving any legacy duplicates.
--
-- Remove the earlier Site-only and Name-only rules.
drop index if exists public.inspections_company_premises_name_unique;
drop index if exists public.inspections_company_organisation_name_unique;

-- Only the combined Organisation / Company + Site / Branch / Location pair
-- identifies a duplicate within the same Fire-S company.
-- Examples:
--   Checkers + Menlyn = blocked when the exact pair already exists
--   Checkers + Brooklyn = allowed
--   Pick n Pay + Menlyn = allowed
create unique index if not exists inspections_company_organisation_site_unique
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
  ),
  lower(
    regexp_replace(
      btrim(
        coalesce(
          inspection_data ->> 'siteName',
          inspection_data ->> 'site_name',
          inspection_data ->> 'branchName',
          inspection_data ->> 'locationName'
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
  ) is not null
  and nullif(
    btrim(
      coalesce(
        inspection_data ->> 'siteName',
        inspection_data ->> 'site_name',
        inspection_data ->> 'branchName',
        inspection_data ->> 'locationName'
      )
    ),
    ''
  ) is not null;
