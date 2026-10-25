# Open Mabubu from the desktop (Windows)

Mabubu installs as an app from the browser. The installed app is the **same**
Mabubu: same address, same account, same records, same server. Nothing is
copied to a second database and no separate program is downloaded.

## Install (once)

**Chrome**

1. Open **https://mabubu.mabubu-family.workers.dev** in Chrome.
2. Either tap **Install Mabubu** on the Overview (or under **Me → Use Mabubu
   like an app**), or use Chrome's menu **⋮ → Cast, save and share → Install
   page as app…** (older Chrome: **⋮ → Install Mabubu…**). Confirm **Install**.
3. Mabubu opens in its own window.

**Edge**

1. Open the same address in Edge.
2. Tap **Install Mabubu** in the app, or use Edge's menu **… → Apps → Install
   this site as an app**. Confirm **Install**.

The Install button in the app appears only when the browser itself offers an
install; if you do not see it, use the browser menu as above. If it is already
installed, **Me** shows "Installed — running as the app".

## Pin it

- **Taskbar:** while Mabubu is open, right-click its icon in the taskbar →
  **Pin to taskbar**.
- **Start menu:** Start → All apps → **Mabubu** → right-click → **Pin to Start**.
- **Desktop shortcut:** in Chrome, the install dialog offers "Create desktop
  shortcut"; otherwise drag Mabubu from the Start menu to the desktop.

## Use it

Open Mabubu from the taskbar, Start menu or desktop. It opens in its own window
(no address bar). Opening it again brings the open window forward instead of a
second copy. Sign in with your name and code as usual.

Signing in does **not** create a new device each time: the installed app uses
the same browser storage as the site, so the laptop stays the same approved
device. (If the browser's site data is cleared, the laptop becomes a new
device — see `AUTH_AND_RECOVERY.md` §3 and §4; your records are safe on the
server.)

## Updates

A new version arrives by itself: the app checks when it is opened online and
reloads with the new version. Records saved on the laptop but not yet sent are
kept through updates. **Me → Use Mabubu like an app** shows the version
(`0.1.0 · testing (pre-release)`) and its build date.

## Remove it

Inside the app: **⋮** (top-right of the app window) → **Uninstall Mabubu**.
Records already sent stay on the server. Records not yet sent stay in the
browser's storage, but check **Me → Sync** shows nothing waiting first.

## Is a separate Windows installer (.exe) needed?

No, not for what was asked: opening Mabubu from a desktop icon in its own
window, with the same account and records. A packaged program (Electron or
Tauri) would add code signing, its own updater and a second copy of the app to
maintain, without a requirement the installed app cannot meet today. Revisit
only if a need appears that the browser cannot serve (for example printing to a
specific receipt printer without dialogs).

## What was verified (22 Oct 2026, staging)

- Chrome's own installability check: no errors; manifest valid; app id = the
  site root (unchanged from before, so existing installs are not duplicated).
- Chrome raised its install offer, so the in-app Install button appeared.
- The app window (Chrome app mode, separate test profile) runs in standalone
  display mode, shows the saved sign-in profile, and keeps the **same device
  identity** across two launches.
- Not done by the agent: clicking the browser's own install dialog in the
  owner's Chrome profile (browser dialogs cannot be automated, and the
  owner's profile is not used for tests). The owner confirms it once.
