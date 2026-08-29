create or replace function public.get_app_session(p_token_hash text)
returns table (
  id bigint,
  email text,
  name text,
  role text,
  csrf_token text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select users.id, users.email::text, users.name, users.role, sessions.csrf_token
  from public.app_sessions as sessions
  join public.app_users as users on users.id = sessions.user_id
  where sessions.token_hash = p_token_hash
    and sessions.expires_at > now()
    and users.status
    and (
      users.role = 'admin'
      or (users.vip_status and (users.vip_expires_at is null or users.vip_expires_at > now()))
    )
  limit 1
$$;
