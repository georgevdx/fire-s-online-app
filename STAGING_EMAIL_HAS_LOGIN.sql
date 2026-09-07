-- Fire-S Test: tell Access whether an email already has a password.
-- Run this on the Fire-S Test Supabase SQL editor.
-- After this, "First time? Create password" stays hidden for emails that
-- already have a login.

create or replace function public.fire_s_email_has_login(p_email text)
returns boolean
language sql
security definer
set search_path = public, auth
stable
as $$
  select exists (
    select 1
      from auth.users u
     where lower(trim(u.email)) = lower(trim(p_email))
       and coalesce(u.encrypted_password, '') <> ''
  );
$$;

revoke all on function public.fire_s_email_has_login(text) from public;
grant execute on function public.fire_s_email_has_login(text) to anon, authenticated;
