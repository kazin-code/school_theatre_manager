# School Theatre Manager

Software for running a school theatre program: plays and musicals with their production team, cast, crew, pit orchestra, musical numbers, materials and photos, plus an inventory of costumes, props, furniture and set pieces, show checkouts, rentals to approved outside groups, and a permanent history of what was used, when, and how.

Any school can use it. During installation you enter your school's name, your theatre program's name, initials, a motto and your logo, and the whole program carries your branding: the sign-in screen, sidebar, browser tab, desktop shortcut, printed tags, rental agreements and exported files. It runs entirely offline on one Windows computer.

Originally built for the Alton High School Theatre program.

## ⬇️ Download and install

**[Download the installer (School-Theatre-Manager-Setup.exe)](installer/School-Theatre-Manager-Setup.exe?raw=true)** — version 2.3.0, about 4 MB

1. Click the link above. The file saves to your **Downloads** folder. (If GitHub opens a page instead, click the **Download** button ⬇ on the right.)
2. Double-click **School-Theatre-Manager-Setup.exe**.
3. If Windows says *"Windows protected your PC"*, click **More info**, then **Run anyway**.
4. Click **Yes** when Windows asks to allow changes.
5. On **Your school**, type your school's name and, if you like, your theatre program's name (e.g. "Lincoln Drama Club"), initials, a motto, and click **Browse…** to pick your logo (PNG, JPG, GIF or ICO).
6. Create the director's username and password and write them down somewhere safe. The password needs at least 8 characters, a capital letter and a special character such as `!` or `#`.
7. Open your program from the desktop shortcut (it has your logo and name) and sign in.

You need a Windows 10 or 11 computer and permission to install programs (if you don't have it, ask your school's IT department). Everything you entered can be changed later in **Settings → School & branding**, including an accent color in your school colors.

Upgrading from the Alton-only versions (*AHS Theatre Inventory* 1.0 or *AHS Theatre Application* 1.1)? Run the new installer. It replaces the old program and keeps all your data; enter your school's details when asked. Alton's logo is in [`examples/alton-high-school/logo.ico`](examples/alton-high-school/logo.ico).

## What it does

- **Current and past shows** — current productions in one list, finished ones in a **Past shows** archive grouped by year. Move a show to the archive in one click (checking in anything still out), move it back if needed, or add older productions directly. Each show can have a cover image, usually its title artwork or poster. Directors can delete a cancelled show; a backup is made first so it can be restored.
- **Programs (playbills)** — every show gets a printed program, started from a standard layout filled in from the show: cover, title page with the author credits and licensing notice from the show's **Authors & rights** (only the lines you fill in are printed), director's note, cast list with dotted leaders, musical numbers, production team and crew, sponsors and a back cover with the no-recording notice. Click any text to edit it; add, drag, duplicate or delete blocks and pages; add pictures; choose a style, paper color, border and accent color. Cast, crew and songs stay in sync with the show. Pages warn when they're too full. Print single pages (or save as PDF) or print as a booklet, with pages arranged two-up so the stack folds straight into a program. Reuse last show's program as a starting point.
- **Sponsors** — a sponsor library shared by every program: name, tier, ad size (full, half or quarter page, business card or name listing), message, amount, contact details and a logo or ad image. The Sponsors block lays them out by tier and ad size, with logos, text, or both.
- **Show details** — plays, musicals, one-acts, revues and more. Each show records its authors and rights: written by (plays), book, music and lyrics (musicals), what it's based on, other required credits, the licensing company and its exact licensing notice. Each show has a production team (Director, Assistant Director, Technical Director, Music Director, Choreographer, Stage Manager… any position you add), cast with characters and voice parts, pit orchestra with instruments, and crew. Paste lists from Excel, Google Sheets or Word, or upload a CSV.
- **Musicals** — a song list per show (act, number, title, who sings it), used as scene choices when checking out costumes.
- **Show materials and photos** — scripts, scores, rehearsal tracks, programs, schedules, design drawings (up to 200 MB each) and production photos with a cover picture.
- **Inventory** — every item gets a tag number (e.g. `COS-0042`), any number of photos (main photo, captions, full-screen viewer), category, type, era, gender, size and body measurements, color, material, quantity, storage location, condition (1–5) and value.
- **Search** — free-text search across names, keywords and descriptions, plus the show or character an item was used for; filters for category, type, era, gender, size, material, color, location, availability, status, condition, rentable, show history, and measurement ranges.
- **Show checkouts** — the school checks its own items out to a production, recording character, actor, scene or musical number, and how each piece is used. Returns record condition and alterations.
- **Rentals** — only approved renters can rent. Condition is recorded going out and coming back, with damage charges, deposits and fees. Each return gets a 1–5 star rating, averaged on the renter's profile.
- **Pull list** — set items aside while searching, then check the whole list out to a show or a rental.
- **Accounts** — director and assistant roles, strong passwords (8+ characters, a capital letter and a special character), PBKDF2-hashed, session timeouts, lockout after repeated wrong passwords, and an administrator-only password reset.
- **Backups** — automatic daily backups on the computer, plus optional cloud backup into a OneDrive / Google Drive folder after every change, with one-click restore.
- **Exports** — inventory, pieces used per show, cast & crew, musical numbers, rentals and renters as CSV files for Excel. Printable item tags, rental agreements and show pull sheets.
- **Activity log** — who added, edited, checked out or returned what.

## Running it day to day

**Reinstalling:** if the program is already set up on the computer, Setup asks whether to **keep everything** (the normal choice for updates; it reuses your saved school details and accounts without asking again) or **start fresh**. Starting fresh moves the old data to a dated folder such as `C:\ProgramData\School Theatre Manager (old data 2026-10-31 1415)`, or deletes it permanently if you tick that box, and then sets the program up as new.

Data lives in `C:\ProgramData\School Theatre Manager` (`inventory.db`, `photos\`, `showfiles\`, `branding\`, `backups\`, `config.json`). Uninstalling keeps it unless you choose to delete it.

**Moving to a new computer:** install, sign in, set the same cloud folder in Settings, and click **Restore**. Accounts, passwords and branding come back with the data.

**Forgot the director password:** Start menu → School Theatre Manager → *Reset Director Password* (asks for administrator approval and shows a temporary password).

**Using it from other computers:** tick *Share on the school network* during Setup. Other computers open `http://<this-computer's-IP>:8417`; the address is shown in Settings. Everyone still signs in.

## Setting it up for another school

Nothing in the program is tied to one school, so there's nothing to change in the code: give the school the installer and they enter their own details. To pre-fill branding without the installer (for example when deploying with IT tools), run the program once with these environment variables set:

```powershell
$env:ATI_SCHOOL  = "Lincoln High School"
$env:ATI_PROGRAM = "Lincoln Drama Club"
$env:ATI_SHORT   = "LHS"
$env:ATI_TAGLINE = "All the world's a stage"
$env:ATI_ACCENT  = "#0d2c6c"
$env:ATI_LOGO    = "C:\path\to\logo.png"
& "C:\Program Files\School Theatre Manager\SchoolTheatre.exe" --init-db
```

The product name itself is set in two places if you want to rename it: `productName` in `main.go` and `APPNAME` in `installer/school-theatre.nsi`.

## How it's built

| Piece | Details |
| --- | --- |
| Program | Go (stdlib HTTP server), one `SchoolTheatre.exe`, Windows GUI subsystem (no console window) |
| Database | SQLite via [ncruces/go-sqlite3](https://github.com/ncruces/go-sqlite3) (pure Go, no DLLs), WAL mode |
| Interface | Plain HTML/CSS/JavaScript in `web/`, embedded in the exe, opened in the default browser at `http://127.0.0.1:8417` |
| Installer | NSIS 3 script in `installer/` |

```
main.go              startup, flags (--init-db, --reset-password, --data, --network, --no-browser)
db.go                schema, default dropdown lists, query helpers
auth.go              password rules and hashing, sessions, roles, login throttling
api.go               REST API for items, renters, rentals, shows, exports, backups
media.go             item photos, show people, musical numbers, show materials and photos
branding.go          school name, program name, colors and logo (PNG/JPG/GIF/ICO → web logo + Windows icon)
cloud.go             cloud-folder backup and restore
platform_*.go        Windows helpers (browser, message boxes, data folder)
web/                 interface (index.html, app.js, app.css, default logo)
installer/           ready-to-run Setup.exe, NSIS script, manifest, installer artwork, user README
examples/            sample school logos
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

Both produce `dist/SchoolTheatre.exe` and `dist/School-Theatre-Manager-Setup-<version>.exe`. To publish a new version for download, copy the setup file to `installer/School-Theatre-Manager-Setup.exe` and commit it.

To run from source while developing (any OS):

```bash
go run . --data ./data
```

The first visit asks you to create the director account.
