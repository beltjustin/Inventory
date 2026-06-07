-- Pantry Inventory — Supabase schema
-- Run this once in your Supabase project: SQL Editor → New query → paste → Run.

-- ---------- Tables ----------
create table if not exists items (
  id           uuid primary key default gen_random_uuid(),
  item         text not null,
  category     text,
  quantity     numeric default 1,
  unit         text,
  location     text default 'Pantry',          -- Pantry | Fridge | Freezer
  date_added   date default current_date,
  expiration   date,
  status       text default 'In Stock',         -- In Stock | Low | Out
  source       text,                            -- Receipt | Photo | Video | Manual
  notes        text,
  photo        text,                            -- optional base64 data URL
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

create table if not exists used_log (
  id            uuid primary key default gen_random_uuid(),
  date_removed  date default current_date,
  item          text not null,
  quantity_used text,
  reason        text,
  notes         text,
  created_at    timestamptz default now()
);

create index if not exists items_expiration_idx on items (expiration);
create index if not exists items_category_idx  on items (category);

-- keep updated_at fresh
create or replace function set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end; $$ language plpgsql;
drop trigger if exists items_updated_at on items;
create trigger items_updated_at before update on items
  for each row execute function set_updated_at();

-- ---------- Security ----------
-- This is a single-user personal app. RLS is ON with permissive policies so the
-- public anon key can read/write. The anon key is safe to ship in a browser, but
-- anyone with your app URL could edit data. To lock it down later, see the deploy
-- guide section "Optional: add a password".
alter table items     enable row level security;
alter table used_log  enable row level security;

drop policy if exists items_all    on items;
drop policy if exists used_all      on used_log;
create policy items_all on items    for all using (true) with check (true);
create policy used_all  on used_log for all using (true) with check (true);
