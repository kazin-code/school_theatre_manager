# School Theatre Manager

Software for running a school theatre program: plays and musicals with their cast, crew, pit, materials and photos; an inventory of costumes, props and set pieces; show checkouts with a full history of what was used, when and how; rentals to approved groups with condition tracking and renter ratings; printed programs with sponsors; and backups to the cloud. Each school brands it with its own name, logo and colors.

It runs on one Windows computer and opens in the web browser. No internet connection or server is needed.

## Installing (Windows 10 or 11)

1. Download **[School-Theatre-Manager-Setup.exe](installer/School-Theatre-Manager-Setup.exe)** from the `installer` folder (click the file, then **Download raw file**).
2. Run it. Windows may warn that the app is from an unknown publisher: click **More info → Run anyway**.
3. Setup asks for your school's name, program name, initials, motto and logo, then a director username and password.
4. Open the program from the desktop or Start menu shortcut.

Running Setup again offers **Keep everything** (update the program, keep all data and school details) or **Start fresh** (the old data is moved aside, or deleted if you choose). Uninstalling keeps your data unless you ask for it to be deleted.

Start-menu extras: **Reset Director Password** (run by a Windows administrator), **Stop** (the program keeps running in the background after you open it), and **Data folder**.

Your data is in `C:\ProgramData\School Theatre Manager`. In **Settings → Backups & data**, turn on **Cloud backup** to keep a copy in a OneDrive, Google Drive or Dropbox folder, make a full backup zip, restore, or download spreadsheets.

## What it does

| Area | Highlights |
| --- | --- |
| **Inventory** | Photos (several per item), tags, sizes and measurements, era, gender, material, color, location, condition history, value. Search by any word, filter by every field and measurement ranges, grid or list view, pull list, printable tags. |
| **Shows** | Plays and musicals; cast, production team (director, assistant/technical/music directors and any position you add), pit and crew with paste-a-list import; musical numbers; authors & rights; materials (any file); photos; cover picture. Check costumes and props out by character, actor and scene, return them with their condition, move shows to Past shows, reopen, or delete a cancelled show. |
| **Rentals** | Approved renters, condition out and back for every piece, damage charges, send-to-repair, a 1–5 renter rating with a suggestion, deposits, overdue list, printable agreement. |
| **Programs** | A standard program built from the show (cover, title page, director's note, cast, songs, team & crew, sponsors, back cover) that you can edit like a simple Canva: text, pictures, blocks, pages, styles, paper, borders, colors. Author credits and licensing print only when filled in. Print single pages or a folded booklet. |
| **Sponsors** | Logos or ads, tiers, ad sizes, messages, amounts; shared by every program. |
| **People & safety** | Director and assistant accounts with strong passwords (8+ characters, a capital letter and a special character), activity log, daily automatic database copies, safety copies before risky changes. |

## Developing

Requires Node.js 22 or newer (npm comes with it).

```bash
npm install
npm run dev          # http://localhost:3000 — data is stored in ./data
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server with hot reload |
| `npm run build` | Production build (`.next/standalone` is what the installer ships) |
| `npm run typecheck` | Generates route types, then runs the TypeScript check |
| `npm run db:generate` | Create a migration after changing `src/db/schema.ts` |
| `npm run db:studio` | Browse the database with Drizzle Studio |

The Windows installer is built by GitHub Actions (`.github/workflows/windows-installer.yml`) on every push to `dev` or `main`: it builds the app, bundles the matching Node.js runtime, the setup tool and the launcher, smoke-tests them, packs everything with NSIS, and commits the result to `installer/`.

## Stack

- **Next.js 16** (App Router, Cache Components: reads use `"use cache"` + `cacheTag`, writes are Server Actions that call `updateTag`)
- **SQLite** via **better-sqlite3**, accessed with **Drizzle ORM**; migrations in `drizzle/`
- **drizzle-zod** builds the validation schemas from the tables (`src/db/validation.ts`); **react-hook-form** uses them in the browser and the Server Actions check them again
- **shadcn/ui** (Base UI) with **next-themes** for light/dark, **lucide-react** icons, **TanStack Table** v9 for lists

Moving to another database later means swapping the Drizzle dialect and driver in `src/db/`; the tables, types and validation schemas stay the same.

## Layout

```
src/app/(auth)        sign-in, first-run setup, change password
src/app/(app)         the app: inventory, shows, rentals, renters, sponsors, settings…
src/app/api           file downloads, exports, backups, logo, health check
src/db                schema, validation (drizzle-zod), seeding, connection
src/server            queries (cached), actions (Server Actions), auth, backups, files
src/lib/program       program builder: document model, rendering, printing
tools/                setup tool (database, director account, password reset) and server starter
installer/            NSIS script, launcher (C#), artwork, and the built installer
```

The previous Go version is on the [`go-version`](../../tree/go-version) branch.
