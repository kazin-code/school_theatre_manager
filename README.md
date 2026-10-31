# AHS Theatre Inventory

Inventory system for the Alton High School Theatre program: costumes, props, furniture, set pieces and materials, with show checkouts, rentals to approved outside groups, and a permanent history of what was used, when, and how.

It runs entirely offline on one Windows computer. A single installer sets up the program, the database, the director's account and the shortcuts.

## ⬇️ Download and install

**[Download the installer (AHS-Theatre-Inventory-Setup.exe)](download/AHS-Theatre-Inventory-Setup.exe?raw=true)** — version 1.0.0, about 4 MB

1. Click the link above. The file saves to your **Downloads** folder. (If GitHub opens a page instead, click the **Download** button ⬇ on the right.)
2. Double-click **AHS-Theatre-Inventory-Setup.exe**.
3. If Windows says *"Windows protected your PC"*, click **More info**, then **Run anyway**.
4. Click **Yes** when Windows asks to allow changes.
5. Follow the steps. When asked, create the director's username and password and write them down somewhere safe.
6. Open **AHS Theatre Inventory** from the desktop shortcut and sign in.

You need a Windows 10 or 11 computer and permission to install programs (if you don't have it, ask your school's IT department).

## What it does

- **Inventory** — every item gets a tag number (e.g. `COS-0042`), photo, category, type, era, gender, size and body measurements, color, material, quantity, storage location, condition (1–5) and value.
- **Search** — free-text search across names, keywords and descriptions, plus the show or character an item was used for; filters for category, type, era, gender, size, material, color, location, availability, status, condition, rentable, show history, and measurement ranges (chest, waist, hips, inseam).
- **Show checkouts** — the school checks its own items out to a production, recording character, actor, scene and how each piece is used. Returns record condition and alterations. Every past show keeps its full record.
- **Rentals** — only approved renters can rent. Condition is recorded going out and coming back, with damage charges, deposits and fees. Each return gets a 1–5 star rating (with a suggestion based on condition loss, lateness and damage), averaged on the renter's profile.
- **Pull list** — set items aside while searching, then check the whole list out to a show or a rental.
- **Item history** — each item shows every show it was in, every rental, and a condition log.
- **Accounts** — director and assistant roles, PBKDF2-hashed passwords, session timeouts, lockout after repeated wrong passwords, and an administrator-only password reset.
- **Backups** — automatic daily backups on the computer, plus optional cloud backup into a OneDrive / Google Drive folder after every change, with one-click restore.
- **Exports** — inventory, shows, rentals and renters as CSV files for Excel. Printable item tags, rental agreements and show pull sheets.
- **Activity log** — who added, edited, checked out or returned what.

## Installing (for the theatre)

1. Run `AHS-Theatre-Inventory-Setup-<version>.exe` (needs 64-bit Windows 10 or 11 and administrator rights).
2. Create the director account when Setup asks.
3. Open **AHS Theatre Inventory** from the desktop or Start menu and sign in.
4. In **Settings → Cloud backup**, choose the school OneDrive or Google Drive folder.

Data lives in `C:\ProgramData\AHS Theatre Inventory` (`inventory.db`, `photos\`, `backups\`, `config.json`). Uninstalling keeps it unless you choose to delete it.

**Moving to a new computer:** install, sign in, set the same cloud folder in Settings, and click **Restore**. Accounts and passwords come back with the data.

**Forgot the director password:** Start menu → AHS Theatre Inventory → *Reset Director Password* (asks for administrator approval and shows a temporary password).

**Using it from other computers:** tick *Share on the school network* during Setup. Other computers open `http://<this-computer's-IP>:8417`; the address is shown in Settings. Everyone still signs in.

## How it's built

| Piece | Details |
| --- | --- |
| Program | Go (stdlib HTTP server), one `TheatreInventory.exe`, Windows GUI subsystem (no console window) |
| Database | SQLite via [ncruces/go-sqlite3](https://github.com/ncruces/go-sqlite3) (pure Go, no DLLs), WAL mode |
| Interface | Plain HTML/CSS/JavaScript in `web/`, embedded in the exe, opened in the default browser at `http://127.0.0.1:8417` |
| Installer | NSIS 3 script in `installer/` |

```
main.go              startup, flags (--init-db, --reset-password, --data, --network, --no-browser)
db.go                schema, default dropdown lists, query helpers
auth.go              password hashing, sessions, roles, login throttling
api.go               REST API for items, renters, rentals, shows, exports, backups
cloud.go             cloud-folder backup and restore
platform_*.go        Windows helpers (browser, message boxes, data folder)
web/                 interface (index.html, app.js, app.css, logo)
installer/           NSIS script, manifest, installer artwork, user README
build.sh / build.ps1 build the exe and the installer
```

## Building

Requirements: Go 1.24+, [NSIS 3](https://nsis.sourceforge.io/), and `rsrc` for the icon (`go install github.com/akavel/rsrc@v0.10.2`).

```powershell
# Windows
.\build.ps1
```

```bash
# Linux / macOS (cross-compiles; set MAKENSIS if makensis isn't on PATH)
./build.sh
```

Both produce `dist/TheatreInventory.exe` and `dist/AHS-Theatre-Inventory-Setup-<version>.exe`. To publish a new version for download, copy the setup file to `download/AHS-Theatre-Inventory-Setup.exe` and commit it.

To run from source while developing (any OS):

```bash
go run . --data ./data
```

The first visit asks you to create the director account.
