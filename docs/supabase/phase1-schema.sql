-- Phase 1 schema additions
-- Run this in Supabase SQL Editor BEFORE deploying the Phase 1 front-end.
-- It adds the new auth tables, a list_id FK on items/used_log, and replaces the
-- wide-open "using(true)" RLS with per-user/household policies.
--
-- TRANSITION NOTE: items and used_log policies allow list_id IS NULL during the
-- migration window (old rows written before Phase 1 won't have list_id yet).
-- Once you confirm migration is complete (all items have list_id), drop the
-- "list_id is null" clauses — see phase1-migrate.sql for how to verify.

-- ─── 1. New tables ───────────────────────────────────────────────────────────

create table if not exists profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text,
  created_at    timestamptz default now()
);

create table if not exists households (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  created_by    uuid references auth.users(id),
  created_at    timestamptz default now()
);

create table if not exists household_members (
  household_id  uuid not null references households(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  role          text not null default 'member' check (role in ('owner', 'member')),
  primary key (household_id, user_id)
);

create table if not exists lists (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households(id) on delete cascade,
  name          text not null,
  icon          text,
  created_by    uuid references auth.users(id),
  created_at    timestamptz default now()
);

-- ─── 2. Add list_id to items and used_log ────────────────────────────────────

alter table items    add column if not exists list_id uuid references lists(id);
alter table used_log add column if not exists list_id uuid references lists(id);

create index if not exists items_list_idx    on items (list_id);
create index if not exists used_log_list_idx on used_log (list_id);

-- ─── 3. RLS helper ───────────────────────────────────────────────────────────

create or replace function is_member(h uuid) returns boolean
  language sql security definer stable as $$
    select exists (
      select 1 from household_members m
      where m.household_id = h and m.user_id = auth.uid()
    );
  $$;

-- ─── 4. Enable RLS on new tables ─────────────────────────────────────────────

alter table profiles          enable row level security;
alter table households        enable row level security;
alter table household_members enable row level security;
alter table lists             enable row level security;

-- ─── 5. Policies: profiles ───────────────────────────────────────────────────

drop policy if exists profiles_own on profiles;
create policy profiles_own on profiles for all
  using  (id = auth.uid())
  with check (id = auth.uid());

-- ─── 6. Policies: households ─────────────────────────────────────────────────

drop policy if exists households_read          on households;
drop policy if exists households_write         on households;
drop policy if exists households_owner_update  on households;
drop policy if exists households_owner_delete  on households;

create policy households_read on households for select
  using (is_member(id));

create policy households_write on households for insert
  with check (created_by = auth.uid());

create policy households_owner_update on households for update
  using (created_by = auth.uid());

create policy households_owner_delete on households for delete
  using (created_by = auth.uid());

-- ─── 7. Policies: household_members ──────────────────────────────────────────

drop policy if exists hm_read         on household_members;
drop policy if exists hm_owner_insert on household_members;
drop policy if exists hm_owner_delete on household_members;

create policy hm_read on household_members for select
  using (is_member(household_id));

-- Allow self-join (first-login bootstrap) OR owner-adds-someone-else (Phase 2 invites)
create policy hm_owner_insert on household_members for insert
  with check (
    user_id = auth.uid()   -- adding yourself (first login / invite acceptance)
    or household_id in (select id from households where created_by = auth.uid())
  );

create policy hm_owner_delete on household_members for delete
  using (
    user_id = auth.uid()   -- leave
    or household_id in (select id from households where created_by = auth.uid())  -- owner removes
  );

-- ─── 8. Policies: lists ──────────────────────────────────────────────────────

drop policy if exists lists_read  on lists;
drop policy if exists lists_write on lists;

create policy lists_read on lists for select
  using (is_member(household_id));

create policy lists_write on lists for all
  using  (is_member(household_id))
  with check (is_member(household_id));

-- ─── 9. Update items RLS ─────────────────────────────────────────────────────
-- Replaces the old wide-open "using(true)" policy.
-- "list_id is null" fallback: allows access to legacy rows during migration.
-- Requires auth.uid() to prevent anonymous access during transition.

drop policy if exists items_all    on items;
drop policy if exists items_member on items;

create policy items_member on items for all
  using (
    (list_id is null and auth.uid() is not null)
    or is_member((select household_id from lists where id = items.list_id))
  )
  with check (
    (list_id is null and auth.uid() is not null)
    or is_member((select household_id from lists where id = items.list_id))
  );

-- ─── 10. Update used_log RLS ─────────────────────────────────────────────────

drop policy if exists used_all        on used_log;
drop policy if exists used_log_member on used_log;

create policy used_log_member on used_log for all
  using (
    (list_id is null and auth.uid() is not null)
    or is_member((select household_id from lists where id = used_log.list_id))
  )
  with check (
    (list_id is null and auth.uid() is not null)
    or is_member((select household_id from lists where id = used_log.list_id))
  );
