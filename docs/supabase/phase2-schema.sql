-- Phase 2 schema additions
-- Run in Supabase SQL Editor before deploying the Phase 2 front-end.
-- Adds the invites table and helper functions for the shareable invite link flow.

-- ─── 1. Invites table ────────────────────────────────────────────────────────

create table if not exists invites (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households(id) on delete cascade,
  token         text not null unique default encode(gen_random_bytes(24), 'base64url'),
  invited_by    uuid references auth.users(id),
  accepted      boolean not null default false,
  accepted_by   uuid references auth.users(id),
  created_at    timestamptz default now(),
  expires_at    timestamptz default (now() + interval '7 days')
);

create index if not exists invites_token_idx       on invites (token);
create index if not exists invites_household_idx   on invites (household_id);

alter table invites enable row level security;

-- Members of the household can read and create invites for it
drop policy if exists invites_member on invites;
create policy invites_member on invites for all
  using  (is_member(household_id))
  with check (is_member(household_id));

-- ─── 2. get_invite_info(token) ───────────────────────────────────────────────
-- Any authenticated user can call this to preview an invite before accepting.
-- Returns the household name and whether the invite is still valid.

create or replace function get_invite_info(p_token text)
  returns table (
    household_id   uuid,
    household_name text,
    invited_by_email text,
    valid          boolean
  )
  language sql security definer stable as $$
    select
      h.id,
      h.name,
      u.email,
      (i.expires_at > now() and not i.accepted) as valid
    from invites i
    join households h on h.id = i.household_id
    left join auth.users u on u.id = i.invited_by
    where i.token = p_token
      and auth.uid() is not null;  -- must be authenticated
  $$;

-- ─── 3. accept_invite(token) ─────────────────────────────────────────────────
-- Authenticated user calls this to join a household via invite token.
-- Runs as security definer so it can bypass RLS on household_members.

create or replace function accept_invite(p_token text)
  returns json
  language plpgsql security definer as $$
declare
  inv     invites%rowtype;
  already boolean;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into inv from invites
  where token = p_token
    and accepted = false
    and expires_at > now();

  if not found then
    raise exception 'Invite not found or expired';
  end if;

  -- Check if already a member
  select exists(
    select 1 from household_members
    where household_id = inv.household_id and user_id = auth.uid()
  ) into already;

  if not already then
    insert into household_members (household_id, user_id, role)
    values (inv.household_id, auth.uid(), 'member');
  end if;

  -- Mark invite accepted
  update invites
  set accepted = true, accepted_by = auth.uid()
  where id = inv.id;

  -- Ensure profile exists
  insert into profiles (id, display_name)
  values (auth.uid(), (select email from auth.users where id = auth.uid()))
  on conflict (id) do nothing;

  return json_build_object('household_id', inv.household_id, 'already_member', already);
end;
$$;

-- ─── 4. get_household_members(household_id) ──────────────────────────────────
-- Returns member list with emails for the manage modal.
-- Only callable by household members.

create or replace function get_household_members(p_household_id uuid)
  returns table (
    user_id      uuid,
    role         text,
    email        text,
    display_name text,
    is_self      boolean
  )
  language sql security definer stable as $$
    select
      hm.user_id,
      hm.role,
      u.email,
      coalesce(nullif(p.display_name, ''), u.email) as display_name,
      hm.user_id = auth.uid() as is_self
    from household_members hm
    join auth.users u on u.id = hm.user_id
    left join profiles p on p.id = hm.user_id
    where hm.household_id = p_household_id
      and is_member(p_household_id)  -- caller must be a member
    order by hm.role desc, u.email;  -- owner first
  $$;
