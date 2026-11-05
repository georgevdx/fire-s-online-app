-- Live cloud (fireye-sync). Run this once in the live SQL editor.
-- Does not delete inspections, companies, or logins.
-- Do not run SUPABASE_smooth_onboarding.sql as a whole for this fix.

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
    (select nullif(trim(u.email), '') from auth.users u where u.id = v_uid),
    (select nullif(trim(u.raw_user_meta_data ->> 'email'), '') from auth.users u where u.id = v_uid)
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
    update public.company_invites
       set status = 'accepted'
     where company_id = v_existing
       and lower(trim(email)) = v_email
       and coalesce(status, 'pending') = 'pending';
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

  update public.company_members
     set company_id = r.company_id,
         role = coalesce(nullif(trim(r.role), ''), 'inspector'),
         status = 'active'
   where user_id = v_uid
     and coalesce(status, 'active') <> 'active';

  if not found then
    begin
      insert into public.company_members (company_id, user_id, role, status)
      values (
        r.company_id,
        v_uid,
        coalesce(nullif(trim(r.role), ''), 'inspector'),
        'active'
      )
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
  end if;

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

create or replace function public.fire_s_company_members_entitlement_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_info jsonb;
begin
  if auth.uid() is null then
    return NEW;
  end if;
  if public.fire_s_is_super_admin() then
    return NEW;
  end if;
  if tg_op <> 'INSERT' then
    return NEW;
  end if;
  if not exists (
    select 1
    from public.company_members m
    where m.company_id = NEW.company_id
      and m.id is distinct from NEW.id
  ) then
    return NEW;
  end if;

  -- Same login already on this company: upsert / reactivate, not a new paid seat.
  if exists (
    select 1
    from public.company_members m
    where m.company_id = NEW.company_id
      and m.user_id = NEW.user_id
      and m.id is distinct from NEW.id
  ) then
    return NEW;
  end if;

  -- Owner already added this email under People. Claiming that invite
  -- opens Home. The inspector does not Subscribe.
  if exists (
    select 1
    from public.company_invites i
    where i.company_id = NEW.company_id
      and lower(trim(i.email)) = lower(trim(coalesce(
        (select u.email from auth.users u where u.id = NEW.user_id),
        (select u.raw_user_meta_data ->> 'email' from auth.users u where u.id = NEW.user_id),
        ''
      )))
      and lower(coalesce(i.status, 'pending')) = 'pending'
  ) then
    return NEW;
  end if;

  v_info := public.fire_s_compute_entitlement(NEW.company_id);
  if coalesce((v_info->>'can_create')::boolean, false) is not true
     and coalesce((v_info->>'allowed')::boolean, false) is not true then
    raise exception 'FIRE_S_ENTITLEMENT:%:%',
      coalesce(v_info->>'reason', 'subscription_required'),
      'A Fire-S subscription is required to add company logins';
  end if;
  return NEW;
end;
$$;

drop trigger if exists fire_s_company_members_entitlement_guard on public.company_members;
create trigger fire_s_company_members_entitlement_guard
  before insert on public.company_members
  for each row
  execute procedure public.fire_s_company_members_entitlement_guard();

commit;

select 'live claim join ready' as status;
