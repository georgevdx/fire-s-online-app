-- Fire-S Test only (top-left must say Fire-S Test).
-- Do NOT run this on fireye-sync (the live cloud).
-- Lets an invited inspector join the company after Create password.
-- Run once in SQL Editor → Run.

begin;

create or replace function public.fire_s_claim_my_invites()
returns table (
  out_company_id uuid,
  out_company_name text,
  out_role text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_existing uuid;
  v_name text;
  v_role text;
  r record;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  v_email := lower(trim(coalesce(
    nullif(auth.jwt() ->> 'email', ''),
    (select email from auth.users where id = v_uid)
  )));
  if v_email is null or v_email = '' then
    return;
  end if;

  perform public.fire_s_ensure_profile(v_uid, v_email, 'inspector');

  select m.company_id
    into v_existing
    from public.company_members m
   where m.user_id = v_uid
     and coalesce(m.status, 'active') = 'active'
   limit 1;

  if v_existing is not null then
    select c.name, m.role
      into v_name, v_role
      from public.company_members m
      left join public.companies c on c.id = m.company_id
     where m.user_id = v_uid
       and m.company_id = v_existing
     limit 1;
    out_company_id := v_existing;
    out_company_name := v_name;
    out_role := coalesce(v_role, 'inspector');
    return next;
    return;
  end if;

  select i.id, i.company_id, i.role, c.name as company_name
    into r
    from public.company_invites i
    join public.companies c on c.id = i.company_id
   where lower(trim(i.email)) = v_email
     and coalesce(i.status, 'pending') = 'pending'
   order by i.created_at asc
   limit 1;

  if not found then
    return;
  end if;

  begin
    insert into public.company_members (company_id, user_id, role, status)
    values (r.company_id, v_uid, r.role, 'active')
    on conflict (company_id, user_id)
    do update set role = excluded.role, status = 'active';
  exception when unique_violation then
    select m.company_id, c.name, m.role
      into out_company_id, out_company_name, out_role
      from public.company_members m
      left join public.companies c on c.id = m.company_id
     where m.user_id = v_uid
       and coalesce(m.status, 'active') = 'active'
     limit 1;
    if out_company_id is not null then
      return next;
    end if;
    return;
  end;

  update public.company_invites
     set status = 'accepted'
   where id = r.id;

  update public.company_invites
     set status = 'cancelled'
   where lower(trim(email)) = v_email
     and coalesce(status, 'pending') = 'pending'
     and id is distinct from r.id;

  begin
    update public.profiles set role = r.role where id = v_uid;
  exception when others then
    null;
  end;

  out_company_id := r.company_id;
  out_company_name := r.company_name;
  out_role := r.role;
  return next;
end;
$$;

grant execute on function public.fire_s_claim_my_invites() to authenticated;

commit;

select 'fire_s_claim_my_invites ready' as status;
