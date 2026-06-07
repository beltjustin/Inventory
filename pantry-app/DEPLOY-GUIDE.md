# Pantry Inventory — Deploy Guide

This turns the `pantry-app` folder into a real app you can open on your phone **and** a website, with edits syncing between them. Total time: ~20 minutes. Cost: **$0**.

There are two pieces:
- **The database** (Supabase) — the cloud storage your phone and the website both read/write.
- **The app** (these static files) — the screen you actually use, hosted on a free static host.

You do this once. After that, you just use the app.

---

## What's in this folder

```
pantry-app/
├── index.html        the app screen
├── app.js            app logic
├── config.js         ← you paste 2 values here (Step 3)
├── manifest.json     makes it installable
├── sw.js             offline support
├── icons/            app icons
└── supabase/
    ├── schema.sql    creates the tables (run once)
    └── seed.sql      loads your current 37 items (optional)
```

---

## Step 1 — Create a free Supabase project

1. Go to **https://supabase.com** → **Start your project** → sign in with GitHub or email.
2. Click **New project**. Give it a name (e.g. `pantry`), set a database password (save it somewhere), pick the closest region, and create. It takes ~2 minutes to spin up.

## Step 2 — Create the tables

1. In your project, open **SQL Editor** (left sidebar) → **New query**.
2. Open `supabase/schema.sql` from this folder, copy all of it, paste into the editor, click **Run**. You should see "Success".
3. *(Optional, recommended)* Do the same with `supabase/seed.sql` to load your current 37 pantry items. Skip this if you'd rather start empty.

## Step 3 — Connect the app to your database

1. In Supabase, go to **Project Settings → API**.
2. Copy two values:
   - **Project URL** (looks like `https://abcdefgh.supabase.co`)
   - **anon public** key (a long string under "Project API keys")
3. Open `config.js` in this folder in any text editor and paste them in:

   ```js
   window.PANTRY_CONFIG = {
     SUPABASE_URL: "https://abcdefgh.supabase.co",
     SUPABASE_ANON_KEY: "paste-the-long-anon-key-here"
   };
   ```

4. Save the file. *(The anon key is designed to be public in a browser — that's normal. See "Lock it down" below if you want a password.)*

## Step 4 — Put the app online

Pick whichever you like — all free. **Netlify Drop is the easiest (literally drag-and-drop).**

**Option A — Netlify Drop (no account-fuss, fastest)**
1. Go to **https://app.netlify.com/drop**.
2. Drag the **entire `pantry-app` folder** onto the page.
3. It gives you a live URL like `https://your-pantry.netlify.app`. Done.
4. To update later (e.g. after editing config.js), drag the folder again, or connect it to a free Netlify account for a permanent URL.

**Option B — Vercel**
1. Install nothing; go to **https://vercel.com**, sign in, **Add New → Project**, and upload/import the folder (or push it to a GitHub repo and import that).
2. No build settings needed — it's plain static files. Deploy.

**Option C — GitHub Pages**
1. Create a GitHub repo, upload the contents of `pantry-app`.
2. Repo **Settings → Pages → Deploy from branch → main → /(root)**. Your site appears at `https://yourname.github.io/repo`.

> ⚠️ Must be served over **https://** (all three options above are). Opening `index.html` by double-clicking from your hard drive won't allow camera or "install" features.

## Step 5 — Install it on your phone

1. Open your live URL in your phone's browser.
2. **iPhone (Safari):** Share button → **Add to Home Screen**.
   **Android (Chrome):** menu (⋮) → **Install app** / **Add to Home Screen**.
3. It now has its own icon and opens full-screen like a native app. Edits you make on your phone show up on the website (and vice-versa) after a refresh.

---

## Using the app

- **"Do I have…?"** — type in the search box for an instant yes/no while you're at the store.
- **+ button** — add an item; optionally snap a photo (the camera opens on phone).
- **Tap an item** — edit it.
- **Used** — logs it to the used history and removes it from stock.
- **✕** — delete without logging.
- **Expiring soon** tab — what to use up first. Items under 7 days show red, under 30 yellow.

## Lock it down (optional)

The default setup lets anyone who knows your app URL edit data — fine for a private link, but if you want a gate:
- Easiest: in Supabase **Authentication**, enable **Email** sign-in, then tell me and I'll add a one-screen login to the app and tighten the database rules so only you can read/write.

## Keeping it fed

You can still send me receipt/pantry photos in chat any time — I'll read them and add the items straight into your Supabase database so they appear in the app. The spreadsheet (`pantry_inventory.xlsx`) and weekly expiration email keep working too; tell me if you'd rather retire those now that the app exists.
