# Pantry Inventory — Project Context

Personal pantry inventory system for Justin. Goal: always know what's at home ("do I have taco shells?"), track expiration dates, add items from receipts/photos/video, and reconcile the database against the physical pantry. Built in Cowork mode.

**Long-term direction:** evolve into a public, multi-user app (family households share lists; magic-link auth; operator-paid scanning with per-user limits). Full design + phased roadmap in `PUBLIC-APP-PLAN.md`. The app is now in **Phase 2** (Sharing) — Phase 1 auth/RLS is live on main; Phase 2 adds shareable invite links, household member management, and invite acceptance on sign-in.

## The live product

A vanilla-JS **PWA** (no build step, installable, mobile-first) backed by **Supabase**, deployed on **GitHub Pages** at **https://pantry.beltedgator.com**.

- **Repo:** github.com/beltjustin/Inventory — GitHub Pages serves the `/docs` folder; custom domain via CNAME `pantry` → `beltjustin.github.io`.
- **Supabase project ref:** `kohszfgowmmmvaxryjmj`. Tables: `items`, `used_log`, `profiles`, `households`, `household_members`, `lists`. RLS is per-user/household via `is_member()` helper (Phase 1 schema). A `list_id is null` fallback in items/used_log policies allows access to legacy rows during migration.
- **Auth:** Supabase magic-link (passwordless email). The app gates on login; first login auto-migrates `place` strings to `lists` rows.
- **Vision:** Supabase Edge Function `scan` (Deno/TS) requires a valid auth session (Phase 1+) and calls the Anthropic Claude API (`claude-sonnet-4-6`). The `ANTHROPIC_API_KEY` is a **Supabase secret**, never in the client.
- **Automation:** weekly expiration email digest is disabled (will be re-enabled once the scheduled task reads from Supabase instead of xlsx).

## Files

- `docs/` — the deployed app:
  - `index.html`, `app.js`, `config.js` (Supabase URL + public anon key), `manifest.json`, `sw.js`, `icons/`
  - `supabase/schema.sql`, `supabase/seed.sql`, `supabase/migrate-places.sql`
  - `supabase/phase1-schema.sql` — Phase 1 DB additions (profiles, households, lists, new RLS)
  - `supabase/phase1-migrate.sql` — one-time data migration script (run after first login)
  - `supabase/phase2-schema.sql` — Phase 2 DB additions (invites table + SQL functions)
  - `supabase/functions/scan/index.ts` — vision Edge Function
  - `DEPLOY-GUIDE.md`, `DEPLOY-GitHub-Pages.md`, `SCAN-SETUP.md`
- `PUBLIC-APP-PLAN.md` — architecture + phased roadmap for the public multi-user version.
- `GO-LIVE-CHECKLIST.md` — ordered steps to deploy & test Phase 0.
- `pantry_inventory.xlsx` — original spreadsheet source-of-truth (legacy; the app DB is now primary). Tabs: Inventory, Used Log.
- `pantry_dashboard.html` + `build_dashboard.py` — legacy static dashboard generated from the xlsx.
- `HOW-IT-WORKS.md` — user-facing workflow notes.
- `pics/` — Justin's pantry photos/receipt/video (**gitignored, private**).

## App features

- **Multiple inventories (lists):** a top switcher toggles between separate places (Home, RV, Lake House…). Search, filters, stats, adds, scans, and reconcile all scope to the active list. Backed by a `place` column on `items`/`used_log`; the active list persists in `localStorage` (`pantry_place`). For an existing DB, run `docs/supabase/migrate-places.sql` once to add the column (existing rows default to `Home`).
- "Do I have…?" instant search.
- Item list: **Pantry / Fridge / Freezer** quick-filter buttons + colored location tags; category & status dropdown filters; All / Expiring-soon tabs; red/yellow/green expiration pills.
- **+ menu:** Add manually · Scan a receipt · Reconcile a shelf.
- Per item: **Edit** (✎ full edit incl. date/qty/location), **Use** (asks how much — partial lowers the count, full removes; both log to `used_log`), **Delete** (✕).
- **Scan / Reconcile:** stage multiple photos and/or a video (video frames extracted client-side, ~5 frames), review detected items / proposed diffs, confirm before writing. Reconcile removals are unchecked by default. Capped at 8 images per analysis.

## Conventions & gotchas

- **Never re-run `docs/supabase/seed.sql`.** It has no unique key, so re-running duplicates every row. Dedup: `delete from items a using items b where a.id>b.id and a.item=b.item and coalesce(a.location,'')=coalesce(b.location,'');`
- **Bump `CACHE` in `docs/sw.js`** (currently `pantry-v4`) whenever front-end files change, so installed PWAs pick up the update.
- The **anon key in `config.js` is public by design** (safe in-browser). The Anthropic key is NOT in the repo — it's a Supabase secret.
- **Private data stays out of the public repo** via `.gitignore` (`pics/`, `*.xlsx`, `*.py`, `pantry_dashboard.html`, `HOW-IT-WORKS.md`).
- **Desktop browser-extension bug:** a Chrome extension rewrites Supabase requests and breaks the app (PGRST125 "Invalid path specified in request URL"). It works in **incognito** and on **phone**. If a DB/scan call fails only on desktop, suspect an extension and whitelist the site.
- **Cowork bash-mount lag:** in this environment the Linux bash mount sometimes serves a stale/truncated copy of files just written via the Write/Edit tools. Verify file completeness with the **Read tool**, not `bash node --check`.

## Deploy / update workflow

1. Edit files in `docs/`.
2. If front-end changed, bump the cache version in `docs/sw.js`.
3. From the project folder: `git add docs && git commit -m "..." && git push`.
4. GitHub Pages redeploys in ~1 min; hard-refresh the app (Ctrl+Shift+R).
5. **Edge Function** changes deploy separately (Supabase dashboard editor or `supabase functions deploy scan`) — not via git.

## Common tasks

- Add items from a receipt/photo Justin sends in chat: read them and insert into Supabase `items` (or hand him the app's Scan feature).
- Schema changes: edit `schema.sql`, run in the Supabase SQL editor (remember PostgREST schema-cache reloads automatically).
