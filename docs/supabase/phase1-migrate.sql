-- Phase 1 data migration
-- Run this in Supabase SQL Editor AFTER:
--   1. Running phase1-schema.sql
--   2. Signing in once with your email magic link
--
-- Step 1: Find your user ID
--   Supabase dashboard → Authentication → Users → copy your UUID
--
-- Step 2: Paste your UUID below and run.

DO $$
DECLARE
  uid        uuid := 'PASTE-YOUR-USER-UUID-HERE';   -- ← replace this
  hid        uuid;
  pname      text;
  lid        uuid;
BEGIN
  -- Guard: skip if already migrated
  IF (SELECT count(*) FROM household_members WHERE user_id = uid) > 0 THEN
    RAISE NOTICE 'Already migrated — nothing to do.';
    RETURN;
  END IF;

  -- Create Personal household
  INSERT INTO households (name, created_by)
  VALUES ('Personal', uid)
  RETURNING id INTO hid;

  -- Add as owner
  INSERT INTO household_members (household_id, user_id, role)
  VALUES (hid, uid, 'owner');

  -- Create profile
  INSERT INTO profiles (id, display_name)
  VALUES (uid, '')
  ON CONFLICT (id) DO NOTHING;

  -- Create a list for each distinct place in items, and update list_id
  FOR pname IN
    SELECT DISTINCT coalesce(place, 'Home') AS p FROM items WHERE list_id IS NULL
  LOOP
    INSERT INTO lists (household_id, name, created_by)
    VALUES (hid, pname, uid)
    RETURNING id INTO lid;

    UPDATE items
    SET list_id = lid
    WHERE coalesce(place, 'Home') = pname AND list_id IS NULL;

    UPDATE used_log
    SET list_id = lid
    WHERE coalesce(place, 'Home') = pname AND list_id IS NULL;

    RAISE NOTICE 'Migrated list: % → %', pname, lid;
  END LOOP;

  -- If items table was empty, create a default Home list anyway
  IF NOT EXISTS (SELECT 1 FROM lists WHERE household_id = hid) THEN
    INSERT INTO lists (household_id, name, created_by)
    VALUES (hid, 'Home', uid);
    RAISE NOTICE 'Created default Home list (no items to migrate).';
  END IF;

  RAISE NOTICE 'Migration complete. Household: %', hid;
END $$;

-- Verify (run separately after the DO block above):
-- SELECT l.name, count(i.id) AS item_count
-- FROM lists l
-- LEFT JOIN items i ON i.list_id = l.id
-- GROUP BY l.name ORDER BY l.name;
--
-- Once all items have list_id, you can tighten RLS by removing the
-- "list_id is null" fallback clauses in phase1-schema.sql.
