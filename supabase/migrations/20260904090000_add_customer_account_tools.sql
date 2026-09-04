alter table public.authorization_codes
  add column if not exists redeemed_by_user_id bigint references public.app_users(id) on delete set null,
  add column if not exists redeemed_at timestamptz;

create index if not exists authorization_codes_redeemed_by_idx
  on public.authorization_codes (redeemed_by_user_id)
  where redeemed_by_user_id is not null;

create or replace function public.register_app_user(
  p_email text,
  p_name text,
  p_password_hash text,
  p_auth_code text
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  selected_code_id bigint;
  selected_duration numeric;
  inserted_user_id bigint;
begin
  select codes.id, codes.duration_hours
    into selected_code_id, selected_duration
  from public.authorization_codes as codes
  where codes.code = p_auth_code
    and codes.status
    and not codes.is_used
    and (codes.expires_at is null or codes.expires_at > now())
  for update;

  if selected_code_id is null then
    return null;
  end if;

  insert into public.app_users (
    email, name, password_hash, auth_code, status, vip_status, vip_expires_at, role
  ) values (
    p_email,
    p_name,
    p_password_hash,
    p_auth_code,
    true,
    true,
    case when selected_duration > 0 then now() + (selected_duration * interval '1 hour') else null end,
    'customer'
  )
  returning app_users.id into inserted_user_id;

  update public.authorization_codes
  set is_used = true,
      redeemed_by_user_id = inserted_user_id,
      redeemed_at = now()
  where authorization_codes.id = selected_code_id
    and not authorization_codes.is_used;

  if not found then
    raise exception 'Authorization code redemption failed';
  end if;

  return inserted_user_id;
end;
$$;

create or replace function public.change_app_password(
  p_user_id bigint,
  p_current_password_hash text,
  p_new_password_hash text
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.app_users
  set password_hash = p_new_password_hash
  where app_users.id = p_user_id
    and app_users.role = 'customer'
    and app_users.password_hash = p_current_password_hash;

  if not found then
    return false;
  end if;

  delete from public.app_sessions where app_sessions.user_id = p_user_id;
  return true;
end;
$$;

create or replace function public.redeem_app_authorization_code(
  p_user_id bigint,
  p_auth_code text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  selected_code_id bigint;
  selected_duration numeric;
  current_vip_status boolean;
  current_expiry timestamptz;
  next_expiry timestamptz;
begin
  select users.vip_status, users.vip_expires_at
    into current_vip_status, current_expiry
  from public.app_users as users
  where users.id = p_user_id
    and users.role = 'customer'
    and users.status
  for update;

  if not found then
    return jsonb_build_object('status', 'invalid');
  end if;

  if current_vip_status and current_expiry is null then
    return jsonb_build_object('status', 'already-unlimited');
  end if;

  select codes.id, codes.duration_hours
    into selected_code_id, selected_duration
  from public.authorization_codes as codes
  where codes.code = p_auth_code
    and codes.status
    and not codes.is_used
    and (codes.expires_at is null or codes.expires_at > now())
  for update;

  if selected_code_id is null then
    return jsonb_build_object('status', 'invalid');
  end if;

  next_expiry := case
    when selected_duration <= 0 then null
    else greatest(coalesce(current_expiry, now()), now()) + (selected_duration * interval '1 hour')
  end;

  update public.authorization_codes
  set is_used = true,
      redeemed_by_user_id = p_user_id,
      redeemed_at = now()
  where authorization_codes.id = selected_code_id
    and not authorization_codes.is_used;

  if not found then
    raise exception 'Authorization code redemption failed';
  end if;

  update public.app_users
  set vip_status = true,
      vip_expires_at = next_expiry
  where app_users.id = p_user_id;

  return jsonb_build_object('status', 'redeemed', 'vip_expires_at', next_expiry);
end;
$$;

revoke all on function public.change_app_password(bigint, text, text) from public, anon, authenticated;
revoke all on function public.redeem_app_authorization_code(bigint, text) from public, anon, authenticated;
grant execute on function public.change_app_password(bigint, text, text) to service_role;
grant execute on function public.redeem_app_authorization_code(bigint, text) to service_role;
