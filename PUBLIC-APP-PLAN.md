# Pantry Inventory → Public Multi-User App: Architecture & Roadmap

Plan for evolving the single-user personal app into a public, multi-user product where families share lists.

## Decisions locked in

- **Sharing model:** family **household**. You create a household, invite family by email; everyone in it sees the household's shared lists. Each person also keeps **private personal lists**.
- **Sign-in:** **email magic link** (passwordless) via Supabase Auth.
- **AI scanning cost:** **operator-paid with per-user limits** — a free monthly scan quota per user so costs stay bounded.

## Why today's stack already fits

Supabase is Postgres + **Auth** + **Row-Level Security (RLS)**. RLS pushes "who can see which rows" down into the database, so even though every client hits the same API with the same anon key, each user only ever receives their own and their household's data. Going public = add Auth + replace today's wide-open `using(true)` policies with real per-user rules. The vanilla-JS PWA front-end and GitHub Pages hosting stay; only auth and the data model deepen.

## Data model

```
profiles            id (=auth.uid), display_name, created_at
households          id, name, created_by, created_at
household_members   household_id, user_id, role('owner'|'member')   -- PK(household_id,user_id)
lists              id, household_id, name, icon, created_by          -- a "place": Home, RV, Mom's House
items              ...existing columns..., list_id  -> lists.id      -- replaces the `place` text
used_log           ..., list_id
invites            id, household_id, email, token, invited_by, accepted, created_at
scan_usage         user_id, yyyymm, count                            -- enforces the monthly cap
```

**Personal vs shared, and the "Home / Mom's Home" case.** On signup each user auto-gets a **Personal** household; their private lists live there. Shared family places live in a **shared household** everyone's invited to. So:
- Two users can each have a list literally named **"Home"** with zero collision — they're in separate personal households.
- Shared places get their own names ("Mom's House", "Beach House") that everyone in the household sees identically.
- (Per-user *aliases* for the same shared list — you call it "Home", your sister calls it "Mom's" — is a possible later refinement via a per-member `display_name` on the membership-to-list; not needed for v1.)

## Security (RLS) approach

A helper decides membership, then every table keys off it:

```sql
-- is the current user in this household?
create function is_member(h uuid) returns boolean language sql security definer stable as $$
  select exists(select 1 from household_members m where m.household_id = h and m.user_id = auth.uid());
$$;
```

- **households / household_members / lists:** readable & writable only when `is_member(household_id)` (with owner-only checks for inviting/removing members and deleting the household).
- **items / used_log:** access allowed when the row's `list_id` belongs to a household you're a member of:
  `is_member((select household_id from lists where lists.id = items.list_id))`.

This means a stranger with the public anon key still gets **nothing** without a valid session, and a logged-in user can't read another family's data.

## Sharing / invite flow

1. A household owner enters a family member's email → creates an `invites` row.
2. Invitee signs in with a magic link to that email.
3. A signup trigger (or small Edge Function) auto-attaches any pending invites for their email as `household_members`, then marks the invite accepted.

## Scan metering (operator-paid with limits)

The `scan` Edge Function already runs server-side. We add: it reads the caller's user id from their auth token, checks `scan_usage` for the current month, and:
- under the cap → run the vision call and increment the count;
- at the cap → return a friendly "You've used your N scans this month."

A sensible starting cap is ~20–30 scans/user/month (tunable). This bounds your Anthropic bill no matter how many users sign up.

## Migrating today's data

Your current single-user data becomes **your** account on first login: each distinct `place` value (Home, RV, …) becomes a `lists` row in your Personal household, and items get the matching `list_id`. The permissive policies are dropped and replaced. Nothing is lost; it just gains an owner.

## What changes in the app (front-end)

- A **login screen** (enter email → "check your inbox") gates the app; the magic-link return establishes the session.
- The list switcher becomes **"your lists across households,"** optionally grouped (Personal / Family), with **＋ New list** and a **Share / manage household** screen (invite by email, see members).
- Everything still scopes to the selected list exactly as it does now — the list is just a real row with an owner instead of a text label.

## Scale & cost notes

- Supabase has a free tier that comfortably covers early usage; check current limits/pricing before launch and as you grow.
- Item photos are stored as base64 in the DB today — fine at small scale, but move them to **Supabase Storage** before they bloat the database at volume.
- Anthropic scan cost is bounded by the per-user cap above.
- Public = new responsibilities: a basic privacy policy, secure auth (Supabase handles the hard parts), and the abuse limits above. Email deliverability for magic links is handled by Supabase (custom SMTP recommended once you have a domain sender).

## Phased roadmap

- **Phase 0 — now:** finish & deploy the personal app (multi-list + scanning). Get it stable and real-world-tested by you.
- **Phase 1 — Accounts & lockdown:** Supabase Auth (magic link); add profiles/households/lists tables; migrate your `place` strings to `lists`; rewrite RLS to per-user/household; gate the app behind login. *This is the big structural one — best done on a branch so the working app isn't disrupted.*
- **Phase 2 — Sharing:** invites by email, household management UI, the join-on-signup flow.
- **Phase 3 — Scan limits & polish:** per-user scan quotas + usage display; move item photos to Storage; UX polish for multi-household navigation.
- **Phase 4 — optional, later:** a paid tier (Stripe) if you ever want subscriptions or higher scan limits.

## Recommended next step

Lock down **Phase 0** first (get your own app live and used), then start **Phase 1** as a deliberate chunk. When you're ready, I'll begin Phase 1 with the new schema + RLS and a login screen, built on a branch so your live app keeps working until the cutover.
