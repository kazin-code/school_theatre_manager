# Architecture and roadmap

School Theatre Manager is moving from one combined Next.js app to three parts in one repository, so the
server can grow (more security, more features, more users) without touching the screens.

## Target layout

```
packages/core/   shared by everything: database tables (SQLite + PostgreSQL), migrations,
                 validation (drizzle-zod), business rules, types, password hashing
apps/server/     the server: an HTTP API (Hono) that owns the database, sign-in, permissions,
                 photos/files and backups. No screens. Stateless, so it can run as several copies.
apps/client/     the Next.js app (screens only). Gets all data from a server's API.
installer/       Windows client installer (client + private server), Windows Server package
docs/            this file, the IT setup guide, API notes
```

## How the modes map

| Mode | Client | Server | Database | Files |
| --- | --- | --- | --- | --- |
| **Offline** (default) | installed on the PC | same server code, private to the PC (127.0.0.1) | SQLite (better-sqlite3) in `C:\ProgramData\School Theatre Manager` | data folder |
| **Intranet** | installed on classroom PCs, or a browser if IT also hosts the client | Windows Server service or Docker/Linux | PostgreSQL on IT's database server | folder/share IT chooses |

The client never talks to a database. Offline it talks to its private server; on the intranet it talks
to the school's server. Classroom computers work offline by default and switch to the intranet server
when they find it (UDP broadcast on 8418, the `school-theatre` network name, or a typed address).
Nothing requires the internet.

## Framework (from the project owner)

- Next.js App Router with cached components (client)
- Drizzle ORM, strongly typed tables; drizzle-zod schemas built from the tables
- SQLite with better-sqlite3 (offline); PostgreSQL for the intranet, on a database server outside the app
- react-hook-form with zod resolvers for every form
- shadcn/ui (Base UI) with next-themes; lucide-react icons; TanStack Table
- Added for the server: Hono (small typed HTTP framework, works with the same zod schemas);
  postgres.js driver for PostgreSQL

## Stages

1. **Split the repo** into `apps/client`, `packages/core`, `apps/server` with no change in behavior.
   One root `package.json` for now; the client imports core through the `@stm/core/*` path alias.
2. **Server API**: Hono app in `apps/server` using core; SQLite first, then PostgreSQL
   (`packages/core` gets a PostgreSQL schema with the same tables, columns and TypeScript types, and its
   own migrations). Every query is written with async Drizzle calls that work on both drivers. Writes on
   SQLite are serialized (one connection). Endpoints mirror today's server actions.
3. **Client on the API**: replace direct database access in `apps/client/src/server/*` with calls to
   the API, screen by screen. Server Actions stay as thin calls to the API; cached reads keep their
   cache tags.
4. **Packaging**: offline installer = client + private server; lightweight Windows Server package (no
   screens, runs at boot, PostgreSQL settings from a file readable by administrators only);
   Docker image; school-network search/connect page; IT setup guide (`docs/INTRANET-SETUP.md`).

## Status

- [x] Version 3 app (inventory, shows, rentals, programs, sponsors, backups, Windows installer)
- [x] tweakcn theme
- [x] School network groundwork (`apps/client/src/server/network.ts`, `/api/server-info`)
- [x] Stage 1: split the repo (one root package.json; `@stm/core/*` alias; Next.js `turbopack.root` and `outputFileTracingRoot` at the repo root, so the standalone build keeps the layout: `apps/client/server.js`)
- [ ] Stage 2: server API (SQLite, then PostgreSQL)
- [ ] Stage 3: client on the API
- [ ] Stage 4: packaging, intranet connect, IT guide

## Notes for whoever continues

- `npm` installs don't work in the sandboxed build agent; GitHub Actions does. A local PostgreSQL 16 can
  be started for tests (see `docs/DEVELOPING.md` once written).
- Browser tests used during development drive the real app with Playwright (setup, inventory, shows,
  rentals, program builder, backups). Port them into the repo when the API lands.
- The Windows installer is built and smoke-tested by `.github/workflows/windows-installer.yml`.
