# School Theatre Manager

Software for running a school theatre program: shows and musicals with their cast, crew and materials, an inventory of costumes, props and set pieces, show checkouts, rentals to approved groups, and printed programs. Each school brands it with its own name, logo and colors.

> **Version 3 is being rebuilt** on Next.js, Drizzle and shadcn/ui. The previous Go version, with its ready-to-run Windows installer, is on the [`go-version`](../../tree/go-version) branch.

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
| `npm run typecheck` | TypeScript check |
| `npm run db:generate` | Create a migration after changing `src/db/schema.ts` |
| `npm run db:studio` | Browse the database with Drizzle Studio |

## Stack

- **Next.js 16** (App Router, Cache Components: reads use `"use cache"` + `cacheTag`, writes are Server Actions that call `updateTag`)
- **SQLite** via **better-sqlite3**, accessed with **Drizzle ORM**; migrations in `drizzle/`
- **drizzle-zod** builds the validation schemas from the tables (`src/db/validation.ts`); **react-hook-form** uses them in the browser and the Server Actions check them again
- **shadcn/ui** (Base UI) with **next-themes** for light/dark, **lucide-react** icons, **TanStack Table** for lists
