-- Fire-S: let an owner add the same email again after cancelling an invite.
-- Run in the SQL Editor of the cloud you are fixing:
--   Fire-S Test (toets-blad) — OK
--   fireye-sync (live) — only when Johan says sit dit live
-- Do not run Fire-S Test SQL on fireye-sync.

begin;

create or replace function public.fire_s_add_member_by_email(
  p_company_id uuid,
  p_email text,
  p_role text default 'inspector'
)
returns table (
  out_user_id uuid,
  out_email text,
  out_role text,
  out_status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(trim(p_email));
  v_role text := lower(trim(coalesce(p_role, 'inspector')));
  v_target uuid;
  v_can boolean := false;
  v_existing uuid;
  v_inactive uuid;
  v_reopened int := 0;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if v_email is null or position('@' in v_email) = 0 then
    raise exception 'Enter a valid email address';
  end if;
  if v_role not in ('inspector', 'manager', 'company_owner', 'viewer') then
    v_role := 'inspector';
  end if;

  select public.fire_s_can_manage_company(p_company_id) into v_can;
  if not v_can then
    raise exception 'Only Manager or Owner can add team members';
  end if;

  if exists (
    select 1 from public.company_invites i
    where i.company_id = p_company_id
      and lower(trim(i.email)) = v_email
      and coalesce(i.status, 'pending') = 'pending'
  ) then
    raise exception 'This email is already a paid seat. They log in on any phone or desktop with that email. Do not enter it again.';
  end if;

  select p.id into v_target from public.profiles p where lower(trim(p.email)) = v_email limit 1;
  if v_target is null then
    select u.id into v_target from auth.users u where lower(trim(u.email)) = v_email limit 1;
  end if;

  if v_target is not null then
    update public.company_members
       set status = 'active',
           role = v_role
     where company_id = p_company_id
       and user_id = v_target
       and coalesce(status, 'active') = 'inactive';
    if found then
      begin
        update public.profiles set role = v_role where id = v_target;
      exception when others then
        null;
      end;
      update public.company_invites
         set status = 'accepted'
       where company_id = p_company_id
         and lower(trim(email)) = v_email;
      return query select v_target, v_email, v_role, 'added'::text;
      return;
    end if;

    select m.user_id into v_existing
    from public.company_members m
    where m.user_id = v_target
      and coalesce(m.status, 'active') = 'active'
    limit 1;
    if v_existing is not null then
      raise exception 'This email is already a paid seat. They log in on any phone or desktop with that email. Do not enter it again.';
    end if;

    perform public.fire_s_ensure_profile(v_target, v_email, v_role);
    insert into public.company_members (company_id, user_id, role, status)
    values (p_company_id, v_target, v_role, 'active')
    on conflict (company_id, user_id)
    do update set role = excluded.role, status = 'active';
    begin
      update public.profiles set role = v_role where id = v_target;
    exception when others then
      null;
    end;
    update public.company_invites
       set status = 'accepted'
     where company_id = p_company_id
       and lower(trim(email)) = v_email;
    return query select v_target, v_email, v_role, 'added'::text;
    return;
  end if;

  update public.company_invites
     set status = 'pending',
         role = v_role,
         created_by = v_uid
   where company_id = p_company_id
     and lower(trim(email)) = v_email
     and lower(coalesce(status, 'pending')) in (
       'cancelled', 'canceled', 'expired', 'declined', 'rejected'
     );
  get diagnostics v_reopened = row_count;
  if v_reopened > 0 then
    return query select null::uuid, v_email, v_role, 'invited'::text;
    return;
  end if;

  begin
    insert into public.company_invites (company_id, email, role, status, created_by)
    values (p_company_id, v_email, v_role, 'pending', v_uid)
    on conflict (company_id, email)
    do update set role = excluded.role, status = 'pending', created_by = v_uid;
  exception when unique_violation then
    update public.company_invites
       set status = 'pending',
           role = v_role,
           created_by = v_uid
     where company_id = p_company_id
       and lower(trim(email)) = v_email;
    if not found then
      raise;
    end if;
  when others then
    update public.company_invites
       set status = 'pending',
           role = v_role,
           created_by = v_uid
     where company_id = p_company_id
       and lower(trim(email)) = v_email;
    if not found then
      raise;
    end if;
  end;

  return query select null::uuid, v_email, v_role, 'invited'::text;
end;
$$;

grant execute on function public.fire_s_add_member_by_email(uuid, text, text) to authenticated;

commit;

select 'reopen cancelled invite ready' as status;
