-- Fire-S: return the signed-in user's company id + name (SECURITY DEFINER)
-- Use when the app cannot read public.companies due to RLS timing / policy gaps.
-- Run in Supabase SQL Editor once.

begin;

drop function if exists public.fire_s_my_company();

create or replace function public.fire_s_my_company()
returns table (
  out_company_id uuid,
  out_company_name text,
  out_member_role text
)
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

  return query
    select c.id, c.name, m.role::text
    from public.company_members as m
    join public.companies as c on c.id = m.company_id
    where m.user_id = v_uid
      and coalesce(m.status, 'active') = 'active'
    limit 1;
end;
$$;

grant execute on function public.fire_s_my_company() to authenticated;

commit;
