drop function if exists public.get_app_session(text);

create function public.get_app_session(p_token_hash text)
returns table (
  id bigint,
  email text,
  name text,
  role text,
  csrf_token text,
  vip_status boolean,
  vip_expires_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    users.id,
    users.email::text,
    users.name,
    users.role,
    sessions.csrf_token,
    users.vip_status,
    users.vip_expires_at
  from public.app_sessions as sessions
  join public.app_users as users on users.id = sessions.user_id
  where sessions.token_hash = p_token_hash
    and sessions.expires_at > now()
    and users.status
  limit 1
$$;

revoke all on function public.get_app_session(text) from public;
grant execute on function public.get_app_session(text) to service_role;
