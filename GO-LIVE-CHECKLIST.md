# Phase 0 Go-Live Checklist

Everything built so far, in the order to deploy and test it. Do A → B → C → D once.

---

## A. Database (Supabase → SQL Editor)

**A1. Remove duplicate rows** (only if you still see doubles in the app). New query → run:

```sql
delete from items a
using items b
where a.id > b.id
  and a.item = b.item
  and coalesce(a.location,'') = coalesce(b.location,'');
```

**A2. Add multi-list support.** New query → paste all of `docs/supabase/migrate-places.sql` → Run. (Adds the `place` column; your existing items become the "Home" list.)

---

## B. Front-end (PowerShell, from the project folder)

This deploys the list switcher, per-item Edit, partial Use, location filters, and the staged multi-photo/video scanning.

```powershell
cd "D:\OneDrive\Documents\Claude\Projects\Pantry Inventory"
git add docs CLAUDE.md PUBLIC-APP-PLAN.md GO-LIVE-CHECKLIST.md
git commit -m "Phase 0: multi-list, edit, partial use, staged photo/video scan"
git push
```

Wait ~1 minute, then hard-refresh the app (Ctrl+Shift+R), or close/reopen it on your phone.

---

## C. Vision function (Supabase → Edge Functions)

Powers the Scan + Reconcile buttons. (Your `ANTHROPIC_API_KEY` secret is already set.)

- **C1.** Edge Functions → the `scan` function → make sure its code is the **current** `docs/supabase/functions/scan/index.ts` (it accepts multiple images). If you pasted an earlier version, re-paste and **Deploy**.
- **C2.** Confirm the secret exists: Edge Functions → Secrets → `ANTHROPIC_API_KEY`.

---

## D. Test it (use your phone or a desktop incognito window)

> Why incognito/phone: the desktop browser extension that rewrites Supabase requests breaks the app. Phone and incognito are clean.

- [ ] **Lists:** switcher at top shows **Home** with your items. Pick **➕ New list…**, name it "RV" — it shows empty.
- [ ] **Add:** + → Add manually → save an item to the active list.
- [ ] **Edit:** tap ✎ on an item, change its date and quantity, save.
- [ ] **Partial use:** tap **Use**, enter less than the full amount → count drops and it's logged. Then **Use** the full amount → it's removed.
- [ ] **Location filters:** Pantry / Fridge / Freezer buttons filter the list; tags show on each row.
- [ ] **Search:** type "taco" (on the Home list) → "✓ Yes".
- [ ] **Scan receipt:** + → Scan a receipt → snap a photo → review → Add selected.
- [ ] **Reconcile:** + → Reconcile a shelf → add 2–3 photos (or a video) → Analyze → review the add/remove/change diff → Apply.

If any DB or scan call fails **only** on desktop, it's the extension — whitelist the site or use the phone.

---

## Known follow-ups (not blocking — Phase 0 polish)

- **Weekly expiration email** still reads the old `pantry_inventory.xlsx`, not the live Supabase data, so it's stale. Worth repointing it at the database (ask Claude to update the scheduled task).
- **Desktop extension** — identify and whitelist it so the app works in your normal browser (chrome://extensions, disable to find the culprit).
- The legacy `pantry_inventory.xlsx` / `pantry_dashboard.html` are no longer the source of truth (the app DB is). Keep for reference or retire.

When A–D are green, Phase 0 is live and stable — then we start Phase 1 (accounts + sharing).
