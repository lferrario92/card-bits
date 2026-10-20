# Database setup (manual steps)

Everything in this folder is **your** job — these SQL files are not executed by
`npm run build` or `npm run dev`. You paste them into the Supabase **SQL
Editor**, run them once, and the app starts working against the database.

> **Security:** `DATABASE_PASSWORD` in the project's `.env` is only for you and
> must never be read by app code. Vite only exposes `VITE_*` keys to the
> browser, so the app only ever ships `VITE_SUPABASE_URL` and
> `VITE_SUPABASE_ANON_KEY` (the anon key is public by design — Row Level
> Security is what protects your data).

---

## Files and the order they run in

| # | File | What it creates |
|---|------|-----------------|
| 1 | [`migrations/0001_tcg_profiles.sql`](migrations/0001_tcg_profiles.sql) | `tcg_profiles` table, auto-create trigger on sign-up, RLS policies |
| 2 | [`migrations/0002_tcg_matches.sql`](migrations/0002_tcg_matches.sql) | `tcg_matches` table, `tcg_join_match()` RPC, authority guard, RLS, Realtime publication |

**Run them strictly in that order.** `0002` depends on the
`tcg_touch_updated_at()` trigger function created in `0001`, and it references
`auth.users` which already exists in every Supabase project.

---

## Step by step

### Step 1 — Confirm your credentials are in `.env`

The project root should already contain:

```
VITE_SUPABASE_URL=https://<your-project>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>
```

Where to find them if you ever need to refresh them:
**Supabase Dashboard → Project Settings → API → Project URL / anon public key**.

Restart the dev server (`npm run dev`) after changing `.env` — Vite only reads
env files at startup.

### Step 2 — Open the SQL Editor

1. Go to <https://supabase.com/dashboard> and open your project.
2. In the left sidebar click **SQL Editor**.
3. Click **New query**.

You will run each file in its own new query tab.

### Step 3 — Run `0001_tcg_profiles.sql`

1. Open [`migrations/0001_tcg_profiles.sql`](migrations/0001_tcg_profiles.sql)
   and copy **all** of its contents.
2. Paste it into the SQL Editor.
3. Press **Run** (bottom-right, or `Ctrl+Enter`).
4. Expect: `Success. No rows returned`.

**Verify:** in the left sidebar open **Table Editor** — you should see
`tcg_profiles`.

### Step 4 — Run `0002_tcg_matches.sql`

1. Click **New query** again (do not reuse the same tab).
2. Paste the entire contents of
   [`migrations/0002_tcg_matches.sql`](migrations/0002_tcg_matches.sql).
3. Press **Run**.
4. Expect: `Success. No rows returned`.

**Verify:**
- **Table Editor** shows `tcg_matches`.
- **Database → Functions** lists `tcg_join_match`, `tcg_matches_guard`,
  `tcg_touch_updated_at`, `tcg_on_auth_user_created`.
- **Database → Publications** → `supabase_realtime` now includes
  `tcg_matches` (open the publication and check the table list).

### Step 5 — Check auth settings

**Authentication → Providers → Email**:

- **Confirm email** — two supported modes:
  - **ON (default, recommended):** after "Create account" the user must click
    the link in the confirmation email before signing in. The app shows a
    "Check your inbox" screen.
  - **OFF:** useful while testing — accounts become usable immediately.

Either mode works; the login view handles both.

### Step 6 — Verify the card art storage bucket

Card images are loaded from the public bucket named `cards`
(`.../storage/v1/object/public/cards/...`).

- Open **Storage** and confirm a bucket named `cards` exists and is **public**.
- If you create it fresh, upload your art preserving the folder paths used in
  `src/game/cards.ts` (e.g. `base2025/mas_90mil.webp`).

### Step 7 — Test

```bash
npm run dev
```

1. You land on `/login`. Create an account (or sign in).
2. **Profile** shows your display name, email and a `0–0–0` PvP record.
3. **Fight → VS PLAYER → Create match** gives you a code.
4. Open a second browser (or a private window), sign in with a second account,
   and **Join with code**.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `relation "public.tcg_profiles" does not exist` | `0001` not run | Run `0001`, then retry `0002` |
| `function public.tcg_touch_updated_at() does not exist` | `0002` run before `0001` | Run `0001`, then re-run `0002` |
| `only the match host may write battle state` | Expected — the guest never writes state | Nothing; host performs every state write |
| `Match not found, already full, or it is your own match.` | Typo'd/expired code, match full, or joining your own match | Create a fresh match |
| Realtime never fires | Table missing from the publication | Re-run the `alter publication` block at the end of `0002` |
| Images 404 | Wrong bucket name or private bucket | Rename to `cards`, make it public |
| Login works but nothing else | `.env` changed after the server started | Restart `npm run dev` |

## Re-running

Both files are **idempotent** (`create ... if not exists`, `drop ... if exists`
around every trigger/policy/function), so you can safely paste and run them
again after making edits.
