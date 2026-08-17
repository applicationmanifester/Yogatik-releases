# Yogatik — Desktop Releases

Public download mirror for the **Yogatik** desktop app. This repository holds
**built installers only** — no source code. The application source lives in a
private repository.

## Download

Get the latest build from the [**Releases**](../../releases/latest) page, or
from the download page at **<https://yogatik.web.app/platforms>**.

| Platform | File | Notes |
|---|---|---|
| Windows 10/11 (64-bit) | `Yogatik-Setup.exe` | Run to install. Auto-update built in. |
| macOS (Apple Silicon + Intel) | `Yogatik.dmg` | Universal build. |
| Linux | `Yogatik.AppImage` | `chmod +x` then run. |
| Linux (Debian/Ubuntu) | `Yogatik.deb` | `sudo dpkg -i Yogatik.deb` |

Prefer not to install anything? The full app also runs in the browser at
**<https://yogatik.web.app>**, and installs as a PWA via *Add to Home Screen*
on phones and tablets.

## These builds are unsigned

Code-signing certificates are not yet in place, so the operating system will
warn you the first time:

- **macOS** — right-click the app and choose **Open**, then confirm. Opening by
  double-click will be refused by Gatekeeper.
- **Windows** — SmartScreen may show *"Windows protected your PC"*. Choose
  **More info → Run anyway**.

This is expected for unsigned software and is not a sign that anything is wrong.

## Auto-update

Each release also carries `latest.yml`, `latest-mac.yml` and `.blockmap` files.
The app uses these to check for and download updates in the background — please
do not delete them from a release.

## Reporting problems

Open an issue here with your operating system, the app version, and what you
were doing. The in-app **Diagnostics** panel has a *Copy Report* button that
captures the useful details.
