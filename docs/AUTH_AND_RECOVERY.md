# Signing in, devices, and owner recovery

How the family signs in, what a "device" is, and how the owner gets back in if a
laptop or phone forgets it. Written for the owner and for the next person
(or AI agent) working on this code. No secret values live in this file.
Last reviewed 20 Oct 2026 (full lifecycle audit; see §8 for what changed).

## 1. A returning account is not a returning device

Three separate things, kept in three separate places:

| Thing | What it is | Where it lives | Survives clearing browser data? |
|---|---|---|---|
| **Person (account)** | Name, role, code (as an HMAC), places, permissions | Server (`users`) | **Yes** — always |
| **Device** | A random id + secret this browser made, plus which people the owner approved on it | Browser IndexedDB `mabubu-device` + server (`devices`, `device_access`) | **No** — the browser half is deleted |
| **Session** | A sign-in token for one person on one device (30 days, extended while used) | Browser profile + server (`sessions`, hashed) | **No** |

Business records (purchases, stock, sales days, payments) live on the server
(`ops`) once synced, and are downloaded again after any sign-in. Clearing a
browser loses only records that had **not yet been sent** (the app shows that
count under Me → Sync).

## 2. The lifecycle, flow by flow

"Client" is the app in the browser; "server" is the Worker (`src/worker/auth.ts`,
`admin.ts`). Every row was traced through the real code and is covered by the
tests named at the end.

| # | Flow | Client does | Server checks | Records changed | Person sees / ends |
|---|---|---|---|---|---|
| 1 | **First-time business setup** | On a browser with no saved profile, asks `GET /setup/status` | `needsSetup` = *no users exist* (server decides, never the browser) | — | "Set up the business" only if the server says so |
| 2 | **Initial owner creation** | `POST /setup` with key, name, 6–8 digit code, device identity | Key (constant-time, per-network rate limit), owner code policy, user count = 0; the batch aborts if another setup won a race (`guard`) | `users` (1 owner), `devices`, `device_access` approved, `sessions`, `auth_events setup_owner` | Signed in; starter places/size groups offered **only while the business has no records** (`starterNeeded`) |
| 3 | **Returning owner, recognised device** | Taps saved profile, code checked **on the device** (PBKDF2 verifier), then syncs with the saved session | Session token on each sync | `sessions.last_used_at` | Straight in, offline too |
| 4 | **Manager created** | Owner: People & devices → Add person | `users.manage` (owner-only); only an owner can create/promote an owner; manager code 6–8 digits; unique name | `users`, `auth_events person_created` | New person in the list |
| 5 | **Worker created** | Same as 4 with role worker, place, 4–8 digit code | Same; place must exist | Same | Same |
| 6 | **Worker/manager, recognised device** | As 3 | As 3 | As 3 | Straight in |
| 7 | **Anyone, new device** | Name + code → `POST /auth/login` | Name + code first (wrong → `401`, lockout steps); then device: new id → `pending` + role | `devices` (once), `device_access pending` (once), `auth_events device_requested` (once, however long they poll) | Worker/manager: "Waiting for the owner" + device code. Polls every 8 s for 5 min, then every 30 s, stops after 30 min ("Check again") |
| 8 | **Owner, new or forgotten device** | As 7 | As 7; `pending` with `role: owner` | As 7 | "This computer needs to be recognised again" → **Allow this device with my recovery key** (name and code carried over) — or approve from another signed-in device |
| 9 | **Session expired / revoked** | Next sync gets `401` → profile marked "sign in online" | Session expiry, revocation, person switched off, device blocked/retired, access revoked | — | Sign-in screen with the reason; records not yet sent stay on the device |
| 10 | **Browser site data cleared** | No device identity → makes a new one; no profiles | Server unchanged | Next sign-in creates a new `devices` row | Sign-in (never first setup); then flow 7 or 8 |
| 11 | **IndexedDB missing or refused** | Boot fails to open storage | — | — | "This browser will not let Mabubu save anything" with what to do (private/Guest window, storage off) — no endless "Opening…" |
| 12 | **Owner recovery** | `POST /setup` again with the key | Key; name must match the **existing owner** (`not_owner` otherwise); owner code policy | Owner's code reset to what was typed (event records `pinChanged`), lockout cleared, this device approved (+ un-blocked/un-retired), new session, `auth_events setup_recover_owner` | Signed in as the same owner. **Never** a second owner, never re-seeds a business that has records, other devices untouched |
| 13 | **Device approval / revocation** | Owner: People & devices → Approve / Deny / Remove; Block; Retire / Reactivate | `users.manage`; cannot block/retire the device you are using | `device_access`, `devices.revoked_at` / `retired_at`, sessions ended, audit events | The waiting device signs in by itself; a blocked/retired device is refused |
| 14 | **Sign-out / switching person** | Lock (keeps profile) or "Remove *name* from this device" (logs out on the server, deletes that person's local data) | Session revoked | `sessions.revoked_at`, `auth_events logout` | Profile list; the device stays approved for that person |
| 15 | **Lost phone or laptop** | — | Owner blocks or retires the device from another device | Device blocked; its sessions end at once | On the replacement device: flow 7 (or 8 + recovery for the owner) |

**Dead ends removed in this audit:** the owner no longer sees "Waiting for the
owner" (themselves); workers no longer see an owner-recovery button that could
only fail; the waiting screen no longer polls forever; storage being unavailable
no longer leaves the app on "Opening…".

## 3. Why the owner's laptop keeps "forgetting" itself

The device identity exists only in this browser's IndexedDB. The app **never**
deletes it (checked: the only code that deletes local databases removes one
person's records on "Remove from this device", or the demo). So when a laptop
shows up as a new device, the browser removed the site's data. On 20 Oct 2026 the
live log showed exactly this again: the owner laptop identity `WR8-WYS` was last
used 19 Oct 05:55, and a new identity `MCS-MH4` (same Chrome 155 on Windows)
asked for approval at 20 Oct 07:58. Common causes, most likely first:

1. Chrome **Settings → Privacy and security → Third-party cookies / Site data →
   "Delete data sites have saved to your device when you close all windows"**
   switched on (clears every time Chrome closes).
2. Clearing browsing data with "Cookies and other site data" ticked.
3. Using an **Incognito/Guest** window or a different Chrome profile.
4. A PC cleaning tool (CCleaner and similar) clearing browser data.

The fix is on the browser side: turn the setting off, or add an exception that
**allows** `mabubu.mabubu-family.workers.dev` to keep data; open Mabubu from the
**installed app** (Chrome grants installed apps persistent storage more readily).
Me → Sync shows "Storage protected from clean-up": *Yes* means the browser
promised not to evict it automatically. **No setting protects against a manual
or automatic "clear site data"** — that always wins, and recovery is the way back.

We deliberately do **not** recognise a laptop by its browser name, screen, IP or
any "fingerprint": those can be copied, so they would let a stranger's computer
pass as the owner's (ADR-001 §6).

## 4. Owner recovery

The setup / recovery key (`SETUP_TOKEN`, held only in Cloudflare) is the owner's
recovery factor: long, random, compared in constant time, rate-limited per
network, never stored in the database, never logged. Using it:

- approves the current device for the **existing** owner and signs them in;
- never creates a second owner (matches the owner by name; refuses any other
  name with `not_owner`; a race between two first setups is aborted);
- never re-seeds places or size groups on a business that already has records;
- sets the owner code to the one typed — the form says so, and the sign-in log
  records whether it changed (`pinChanged`), never the code;
- is not accepted on ordinary sign-in and cannot make a worker or manager an owner.

**In the app:** sign in with name and code as usual. If the laptop is not
recognised, the screen says so and offers **Allow this device with my recovery
key**. The recovery form arrives with the name and code already filled in; type
the key and tap **Recover access**. The first-setup link on the sign-in screen
also reaches the same form.

Rotate a lost or exposed key (does not change anyone's code):

```bash
npx wrangler secret put SETUP_TOKEN
# new value: node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

**What remains impossible to guarantee:** a web app cannot recover a device
secret that was erased from the only place it existed, and cannot stop a person
or tool from clearing site data. If the key is lost *and* every owner device is
lost, recovery needs someone with access to the Cloudflare account to set a new
`SETUP_TOKEN` — which is why the key must be written down and kept safe.

## 5. Passkeys (WebAuthn) — assessed, not built yet

A passkey would let the owner prove who they are with Windows Hello or the
phone's screen lock, from a credential kept by Windows / Google Password Manager
**outside** the site's storage — so it survives "clear site data" and replaces
typing the long key.

| Question | Finding |
|---|---|
| Owner's devices | Chrome on Windows 11 (Windows Hello) and Chrome on Android both support platform passkeys |
| Origin | `mabubu.mabubu-family.workers.dev` is HTTPS and stable — usable as the relying-party id. Changing domain later would orphan passkeys (the key remains as fallback) |
| Server work | Challenge table + migration, registration and assertion endpoints, CBOR/COSE parsing and ES256/RS256 verification in the Worker (no library today), signature-counter and replay checks, revoke in People & devices |
| Risk | New security-critical code path; must never auto-approve anyone but the owner; must keep the key as fallback so the only owner cannot be locked out |
| Benefit | Removes the most painful step (finding the paper key) for the owner only |

**Recommendation:** keep the setup key as the secure, tested recovery path (it
already meets every recovery requirement) and fix the browser setting first
(§3). If the laptop still loses its data after that, add an **owner-only passkey
as a second, optional recovery method** in its own reviewed change, behind the
existing key. That is an owner decision; it costs nothing to run.

## 6. Removing or retiring a device

- **Block** (temporary): People & devices → device → Block. Sessions end at once;
  Unblock restores it.
- **Retire** (permanent, kept for history): for superseded identities such as an
  old "Windows computer" left behind after a browser clear. Retired devices sit in
  a collapsed "Retired devices" section; **Reactivate** (confirmed) is the only
  way back. Rows are never deleted, so records keep a valid "recorded on".
- Per person, **Remove** takes away that person's approval on one device.
- You cannot block or retire the device you are using.

## 7. Code length and lockout

Workers use **4**–8 digits; the owner and managers **6–8** (`MIN_PIN_LENGTH`,
`MAX_PIN_LENGTH` in `src/shared/permissions.ts`; the screens only display the
rule). Wrong codes: after 5 → 15 min, 10 → 1 h, 15 → 6 h, 20 → locked until an
owner unlocks; plus 30 failures per network per hour. Codes are stored only as
HMAC-SHA256 with a server secret. On a recognised device the code is checked
locally (PBKDF2, 310,000 rounds) so sign-in works offline; 5 wrong local tries
force an online sign-in.

## 8. Changes in the 20 Oct 2026 audit

- Waiting screen tells an owner apart from a worker (server returns the role
  only after the code is verified) and offers recovery directly, carrying name
  and code into the form; workers no longer see an owner-only button.
- Waiting screen backs off (8 s → 30 s) and stops after 30 min.
- First setup cannot create two owners in a race (atomic `guard` in the batch).
- Starter step offered by the server only while the business has no records,
  so an interrupted first setup can finish and recovery never re-seeds.
- Recovery logs whether the owner code changed; the form explains it.
- Storage-unavailable screen instead of a stuck "Opening…".
- Me → Sync warns when the browser has not granted persistent storage.

Tests: `tests/worker.test.ts` ("account lifecycle", "first setup is
server-authoritative", "owner recovery…", "sign-in protection", "device
retirement"), `tests/auth-e2e.test.ts` (real store + real Worker: first setup,
reload, cleared site data, recovery, sign-out, worker on a new device),
`tests/storage-blocked.test.ts`.

## 9. Verifying a deployment without risking live data

1. `npm run check` must pass.
2. Export the live database first (see `docs/DEPLOY.md`), outside the repo.
3. `npm run deploy`; note the Version ID.
4. `GET /api/health`, `GET /api/setup/status` (`needsSetup:false`), and an
   unauthenticated `GET /api/admin/people` (401).
5. Test a *new device* in a **separate browser profile** or a local
   `wrangler dev` — never by clearing the owner's live browser data.
6. Read-only checks with `npx wrangler d1 execute mabubu --remote --command
   "SELECT ..."` selecting only non-secret columns (never `pin_hmac`,
   `secret_hash`, `token_hash`).
