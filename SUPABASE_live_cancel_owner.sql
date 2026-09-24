-- Fire-S LIVE: let membership role `owner` cancel, same as company_owner.
-- Run on live (ispsdmglyylcwkufphnv) in SQL Editor. Does not delete inspections.

create or replace function public.fire_s_can_manage_company(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.company_members m
    where m.company_id = p_company_id
      and m.user_id = auth.uid()
      and m.role in ('company_owner', 'owner', 'manager', 'super_admin')
      and coalesce(m.status, 'active') = 'active'
  );
$$;

grant execute on function public.fire_s_can_manage_company(uuid) to authenticated;

select 'fire_s_can_manage_company now treats owner like company_owner' as status;
