# School Theatre Manager: notes for Claude

Read `docs/ARCHITECTURE.md` first: it has the target layout (client / server / core), the stages and
what's done. Keep its Status list up to date when a stage lands.

- The Next.js app is in `apps/client`. Its `AGENTS.md` applies: this Next.js version differs from what
  you know; read `node_modules/next/dist/docs/` before writing Next.js code.
- Shared database tables, validation and rules live in `packages/core` (imported as `@stm/core/*`).
- Offline mode (SQLite) must keep working at every step; the intranet server (PostgreSQL) is additive.
- Users are non-technical (theatre directors); keep wording in the app plain and friendly.
- Before pushing: `npm run typecheck`, `npm run build`, and exercise the changed screens in a browser.
- The Windows installer rebuilds on every push to `dev`/`main`.
