# School Theatre Manager

Software for running a school theatre program: plays and musicals with their cast, crew, pit, materials and photos; an inventory of costumes, props and set pieces; show checkouts with a full history of what was used, when and how; rentals to approved groups with condition tracking and renter ratings; printed programs with sponsors; and backups to the cloud. Each school brands it with its own name, logo and colors.

It runs on one Windows computer and opens in the web browser. No internet connection or server is needed. Schools that want several computers to share one set of records can add a **school server** on their own network (still no internet): see [School network setup](docs/INTRANET-SETUP.md).

## Installing (Windows 10 or 11)

1. Download **[School-Theatre-Manager-Setup.exe](installer/School-Theatre-Manager-Setup.exe)** from the `installer` folder (click the file, then **Download raw file**).
2. Run it. Windows may warn that the app is from an unknown publisher: click **More info → Run anyway**.
3. Setup asks for your school's name, program name, initials, motto and logo, then a director username and password.
4. Open the program from the desktop or Start menu shortcut.

Running Setup again offers **Keep everything** (update the program, keep all data and school details) or **Start fresh** (the old data is moved aside, or deleted if you choose). Uninstalling keeps your data unless you ask for it to be deleted.

Start-menu extras: **Reset Director Password** (run by a Windows administrator), **Stop** (the program keeps running in the background after you open it), and **Data folder**.

To connect a computer to the school's server: **Settings → School network → Search the school network**, or install with `School-Theatre-Manager-Setup.exe /SERVER=http://school-theatre:8417`.

Your data is in `C:\ProgramData\School Theatre Manager`. In **Settings → Backups & data**, turn on **Cloud backup** to keep a copy in a OneDrive, Google Drive or Dropbox folder, make a full backup zip, restore, or download spreadsheets.

## School server (for IT)

| Option | What to run |
| --- | --- |
| Windows Server (or any always-on Windows PC) | **[School-Theatre-Manager-Server-Setup.exe](installer/School-Theatre-Manager-Server-Setup.exe)**: asks for the PostgreSQL database, runs at start-up as a background task |
| Linux with Docker | `docker compose -f deploy/compose.yaml up -d --build` (the server, plus optional screens for web browsers) |

The records go in the school's PostgreSQL database; photos and files in a folder or share. Full steps, silent-install options, ports and troubleshooting: [docs/INTRANET-SETUP.md](docs/INTRANET-SETUP.md) (also in the Start menu as *School Network Setup (for IT)*).

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
npm run dev          # http://localhost:3000 (screens) + the server on 127.0.0.1:8419; data in apps/client/data
```

| Command | What it does |
| --- | --- |
| `npm run dev` | The server (rebuilt and restarted when its code changes) and the screens with hot reload |
| `npm run build` | Production build of the screens (`apps/client/.next/standalone`) |
| `npm run server:build` | The server and setup tool, one file each (`apps/server/dist`) |
| `npm start` | Run the production build of the screens against the server |
| `npm run typecheck` | Generates route types, then runs the TypeScript check |
| `npm run db:generate` | Create migrations (SQLite and PostgreSQL) after changing `packages/core/src/db/schema.ts` |
| `npm run db:studio` | Browse the database with Drizzle Studio |

The Windows installer is built by GitHub Actions (`.github/workflows/windows-installer.yml`) on every push to `dev` or `main`: it builds the screens and the server, bundles the matching Node.js runtime, the setup tool and the launcher, smoke-tests them, packs everything with NSIS, and commits the result to `installer/`.

## Stack

- **Next.js 16** for the screens (App Router, Cache Components: reads use `"use cache"` + `cacheTag`, writes are Server Actions that call the server and then `updateTag`)
- **Hono** for the server API; **SQLite** via **better-sqlite3** offline, **PostgreSQL** (postgres.js) on a school server, both through **Drizzle ORM**; migrations in `packages/core/drizzle/`
- **drizzle-zod** builds the validation schemas from the tables (`packages/core/src/db/validation.ts`); **react-hook-form** uses them in the browser and the server checks them again
- **shadcn/ui** (Base UI) with **next-themes** for light/dark, **lucide-react** icons, **TanStack Table** v9 for lists

## Layout

The repository is being split into a client, a server and shared code, so the server can grow
separately. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the plan and its progress.

```
apps/client/          the Next.js app (screens only; every read and write goes to the server)
  src/app/(auth)      sign-in, first-run setup, change password
  src/app/(app)       inventory, shows, rentals, renters, sponsors, settings…
  src/app/api         file downloads, exports, backups and logo, passed through from the server
  src/server          the API client, cached reads, Server Actions, sign-in cookie
  src/lib/program     program builder: rendering, printing
  tools/start.cjs     starts the offline app: the private server, then the screens
apps/server/          the server API: database, sign-in, permissions, files, backups; setup tool
packages/core/        shared: database tables, migrations, validation, default lists, passwords
installer/            Windows installers: the app (school-theatre.nsi, launcher in C#) and the server
                      package (server.nsi, server/server-task.ps1), artwork, and the built installers
deploy/               Docker Compose example for a school server
docs/                 architecture and roadmap; INTRANET-SETUP.md (the IT guide)
```

The previous Go version is on the [`go-version`](../../tree/go-version) branch.
