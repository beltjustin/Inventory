# Deploy to pantry.beltedgator.com (GitHub Pages)

You've already done Supabase (Steps 1–3 of the main guide: project, tables, and `config.js` filled in). This gets the app online at **https://pantry.beltedgator.com** using a separate GitHub repo + your subdomain.

> One note before you start: keep this repo **public**. On free GitHub, Pages only serves public repos — and that's fine here. The only key in the code is the Supabase **anon** key in `config.js`, which is *designed* to be exposed in a browser. There are no passwords or secrets in these files. (Want it private? You'd need GitHub Pro, or we host it elsewhere — just say so.)

---

## Step 1 — Create a new repo

1. Go to **github.com → New repository**.
2. Name it `pantry` (or anything). Leave it **Public**. Click **Create repository**.

## Step 2 — Upload the app files

1. First, confirm `config.js` has your real Supabase URL + anon key from earlier — open it and check it's not still the placeholder text.
2. On the new repo's page, click **Add file → Upload files**.
3. Drag in everything **inside** the `pantry-app` folder so that `index.html` lands at the **repo root** (not nested in a subfolder):
   ```
   index.html   app.js   config.js   manifest.json   sw.js
   icons/       supabase/
   ```
   (The `supabase/` SQL files are harmless to include; you can leave them out if you prefer.)
4. Click **Commit changes**.

> ⚠️ Critical: `index.html` must be at the top level of the repo. If you accidentally upload the `pantry-app` folder itself, the app will 404.

## Step 3 — Turn on GitHub Pages

1. Repo **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **Deploy from a branch**.
3. Branch: **main**, Folder: **/ (root)** → **Save**.
4. Wait ~1 minute. A temporary URL appears: `https://<your-username>.github.io/pantry/`. You can click it to confirm the app loads before wiring the subdomain.

## Step 4 — Point the subdomain at it

1. Still in **Settings → Pages → Custom domain**, type:
   ```
   pantry.beltedgator.com
   ```
   and **Save**. (This adds a `CNAME` file to your repo automatically.)
2. Open your DNS manager for **beltedgator.com** (the same place you set up `talk.`). Add **one** record:

   | Field | Value |
   |---|---|
   | Type | **CNAME** |
   | Name / Host | `pantry` |
   | Target / Value | `<your-username>.github.io` |
   | TTL | default / auto |

   > The target is your GitHub username + `.github.io` — **no** `/pantry`, **no** `https://`. Example: if your GitHub is `justinbelt`, the target is `justinbelt.github.io`.
3. Save. DNS propagation usually takes a few minutes (can be up to an hour).

## Step 5 — Lock in HTTPS

1. Back in **Settings → Pages**, wait until you see **"DNS check successful."**
2. Check the **Enforce HTTPS** box. The certificate can take up to an hour to issue — once it's ready, the box stays checked and the lock icon appears.
3. Visit **https://pantry.beltedgator.com**. Your pantry (37 items) should load. 🎉

## Step 6 — Install on your phone

- **iPhone (Safari):** Share → **Add to Home Screen**.
- **Android (Chrome):** menu ⋮ → **Install app**.

It gets its own icon and opens full-screen like a native app, synced to the same database as the web version.

---

## Updating it later

Edit a file in the repo (or re-upload) and commit — GitHub redeploys in about a minute. On your phone, pull-to-refresh or reopen; the service worker picks up changes on the next load. (If a change ever seems stuck, close and reopen the app, or bump `pantry-v1` to `pantry-v2` in `sw.js`.)

## If something's off

- **404 / blank page** → `index.html` isn't at the repo root. Re-upload the *contents* of `pantry-app`, not the folder.
- **Orange "Not connected" banner** → `config.js` still has placeholder values or a typo in the URL/key.
- **No install option / mixed-content warning** → you're not on `https://` yet, or "Enforce HTTPS" isn't on.
- **Subdomain won't resolve** → confirm the CNAME target is exactly `<your-username>.github.io` with no path, and that there's no other conflicting `pantry` DNS record.
- **GitHub says "domain already taken"** → the subdomain is set as a custom domain on another repo; remove it there first.
