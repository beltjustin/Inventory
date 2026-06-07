-- Multi-list support: separate inventories (Home, RV, Lake House…).
-- Run ONCE in the Supabase SQL Editor. Existing items become the "Home" list.
alter table items    add column if not exists place text default 'Home';
alter table used_log add column if not exists place text default 'Home';
update items    set place = 'Home' where place is null;
update used_log set place = 'Home' where place is null;
create index if not exists items_place_idx on items (place);
