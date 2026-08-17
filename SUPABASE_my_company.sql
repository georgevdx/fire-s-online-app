-- Fire-S: return the signed-in user's primary company (SECURITY DEFINER)
-- Picks the active membership with the most team members so staff on a large
-- company are not left on a personal shell company after login.
-- Run in Supabase SQL Editor once (replaces prior fire_s_my_company()).

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
    select
      c.id,
      c.name,
      m.role::text
    from public.company_members as m
    join public.companies as c on c.id = m.company_id
    where m.user_id = v_uid
      and coalesce(m.status, 'active') = 'active'
    order by (
      select count(*)::int
      from public.company_members as cm
      where cm.company_id = m.company_id
        and coalesce(cm.status, 'active') = 'active'
    ) desc,
    case m.role
      when 'manager' then 0
      when 'inspector' then 1
      when 'company_owner' then 2
      else 3
    end,
    c.name asc
    limit 1;
end;
$$;

grant execute on function public.fire_s_my_company() to authenticated;

commit;
