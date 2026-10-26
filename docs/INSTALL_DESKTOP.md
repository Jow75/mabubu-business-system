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

A new version arrives by itself: the app checks when it is opened online, when
it comes back on screen (at most every 10 minutes) and every hour while it
stays open. If it is in the background it switches at once; if you are using
it, a bar says **A new version of Mabubu is ready** with **Reload**, and it
also switches by itself the next time you leave the app with nothing half
typed (a code, a form or an open sheet). Records saved on the laptop but not
yet sent are kept through updates. **Me → Use Mabubu like an app** shows the
version (`0.1.0 · testing (pre-release)`) and its build date.

## On a computer that is not yours (owner only)

In a cybercafe, on a family member's computer, or on your own laptop after it
forgot you: open the address in the browser — **do not install** — type your
name and code, and choose **Sign in temporarily**. Nothing is kept on that
computer (no saved name, no records), a ribbon shows when it ends, and you are
signed out when you press **Sign out**, after 20 minutes without use, or after
8 hours at most. People & devices, Settings and go live are only on your own
devices. If you forgot to sign out, open People & devices on your laptop or
phone: **Temporary sign-ins on other computers → Sign out**. If you do not
recognise one there, sign it out and change your code.

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

## Keep the laptop recognised (25 Oct 2026)

- The installed app belongs to one Chrome profile (on the owner laptop:
  Profile 2, gmuraguri75). Open Mabubu only from that app or that profile —
  another profile is another browser and needs approval again.
- Installing makes Mabubu quicker to open and makes Chrome more willing to
  protect its storage; it does **not** survive "Delete browsing data" with
  *Cookies and other site data* ticked, or Chrome's clean-up when the disk is
  almost full. Keep free space on C:. Me → Sync shows *Storage protected from
  clean-up*.
- If the laptop is not recognised: sign in with your name and code. For the
  day, **Sign in temporarily** is enough (no key). To make it your device
  again, approve its code from your phone (People & devices) or use **Allow
  this device with my recovery key**; then retire the old identity.

## Phones (Android)

After signing in, Mabubu offers **Install Mabubu on this phone**. If Chrome
offers its own install, the button opens it; otherwise **How to install**
shows the steps (Chrome ⋮ → Install app / Add to Home screen). **Later** hides
the offer on that phone; the same help stays under Me. On the owner's Tecno
(Chrome 155) Chrome offered the real install prompt (25 Oct, staging).

## New name and icon (26 Oct 2026)

The app is now **NAS Mabubu System** with the owner's logo. The installed
app keeps its identity (same address and id), so it is not installed twice.
How the installed name and icon change:

- **Windows (Chrome / Edge):** the browser reads the new manifest the next
  time the app is opened online and then updates the Start-menu and taskbar
  icon and name — sometimes silently, sometimes with an "App update" box to
  accept. If an old icon stays after a few days, unpin it, open the app once,
  and pin it again; uninstalling and reinstalling also works (records are on
  the server; this computer must still be one of the owner's devices).
- **Android (Chrome): the icon does not change by itself.** Found on the
  Tecno on 27 Oct: Chrome offered only "Review name update" (Mabubu → NAS
  Mabubu) and kept the old garment icon on both sides of its dialog — current
  Chrome does not swap an installed app's icon for a very different one. The
  way to the new icon is to **reinstall**: Settings → Apps → *Mabubu* →
  Uninstall (or long-press the icon → Uninstall), choose **Keep data** if
  Chrome asks, then open the address in Chrome → ⋮ → **Install and create
  shortcut** → Install. The site data stays in Chrome, so the phone keeps its
  approval and the people saved on it; first check under Me that nothing is
  waiting to send.

Verified 27 Oct on the Tecno: the old app (`org.chromium.webapk.a7dd751d874a1ac0b_v2`,
installed 18 Oct) was uninstalled after checking 0 unsent records, the new one
(`org.chromium.webapk.ad067deb343d95c86_v2`) installed from the live address:
the launcher search shows **NAS Mabubu** with the NAS logo, the app opens in its
own window, same device `YB7-EN2`, Jijo 2's profile and records unchanged. The
staging app (`…a56590860e5e85bd5_v2`) and its 2.4 MB of site data were removed.
Other family phones and installed laptops with the old icon need the same
reinstall (Windows: see above).
