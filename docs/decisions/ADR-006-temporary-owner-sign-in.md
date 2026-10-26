# ADR-006 — Temporary owner sign-in on a computer that is not approved

Status: accepted 25 Oct 2026 at the owner's explicit request (master brief,
25 Oct). Implemented, tested on staging and on the Tecno; deployed to
production 25 Oct (`a32b930c`, migration 0006). Not yet used on production.

## Context

Device approval (ADR-001 §6) is the main protection of the PIN: a correct
name and code on a new device only creates a request that the owner approves.
For the owner this became a recurring dead end. The owner's laptop lost its
browser data several times (AUTH_AND_RECOVERY §3), and every time the only way
back was the paper recovery key. The owner also wants to use Mabubu from
another computer, for example in a cybercafe, without the key.

The owner asked for: name + code enough for ordinary access on another
computer; no second owner; no permanent trust from a code alone; a short,
documented session; a clear sign-out; nothing remembered on that computer;
the recovery key kept for genuine recovery.

## Options

| | A. Name + code approves the computer | B. Passkey (Windows Hello / phone lock) | **C. Temporary sign-in (chosen)** |
|---|---|---|---|
| Key needed for ordinary use | No | No | No |
| A seen code becomes permanent access | **Yes** | No | No |
| Works on a cybercafe computer | Yes (and stays approved) | Not on someone else's computer | Yes, and nothing stays |
| New security-critical code | Small | Large (CBOR/COSE, attestation) | Small, reuses sign-in |
| Cost | $0 | $0 | $0 |

A removes the device protection for the owner: a code seen over the owner's
shoulder would make the observer's computer one of the owner's devices for
good. B is still a good optional addition for the owner's own devices
(AUTH_AND_RECOVERY §5) but does not serve someone else's computer.

## Decision

- `POST /api/auth/temporary`, **owner only**. Name and code are checked by
  the same code as sign-in: the same lockout (5 → 15 min, 10 → 1 h,
  15 → 6 h, 20 → locked until recovery) and the same network limit (30 wrong
  attempts per hour). Workers and managers are refused (`owner_only`) and
  their sign-in is unchanged.
- **No device trust.** No `device_access` approval is written. The owner's own
  open request for that computer is closed (status `denied`, decided by the
  owner) so it does not sit in "Waiting for your approval". The device row is
  kept for the record, as for any device.
- **Limits** (`TEMP_SIGNIN` in `src/shared/api.ts`, enforced by the server):
  fixed end 8 hours after signing in, never extended by use; ended by the
  server after 30 minutes without any request; the app signs out after
  20 minutes without a touch or key press; at most 3 at once (a fourth ends
  the oldest); one per computer (signing in again replaces it). It also ends on
  Sign out, when the owner signs it out from People & devices, when the
  computer is blocked or retired, when the owner's code is changed, and on
  archiving.
- **No owner-only rights**: `users.manage` and `settings.manage` are removed
  from the session. So People & devices, approvals, codes, settings, the backup
  download and go live are refused by the server; they stay on the owner's
  own devices. Everything else the owner does with the business records works.
- **Nothing kept on the computer.** The app keeps the records of a temporary
  sign-in in memory (`MemoryRecordsDb`), saves no profile and no offline code
  check, and keeps the session token only in the tab's session storage, so a
  reload of the tab keeps it and closing the tab forgets it. Records not yet
  sent stay in the page: the app refuses to sign out without a confirmation,
  the browser asks before the tab is closed, and if the session ends they are
  sent once by the next temporary sign-in in that page.
- **Visible to the owner.** People & devices lists temporary sign-ins (live
  ones with Sign out). The sign-in log records `login_temporary`,
  `temporary_ended`, `temporary_replaced`, `temporary_refused`, and `logout`
  with `{temporary: true}`.
- **Owner's own refused computer.** A request the owner refused for
  themselves is opened again at their next sign-in there, so the owner never
  meets "not allowed" with no way out. Workers and managers stay refused.
- The recovery key is unchanged: it remains the way to make a computer one of
  the owner's devices, and never creates a second owner. Approving the request
  from another signed-in owner device does the same without the key.

## Security consequences (accepted by the owner)

- Guessing the code online is bounded: 20 wrong attempts on the account lock
  it until recovery, and a network is held back after 30 per hour. A 6-digit
  code (the owner minimum) gives at most a 20-in-1,000,000 chance before the
  hard lock.
- **A code seen by someone else is now enough to read and record business
  data for up to 8 hours** (not to approve devices, add people, change codes
  or go live). Mitigations: the owner sees every temporary sign-in and can end
  it; changing the code ends them all; the owner should use a 7–8 digit code
  and cover the keypad in public. This is the trade-off the owner chose.
- Cancelling records (`corrections`) stays possible in a temporary sign-in;
  history is never deleted, so a wrong cancellation is visible and the record
  can be re-entered.

## Consequences

- Migration `0006_temporary_sessions.sql` adds `sessions.temporary` (default 0).
  A Worker older than `a32b930c` ignores the column and refuses a temporary
  session (no device approval behind it), which is the safe direction for a
  rollback.
- New screens: the owner's new-computer choice ("Sign in temporarily" / "Make
  it one of my devices"), the temporary ribbon, Sign out on Me, the temporary
  list in People & devices. Text in en/fr/sw (not yet reviewed by a native
  speaker, LANGUAGE_REVIEW §7).
- Tests: `tests/worker.test.ts` ("temporary owner sign-in…", 10 tests),
  `tests/temporary-e2e.test.ts` (real app store + real Worker), plus the
  desktop and app-window runs recorded in QA_AND_RELEASE_READINESS §0.
