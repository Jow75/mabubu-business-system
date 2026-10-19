# Signing in, devices, and owner recovery

How the family signs in, what a "device" is, and how the owner gets back in if a
laptop or phone forgets it. Written for the owner and for the next person
(or AI agent) working on this code. No secret values live in this file.

## The four different things people confuse

1. **First-time business setup** — creating the very first owner account. Happens
   once, ever. Uses the setup key.
2. **Ordinary sign-in** — a returning person types (or taps) their name and code.
3. **Device approval** — the first time a person signs in on a *new* phone or
   laptop, the owner approves that device once.
4. **Owner recovery** — the owner's own device no longer recognises them (usually
   because browser data was cleared). The owner re-links the device with the
   setup / recovery key. This is **not** a new setup and never creates a second owner.

## What a "device" is, and why clearing browser data matters

Each phone/laptop makes a random **device identity** (an id + a secret) the first
time the app runs, and keeps it in the browser's storage (IndexedDB, database
`mabubu-device`). The server remembers that identity and which people the owner
approved on it. The signed-in session also lives in that same storage.

The browser **cannot** prove "this is the same physical computer" from its name,
screen size or network — those can all be copied. So trust is tied to the stored
device identity, protected by owner approval. That is deliberate (see
`ADR-001` §6); we do not weaken it with a guessable "fingerprint".

**Clearing the site's data in the browser deletes that identity.** The next time
the app opens it makes a brand-new identity, so the server correctly sees a new,
unapproved device — even though it is the same laptop. The signed-in profile is
gone too, so the app asks for the name again. This is expected, and it is why
owner recovery exists.

The app asks the browser to *persist* storage at first launch to make this far
less likely, but no browser guarantees persistence, and a manual "clear site
data" always wins. **Advice: once signed in, do not clear this site's data.**

## Ordinary sign-in

- A returning person on a **recognised** device taps their name, types their
  code, and is in.
- A returning person on an **unrecognised** device (or a brand-new one) enters
  name + code. If the code is right but the device is new, the app says the code
  is correct and the device needs approving once, and shows a short device code
  (e.g. `AB1-2CD`).
- The owner opens **People & devices**, sees the request with the same code, and
  taps **Approve**. The waiting screen then signs in by itself.

Code length: workers use a **4**-digit code; the owner and managers use **6–8**
(the owner has chosen 6). The sign-in pad shows the expected length and, once the
minimum is reached, a dashed circle shows a longer code is still accepted — six
digits are never "too many". The real rule lives in `src/shared/permissions.ts`
(`MIN_PIN_LENGTH`, `MAX_PIN_LENGTH`); the screen only displays it.

Protection against guessing is unchanged: wrong-code lockout (5/10/15 → timed,
20 → owner unlock), a per-network attempt limit, codes stored only as an HMAC
with a server secret, and the device-approval requirement itself.

## Owner recovery (the owner's device forgot them)

The setup / recovery key (`SETUP_TOKEN`, held only on the server) is the owner's
recovery factor. It is a long random value, verified on the server, never stored
in the database in raw form, rate-limited through the same per-network limit as
sign-in, and never written to logs. Using it:

- **approves the current device for the existing owner** and signs them in;
- **never creates a second owner** (it matches the existing owner by name and
  only resets that account);
- **never re-seeds** places, size groups or any starter data;
- is **not** accepted on the worker/ordinary login path, and **cannot** turn a
  worker into an owner.

In the app: on the "waiting for the owner" screen there is now an **"Are you the
owner?" → Recover owner access** button, and the first-time setup screen relabels
itself as **Recover owner access** once a business already exists. Enter the key
and the owner's name; the device is approved immediately. Other already-approved
devices are left untouched.

If the key is lost or exposed, rotate it (this does not affect anyone's code):

```bash
npx wrangler secret put SETUP_TOKEN
# new value: node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

A future hardening option (not built, not needed today) is a per-owner recovery
code shown once and stored only as a hash. The shared `SETUP_TOKEN` already meets
every recovery requirement, so we kept it rather than add a table and a migration.

## Removing or retiring a device

- **People & devices → Devices**: tap **Block** on any device that is lost or no
  longer used. Blocking revokes its sessions immediately; the row stays (dimmed)
  so history is kept. You cannot block the device you are using.
- Per person, under their entry, **Remove** takes away that person's approval on a
  device without blocking the device for everyone.
- When a laptop's storage is cleared and a new identity appears, the old identity
  becomes a stale "Windows computer" entry. It is safe to block it after you have
  signed in again on the current device.

## How confirmed duplicate people/devices are handled

- A **person** is never hard-deleted (it would orphan their records). Switch them
  off with **People & devices → (person) → Switched on** unchecked. Recovery and
  ordinary login never create a second person for an existing name.
- A **device** is retired by blocking it (and revoking its access/sessions), not
  deleted, so the operations it recorded keep a valid "recorded on" reference and
  the audit log is preserved.

## Verifying a deployment without risking live data

1. `npm run check` (typecheck + tests + build) must pass first.
2. Back up the live database **before** any change to live data:
   `npx wrangler d1 export mabubu --remote --output mabubu-backup-YYYY-MM-DD.sql`
   (git-ignored; keep a copy off the laptop; never commit it).
3. `npm run deploy` builds and uploads. It prints the address and a Version ID.
4. Check the live version is the new code: open the app, confirm `GET /api/health`
   responds, and that the sign-in pad shows the expected length guidance.
5. Test a *new device* in a **separate browser profile** — never by clearing the
   owner's live browser data.
6. Read-only database checks use `npx wrangler d1 execute mabubu --remote
   --command "SELECT ..."`, selecting only non-secret columns (never `pin_hmac`,
   `secret_hash`, or `token_hash`).

See `docs/DEPLOY.md` for the account, secrets and backup layers.
