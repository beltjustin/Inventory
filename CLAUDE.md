# Pantry Inventory — Project Context

Personal pantry inventory system for Justin. Goal: always know what's at home ("do I have taco shells?"), track expiration dates, add items from receipts/photos/video, and reconcile the database against the physical pantry. Built in Cowork mode.

## The live product

A vanilla-JS **PWA** (no build step, installable, mobile-first) backed by **Supabase**, deployed on **GitHub Pages** at **https://pantry.beltedgator.com**.

- **Repo:** github.com/beltjustin/Inventory — GitHub Pages serves the `/docs` folder; custom domain via CNAME `pantry` → `beltjustin.github.io`.
- **Supabase project ref:** `kohszfgowmmmvaxryjmj`. Tables `items` and `used_log` (Postgres). RLS is ON with permissive `using(true)` policies — single-user personal app, anon key does read/write.
- **Vision:** Supabase Edge Function `scan` (Deno/TS) calls the Anthropic Claude API (`claude-sonnet-4-6`) to parse receipts and reconcile pantry photos/video frames. The `ANTHROPIC_API_KEY` is a **Supabase secret**, never in the client.
- **Automation:** a scheduled task emails Justin a weekly expiration digest.

## Files

- `docs/` — the deployed app:
  - `index.html`, `app.js`, `config.js` (Supabase URL + public anon key), `manifest.json`, `sw.js`, `icons/`
  - `supabase/schema.sql`, `supabase/seed.sql`
  - `supabase/functions/scan/index.ts` — vision Edge Function
  - `DEPLOY-GUIDE.md`, `DEPLOY-GitHub-Pages.md`, `SCAN-SETUP.md`
- `pantry_inventory.xlsx` — original spreadsheet source-of-truth (legacy; the app DB is now primary). Tabs: Inventory, Used Log.
- `pantry_dashboard.html` + `build_dashboard.py` — legacy static dashboard generated from the xlsx.
- `HOW-IT-WORKS.md` — user-facing workflow notes.
- `pics/` — Justin's pantry photos/receipt/video (**gitignored, private**).

## App features

- "Do I have…?" instant search.
- Item list: **Pantry / Fridge / Freezer** quick-filter buttons + colored location tags; category & status dropdown filters; All / Expiring-soon tabs; red/yellow/green expiration pills.
- **+ menu:** Add manually · Scan a receipt · Reconcile a shelf.
- Per item: **Edit** (✎ full edit incl. date/qty/location), **Use** (asks how much — partial lowers the count, full removes; both log to `used_log`), **Delete** (✕).
- **Scan / Reconcile:** stage multiple photos and/or a video (video frames extracted client-side, ~5 frames), review detected items / proposed diffs, confirm before writing. Reconcile removals are unchecked by default. Capped at 8 images per analysis.

## Conventions & gotchas

- **Never re-run `docs/supabase/seed.sql`.** It has no unique key, so re-running duplicates every row. Dedup: `delete from items a using items b where a.id>b.id and a.item=b.item and coalesce(a.location,'')=coalesce(b.location,'');`
- **Bump `CACHE` in `docs/sw.js`** (currently `pantry-v3`) whenever front-end files change, so installed PWAs pick up the update.
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
