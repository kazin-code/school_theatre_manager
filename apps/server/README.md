# School Theatre Manager server

The HTTP API that owns the data: sign-in, permissions, inventory, shows, rentals, sponsors, programs,
photos and files, backups and spreadsheet exports. No screens. Built with [Hono](https://hono.dev) and
Drizzle, on **SQLite** (offline, one file) or **PostgreSQL** (a school's database server).

```bash
npm run server:build                 # → apps/server/dist/server.cjs and stm-tool.cjs (need better-sqlite3 beside them)
STM_DATA_DIR=./data node apps/server/dist/server.cjs
STM_DATABASE_URL=postgres://theatre:secret@dbserver:5432/theatre STM_DATA_DIR=/srv/stm node apps/server/dist/server.cjs
node apps/server/test/api-test.mjs http://127.0.0.1:8417   # end-to-end test (use an empty database)
```

Settings (environment variables, or `server.json` in the data folder): see `src/config.ts`.

| Setting | Meaning |
| --- | --- |
| `STM_DATA_DIR` | data folder (SQLite database, backups, settings) |
| `STM_DATABASE_URL` | `postgres://…`: use PostgreSQL instead of SQLite |
| `STM_DATABASE_SSL` | `require` for an encrypted database connection |
| `STM_FILES_DIR` | where photos and files go (default: the data folder; can be a network share) |
| `PORT`, `HOST` | default `8417` on `127.0.0.1`; `HOST=0.0.0.0` to serve the school network |
| `STM_DISCOVERY` | `0` to stop answering school-network searches (UDP 8418) |

## Layout

```
src/index.ts        start the server; embed it with startServer(), or in a worker thread
                    (workerData { stmEmbedded: true, overrides }: posts { url } when listening)
src/tool.ts         setup tool: init, reset-password, network (→ dist/stm-tool.cjs)
src/types.ts        response types for clients (import type only)
src/app.ts          routes under /api/v1 (sign-in checks, errors)
src/services/*      business logic, one file per area
src/db.ts           SQLite / PostgreSQL connection, migrations, portable SQL helpers
src/files.ts        photo and file storage
test/api-test.mjs   end-to-end test
```

Routes: `GET /api/v1/ping`, `/server-info`, `/branding`, `/revision` (changes after every change to the
data; every response also carries it as `X-STM-Revision`); `POST /auth/setup|login|logout|password`; then
`/items`, `/shows`, `/renters`, `/rentals`, `/sponsors`, `/shows/:id/program`, `/files/:kind/:name`,
`/exports/:what`, `/backups`, `/users`, `/lists`, `/activity`, `/dashboard` (see `src/app.ts`).
