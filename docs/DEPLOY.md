# Putting Mabubu on the internet (free) — and keeping it safe

Everything here runs on Cloudflare's **free** plan. No card is needed and nothing in these steps costs money. When a free daily limit is reached, requests stop until the next day (00:00 UTC); Cloudflare does not charge automatically.

## What exists now (verified 18 Oct 2026)

| Item | Value | Notes |
|---|---|---|
| Cloudflare account | the owner's account (shown by `npx wrangler whoami`) | Logged in on the laptop with `npx wrangler login` |
| Worker (app + API) | `mabubu` | One Worker serves the screens and `/api/*` |
| D1 database | `mabubu`, id `99eb0bfa-4c87-4afc-be5f-3cb0faf397ef`, region WEUR | Set in `wrangler.jsonc`. The id is not a secret |
| Migrations applied | `0001_init.sql` … `0004_late_records.sql` (0004 on 24 Oct 2026) | Check with `npx wrangler d1 migrations list mabubu --remote` |
| Secrets | `PIN_PEPPER`, `SETUP_TOKEN` | Stored only in Cloudflare (`npx wrangler secret list` shows the names, never the values) |
| Code | GitHub `Jow75/mabubu-business-system` (private), branch `main` | No automatic deploy from GitHub |

Free-plan limits that matter (Cloudflare docs, checked 18 Oct 2026): Workers 100,000 requests/day and 10 ms CPU per request; D1 5 million rows read and 100,000 rows written per day, 5 GB storage. A family business uses a small fraction of this.

## The two secrets

- **`SETUP_TOKEN`** — the owner's setup and recovery key. It was generated on the laptop and shown once in Notepad (`Documents\MABUBU-SETUP-KEY.txt`). Write it on paper, keep it safe, then delete that file. Never paste it into a chat, email or the code.
- **`PIN_PEPPER`** — protects everyone's codes. It was generated and sent straight to Cloudflare; no copy exists anywhere else, and none is needed. **Never change it after people have codes**: every code would stop working.

To replace a lost or exposed setup key (does not affect anyone's code):

```bash
npx wrangler secret put SETUP_TOKEN
```

Paste a new long random value when asked. Make one with:
`node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"`

## First sign-in (owner)

1. Open the app address (printed by the deploy; see *Publishing* below) on the laptop.
2. Choose the language.
3. The app opens **Set up the business** because there is no owner yet. Enter the setup key, your name and a **6-digit** owner code, twice.
4. Tick the places and size groups to create, then add vendors and garment types under **Garments & prices**, and set the Comoros selling prices.
5. **People & devices → Add person** for each family member and worker. Choose their role and give them their code **in person** (workers 4 digits, owner and managers 6).

## Each person's phone

1. Open the address in **Chrome** on the phone.
2. Choose the language (the phone's language is suggested; French on a French phone).
3. Chrome menu (⋮) → **Add to Home screen / Install app**.
4. The person types their name and code. The phone shows a short code such as `K7Q-2M4`.
5. On the laptop, **People & devices** shows the request at the top with the same code. Check it matches and tap **Approve**.

## Publishing a new version

Only after the checks pass:

```bash
npm run check
npm run deploy
```

`npm run deploy` builds the app and uploads it. It prints the address (`https://mabubu.<account-subdomain>.workers.dev`). If a change adds a file in `migrations/`, first run `npm run db:migrate:remote` and read what it is going to apply.

Phones pick up a new version by themselves the next time the app is opened online (the service worker checks for updates and replaces the old files). Records waiting to sync are kept on the phone through updates.

## Backups and recovery

There are three layers. Use all three.

1. **Cloudflare Time Travel (automatic).** D1 keeps restore points for the last **7 days** on the free plan (30 on paid). See where you are:
   `npx wrangler d1 time-travel info mabubu`
   A restore **overwrites the whole database** with its state at that moment, and everything recorded after that moment is lost. Use it only for a disaster (for example a bad migration), and always export first (step 2). It prints a bookmark that can undo the restore.
2. **Database export (manual, weekly).**
   `npx wrangler d1 export mabubu --remote --output mabubu-backup-YYYY-MM-DD.sql`
   Keep the file off the laptop too (USB stick and Google Drive). Never put it in the Git repository: it contains real business records (`.gitignore` blocks `mabubu-backup-*` files).
3. **App backup (owner, any time).** **Settings → Download full backup** saves every record as one JSON file.

Safe recovery rule: never restore over a database that has newer records you want to keep. If something looks wrong, first export, then compare, then decide. Corrections inside the app are done by cancelling a record with a reason, which keeps history; they never need a restore.

## If usage grows

If the free limits are ever reached, Cloudflare's **Workers Paid** plan is **$5/month** and nothing changes in the app. Do not switch unless the owner decides to.

## Staging (test copy with synthetic data)

`npm run deploy:staging` deploys the same build to the Worker `mabubu-staging`
with its own database `mabubu-staging` and its own secrets
(`npx wrangler secret put <NAME> --env staging`); migrations:
`npm run db:migrate:staging`. Address:
https://mabubu-staging.mabubu-family.workers.dev. Only synthetic data; never
copy production records there.

**Setting a secret on Windows:** paste the value when Wrangler asks. Do not pipe
it from Windows PowerShell 5.1 (`"x" | npx wrangler secret put …`): the value
arrives with extra characters and the key "does not match". From Git Bash,
`printf '%s' "$VALUE" | npx wrangler secret put NAME` is safe.

## Rolling back (rehearsed on staging, 20 Oct 2026)

1. `npx wrangler deployments list` — the current and earlier versions.
2. `npx wrangler versions list` — check **Source**: a "Secret Change" creates a
   new version. **Never roll back to a version older than a secret change**: the
   old secret comes back with it (on staging this broke sign-in, as expected).
   Production's secrets were set before its first code version, so all its
   versions are safe targets today.
3. `npx wrangler rollback <version-id> --message "why" --yes`.
4. Check: open the app (the page names a different `assets/index-….js`),
   `GET /api/health`, `GET /api/setup/status`, sign in.
5. Roll forward the same way when fixed.

A Worker rollback changes code only: **never** the D1 schema or records. Every
version since `6bd4ba0f` expects migrations 0001–0003; older ones ignore the
one column 0003 added. Migration 0004 (24 Oct 2026) only adds two nullable
columns to `ops` (`review`, `resolved_by`), so rolling back to `d20cecee` or
earlier still works: older code ignores them. Two cautions after a rollback:
late records then show as plain refusals again, and records of the two new
types (`op.resolve`, `payment.allocate`) stay in the database untouched; the
older app would not download them anyway (it does not ask for sync protocol 2).
Do not roll back past a deploy that the records depend on without asking. A data problem is corrected in the app (cancel with a
reason), or in a disaster restored from Time Travel / an export **into a new
database** after exporting the current one — never over newer records.

**Restore check:** an export can be proven complete without Cloudflare by loading
it into a fresh SQLite database (Node's `node:sqlite`, `db.exec(file)`) and
comparing counts and `PRAGMA integrity_check`. (`wrangler d1 execute --local
--file` fails on this laptop for any file; that is a tool problem.)
