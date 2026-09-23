-- Live hotfix: fire_s_compute_entitlement crashes without companies.trial_ends_at.
-- That RPC error is why Home showed Subscription required after Step 6.
-- Additive. Does not delete inspections. Does not cancel anyone.
-- Paste ALL into SQL Editor on live ispsdmglyylcwkufphnv.

begin;

alter table public.companies
  add column if not exists trial_ends_at timestamptz;

update public.companies
   set trial_ends_at = trial_expires_at
 where trial_ends_at is null
   and trial_expires_at is not null;

commit;

notify pgrst, 'reload schema';

select
  c.name,
  public.fire_s_compute_entitlement(c.id)->>'status' as status,
  public.fire_s_compute_entitlement(c.id)->>'allowed' as allowed,
  public.fire_s_compute_entitlement(c.id)->>'reason' as reason
from public.companies c
order by c.name;
