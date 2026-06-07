# Scan & Reconcile — Setup

This turns on the **Scan a receipt** and **Reconcile a shelf** buttons. They send a photo to a small server function (a Supabase Edge Function) that calls Claude's vision API to read the image, then you review the results before anything is saved.

The Anthropic API key lives only inside that function as a secret — it is **never** in the app or visible to anyone using the site.

There are two parts: (A) push the updated app, and (B) set up the function. Do both once.

---

## Part A — Push the updated app

The new buttons and the Pantry/Fridge/Freezer filters are in the front-end files. From the project folder:

```powershell
cd "D:\OneDrive\Documents\Claude\Projects\Pantry Inventory"
git add docs
git commit -m "Add scan/reconcile + location filters"
git push
```

Give GitHub Pages a minute, then hard-refresh the app (Ctrl+Shift+R). You'll see the location buttons immediately. The Scan buttons will show an error until you finish Part B.

---

## Part B — Set up the vision function

### 1. Get an Anthropic API key

1. Go to **https://console.anthropic.com** → sign in → **API Keys** → **Create Key**. Copy it (starts with `sk-ant-...`).
2. Add a little credit under **Billing** (a few dollars lasts a long time — each scan costs roughly a cent or two).

### 2. Create the Edge Function in Supabase

**Dashboard way (no CLI):**
1. In your Supabase project, left sidebar → **Edge Functions** → **Create a new function** (or "Deploy a new function" → via editor).
2. Name it exactly **`scan`**.
3. Open `docs\supabase\functions\scan\index.ts` from this project, copy all of it, paste it into the function editor (replacing any starter code).
4. Click **Deploy**.

**CLI way (if you prefer):**
```powershell
# one-time: install the Supabase CLI, then from the project folder
supabase login
supabase link --project-ref kohszfgowmmmvaxryjmj
supabase functions deploy scan
```
(The function file is at `docs/supabase/functions/scan/index.ts`.)

### 3. Add your API key as a secret

The function reads `ANTHROPIC_API_KEY` from the environment.

- **Dashboard:** Edge Functions → **Secrets** (or **Manage secrets**) → add:
  - Name: `ANTHROPIC_API_KEY`
  - Value: your `sk-ant-...` key
- **CLI:** `supabase secrets set ANTHROPIC_API_KEY=sk-ant-...`

That's it. Reload the app and try **+ → Scan a receipt**.

---

## How to use it

- **Scan a receipt:** + button → *Scan a receipt* → take a photo. Claude reads the line items, guesses categories, storage location, and expiration dates, and shows you a checklist. Uncheck anything you don't want, tap **Add selected**.
- **Reconcile a shelf:** + button → *Reconcile a shelf* → photograph a section. It compares what it sees to your inventory and proposes: items to **add**, **quantity changes**, and things that look **used up** (removals are unchecked by default so nothing disappears without your say-so). Review, then **Apply**.

Tip: reconcile works best one shelf at a time, well-lit, front labels facing out. A camera can't see behind the front row, so treat it as a smart assistant you confirm — not a perfect auto-counter.

## Notes & knobs

- **Model / cost:** the function uses `claude-sonnet-4-6` for accuracy. For cheaper scans, open `index.ts`, change the `MODEL` constant to `claude-haiku-4-5-20251001`, and redeploy.
- **Who can call it:** the function requires your Supabase anon key (which the app already sends). That key is public by design, so for a personal app this is fine; if you ever want it locked to just you, tell me and I'll add a login.
- **If a scan errors:** the app shows the reason. The usual causes are the function not being deployed yet, or the `ANTHROPIC_API_KEY` secret missing/typo'd.
