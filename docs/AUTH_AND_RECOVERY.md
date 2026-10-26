# Signing in, devices, and owner recovery

How the family signs in, what a "device" is, and how the owner gets back in if a
laptop or phone forgets it. Written for the owner and for the next person
(or AI agent) working on this code. No secret values live in this file.
Last reviewed 26 Oct 2026 (temporary owner sign-in, ADR-006 and §2a; laptop
identity evidence of 25 Oct evening, §3; lifecycle audit 20 Oct, §8).

## 1. A returning account is not a returning device

Three separate things, kept in three separate places:

| Thing | What it is | Where it lives | Survives clearing browser data? |
|---|---|---|---|
| **Person (account)** | Name, role, code (as an HMAC), places, permissions | Server (`users`) | **Yes** — always |
| **Device** | A random id + secret this browser made, plus which people the owner approved on it | Browser IndexedDB `mabubu-device` + server (`devices`, `device_access`) | **No** — the browser half is deleted |
| **Session** | A sign-in token for one person on one device (30 days, extended while used) | Browser profile + server (`sessions`, hashed) | **No** |
| **Temporary sign-in** (owner only, ADR-006) | A session with no device approval behind it: 8 hours at most, ends after 30 minutes unused, no owner-only rights | This browser tab only + server (`sessions.temporary = 1`) | Nothing to clear: closing the tab forgets it |

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
| 8 | **Owner, new or forgotten device** | As 7 | As 7; `pending` with `role: owner`. A request the owner once refused for themselves on this device is opened again (never "not allowed") | As 7 | "This computer is not one of yours yet" with two choices: **Sign in temporarily** (8a) or **Make it one of my devices** — approve the code from another signed-in owner device, or **Allow this device with my recovery key** (name and code carried over) |
| 8a | **Owner, temporary sign-in** (ADR-006) | `POST /auth/temporary`; records kept in memory, token in the tab's session storage, no saved profile | Same code check and lockout as 7; owner only (others: `owner_only`); device not blocked | `sessions` (temporary), the owner's open request for this device closed, `auth_events login_temporary` | In at once with a ribbon "Temporary sign-in · ends HH:MM" and **Sign out**; no People & devices, Settings changes, backup or go live. Ends: Sign out, 20 min idle in the app / 30 min unused on the server, 8 h, owner's Sign out in People & devices, a new code, block |
| 9 | **Session expired / revoked** | Next sync gets `401` → profile marked "sign in online" | Session expiry, revocation, person switched off, device blocked/retired, access revoked | — | Sign-in screen with the reason; records not yet sent stay on the device |
| 10 | **Browser site data cleared** | No device identity → makes a new one; no profiles | Server unchanged | Next sign-in creates a new `devices` row | Sign-in (never first setup); then flow 7 or 8 |
| 11 | **IndexedDB missing or refused** | Boot fails to open storage | — | — | "This browser will not let Mabubu save anything" with what to do (private/Guest window, storage off) — no endless "Opening…" |
| 12 | **Owner recovery** | `POST /setup` again with the key | Key; name must match the **existing owner** (`not_owner` otherwise); owner code policy | Owner's code reset to what was typed (event records `pinChanged`), lockout cleared, this device approved (+ un-blocked/un-retired), new session, `auth_events setup_recover_owner` | Signed in as the same owner. **Never** a second owner, never re-seeds a business that has records, other devices untouched |
| 13 | **Device approval / revocation** | Owner: People & devices → Approve / Deny / Remove; Block; Retire / Reactivate | `users.manage`; cannot block/retire the device you are using | `device_access`, `devices.revoked_at` / `retired_at`, sessions ended, audit events | The waiting device signs in by itself; a blocked/retired device is refused |
| 14 | **Sign-out / switching person** | Lock (keeps profile) or "Remove *name* from this device" (logs out on the server, deletes that person's local data) | Session revoked | `sessions.revoked_at`, `auth_events logout` | Profile list; the device stays approved for that person |
| 15 | **Lost phone or laptop** | — | Owner blocks or retires the device from another device | Device blocked; its sessions end at once | On the replacement device: flow 7 (or 8 + recovery for the owner) |
| 16 | **Person archived, or removed from a device** | Each download now says who on this device may no longer sign in (`deviceUsers`); the app takes them off its sign-in list with their local copy — or keeps them marked "No longer allowed on this device" if records they saved there were never sent. The same happens when such a person tries to sign in (`disabled`, `device_denied`) | Archived: sign-in refused (`disabled`) and **no new sales day** can be recorded for them by anyone (the rules refuse it; a started day can still be finished) | — | The person disappears from that phone's "Who is working?" list; history stays on the server |
| 17 | **Owner gives someone a new code** | The phone still remembers the old code. A code the phone does not recognise is now checked online when there is a connection, so the new code works at once (and is remembered); offline, the phone's own check and its 5-try limit apply as before | Code check with lockout | `sessions` | Signed in with the new code |

**Dead ends removed in this audit:** the owner no longer sees "Waiting for the
owner" (themselves); workers no longer see an owner-recovery button that could
only fail; the waiting screen no longer polls forever; storage being unavailable
no longer leaves the app on "Opening…".

## 3. Why the owner's laptop keeps "forgetting" itself (investigated 25 Oct 2026)

**What the evidence shows** (owner laptop, read-only inspection of Chrome's own
files, matched to the server's device rows; no secrets read):

| Laptop identity | Created (UTC) | Chrome Profile 2's first Mabubu visit that session |
|---|---|---|
| WNY-S7J | 18 Oct 17:57:55 | 17:57:53 |
| WR8-WYS | 18 Oct 23:35:32 | 23:35:31 |
| MCS-MH4 | 20 Oct 07:57:49 | (visits that morning) |
| THS-8GK | 21 Oct 09:19:46 | 09:18:17 (Chrome's own site record: 09:19:36) |
| EVK-NWF | 22 Oct 20:20:03 | 20:20:02 |
| UNG-RUF | 25 Oct 13:12:41 | 13:12:38 — the Mabubu storage folder was created that same second |

1. **All six laptop identities were made in the same Chrome profile**
   ("Profile 2", gmuraguri75), each on the first visit after its storage had
   gone. It is not a different profile, not Incognito/Guest (no profile has
   been created or deleted since 8 Oct), and not the installed app opening a
   different origin.
2. **The whole profile's website storage is being wiped**, not just Mabubu's:
   on 25 Oct every website's IndexedDB in Profile 2 (google.com, claude.com,
   Mabubu) was freshly created, while history and extension storage survived.
3. **Not "delete site data when Chrome closes"**: that setting is off in all 15
   Chrome profiles on the laptop, and there is no per-site rule for Mabubu.
4. **Not the app**: the app never deletes the identity, reuses it on every
   reload and restart, and shows the "storage blocked" screen (never a new
   identity) when storage cannot be read. A real defect was found and fixed —
   two tabs or two calls at the same moment could each make an identity and
   overwrite the first (`src/client/lib/device.ts`, tests in
   `tests/device-identity.test.ts`) — but each new laptop row above followed a
   full wipe, so that race was not the cause of these.

**Two explanations fit and could not be told apart** (Chrome locks its cookie
file while running): (a) someone or something running "Delete browsing data"
with *Cookies and other site data* ticked and *Browsing history* unticked;
(b) Chrome's own clean-up under low disk space — it deletes ordinary website
storage, not history, and the C: drive had only 11.7 GB (4.9 %) free (Chrome
starts evicting below about 2 GB). Two installed extensions are able to wipe
site data (Surfshark VPN, Easy Auto Refresh — both currently **disabled**; keep
them that way or exclude Mabubu). No PC-cleaning program is installed.

**Again on 25 Oct at 16:10 UTC — this time only Mabubu's storage** (checked
on the laptop the same evening, read-only):

| Identity | What happened |
|---|---|
| UNG-RUF | Last sync 16:11:09, in Profile 2 (the installed app); retired by the owner at 16:21 |
| 5YK-3GS | Born in Profile 2: its Mabubu storage folder was created at 16:10:28; a wrong code at 16:11:48, then recovery with the key at 16:14 |
| A33-8RR | Born in **Profile 13** at 16:31:54 — the owner trying "another computer"; both requests refused at 16:33 |

Only the Mabubu folder in Profile 2 was new: seven other sites' storage there
was older and survived. So it was **not** a profile-wide wipe (unlike 13:12
that day), **not** a time-range "Delete browsing data" (Google Drive and Docs
storage from 16:06 survived), **not** low-disk eviction (7.2 GB free, the app
in use), **not** an uninstall of the app (its shortcut still dates from
13:35:51), and not the app (it never deletes its device identity). What is
left is a site-specific deletion of Mabubu's data at about 16:10 — the
site-settings "Delete data" button, the page-info "Cookies and site data"
panel, or developer tools' "Clear site data". Who or what did it cannot be
told from the files.

**What changed because of it (ADR-006):** a forgotten computer no longer
forces the recovery key for ordinary use. The owner signs in with name and
code and chooses **Sign in temporarily** (nothing kept, 8 hours at most) — or
makes the computer one of their devices again with the key, or by approving
its code from another signed-in owner device. Approving the owner's phone as a
second owner device (People & devices) means the key is needed only if both
are lost.

**What helps:** keep Mabubu storage "protected" (Me → Sync → *Storage
protected from clean-up: Yes*; installed apps and frequently used sites get
it), free disk space, do not tick *Cookies and other site data* when clearing
browsing data (or clear "All time" only knowingly), and always open Mabubu in
the same Chrome profile (the installed app is tied to Profile 2). **No setting
protects against a manual or tool-driven "clear site data"** — recovery with
the key is the way back, and it never makes a second owner.

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
force an online sign-in. Since 25 Oct, when there is a connection, a code the
device does not recognise is checked by the server instead (it may be a new
code), so those attempts count towards the server lockout. A temporary sign-in
(ADR-006) uses exactly the same code check and lockout.

**Keyboard:** the code can be typed on any keyboard — the number row (by key
position, so a French AZERTY keyboard works without Shift), the numeric keypad
(NumLock on or off), Backspace (one digit), Delete (the whole code), Enter
(sends once), Escape (clear, then back). Typing in a name or note field never
feeds the code. Verified with real Windows key events in Chrome and in an app
window, and with hardware key events on the Tecno (QA §0).

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
retirement", "temporary owner sign-in…", "archived people…"),
`tests/auth-e2e.test.ts` (real store + real Worker: first setup, reload,
cleared site data, recovery, sign-out, worker on a new device),
`tests/temporary-e2e.test.ts` (temporary sign-in in memory only, reload of the
tab, sign-out with unsent records, records carried to the next temporary
sign-in, idle sign-out, archived person off the phone, new code on a phone that
remembers the old one), `tests/device-identity.test.ts`,
`tests/pin-keys.test.ts`, `tests/storage-blocked.test.ts`.

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

## 10. 26 Oct 2026 — the code typed on a laptop, and the new-computer flow

**Keyboard (reproduced, fixed).** On staging, with real Windows key events in
a real Chrome window: pressing 1, holding 2 for about 0.6 s (longer than the
keyboard's repeat delay), then 3 entered **six** digits. A careful, slow
press produced a wrong code at the server — consistent with the owner's
wrong-code entries in the production log (12:41 and 17:37 UTC on 26 Oct).
Fixed: auto-repeat is ignored on the code screen (Backspace still repeats).
The code now lives in a real field over the dots, focused on arrival on a
computer (visible ring), so the number row and the numeric keypad type into
it; clicking a keypad button keeps the focus there. On phones the field asks
for no keyboard (`inputMode="none"`), so the big keypad is the only input and
nothing arrives twice. A connection error keeps the digits; a wrong code
clears them. Delete clears the whole code, Backspace one digit, Enter signs in
once (never automatically at six digits).

**Verified (26 Oct):** staging, Chrome tab 28/28 and app window (as the
installed Windows app) 29/29, real key events; Tecno Spark 10 Pro, staging
installed app 18/18 and Chrome tab 17/17 (real taps and hardware keys, no
phone keyboard, keypad on screen with an error in en/fr/sw); production
installed app on the Tecno updated to the new version, keypad checked
without sending a code. **Not verified:** the owner's own laptop and
installed app (only the owner can sign in there).

**New computer:** see ADR-006, amendment of 26 Oct — the temporary sign-in
now carries over to other tabs, and People & devices opens view-only.

## 11. 26–27 Oct 2026 — Enter on the laptop, a new tab asking for the code

**"Enter does not work" (investigated with the production sign-in log and the
laptop's own offline cache).** The owner's laptop (`5YK-3GS`) recorded wrong
codes at 20:00:46, 20:18:24 and 20:18:32 UTC on 26 Oct — so Enter *did* send,
but the code that arrived was wrong. The fixed version had been deployed at
19:39; the laptop's installed app received it only at 20:00:10 (its offline
cache), and the page kept running the old code (the one where a digit held a
moment too long repeated) until it was reloaded: a new version waited for the
"Reload" bar, and the code screen counted as "work in progress". Fixed:
a new version found while a sign-in screen shows, or waiting when the app
comes back to a sign-in screen (signed out, locked, session ended), takes
over at once, so a code is never typed into the old version
(`src/client/lib/update.ts`, `tests/update.test.ts`). The build time now shows
at the bottom of the sign-in screen and under Me, to the minute.
Re-verified with real Windows key events on the current code, in a Chrome tab
and in an app window (17/17 each): incomplete code + Enter sends nothing;
main Enter and keypad Enter send once, exactly as typed; Enter pressed three
times sends once; a held digit counts once; Backspace corrects; a wrong code
clears and says how many tries are left; the saved-profile code screen has the
focus and unlocks with Enter. The owner then signed in on the live app with
the keyboard and Enter (a new browser, 26 Oct 20:59 UTC, code accepted at the
first try); no wrong code has been recorded on the server since 20:18.

**A pasted link asked for the code again (normal sign-in).** Cause: a normal
sign-in is saved on the device, but every page load started at the code
screen; only a temporary sign-in was shared between tabs. Decided by the owner
(26 Oct): a new tab or window of the **same browser** continues the person
signed in in another open tab, and a reload continues it within the idle time
(20 minutes, `TEMP_SIGNIN.idleMinutes`). Rules (`src/client/lib/store.ts`,
`tests/tabs-e2e.test.ts`):

| Situation | Result |
|---|---|
| Reload of the tab, used in the last 20 minutes | Same person, same page, no code |
| Link pasted into a new tab while another tab is signed in | Same person, that page, no code, no new server session |
| No tab of this browser signed in (all closed), or idle 20 minutes | Code asked, as before |
| Lock / switch person in one tab, or the idle lock | Every tab of that browser locks |
| Session ended on the server (signed out elsewhere, blocked, new code, archived) | Never continued: the first sync is refused, every tab goes to the sign-in screen, the profile says "sign in online" |
| Another browser profile, another computer | Nothing shared: its own sign-in and device approval |
| Temporary sign-in | Unchanged (ADR-006): continues in other tabs, never saved |

Nothing new is written to the computer for this: the tabs answer each other
over `BroadcastChannel` while they are open; the tab's own `sessionStorage`
keeps only who is signed in and when it was last used (no token, no code). The
device approval model is unchanged. Verified on the live app: the "new version
ready → Reload" bar reloaded into the new version still signed in, on the same
page.

**Waiting screen made two sessions.** The automatic re-check and "Check again"
at the same moment signed in twice (production log 26 Oct 21:01:41, 0.2 s
apart; the server kept the later session). Now one check at a time.

**Code change, block, unblock (live, test person).** A new code ends every
session of that person: the phone signed out at its next sync, the old code was
refused online ("4 tries left"), the new one worked. Blocking a device signed
it out at once and refused sign-in ("This device was blocked by the owner");
unblocking let the person sign in again. All recorded in the sign-in log.
