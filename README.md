# FamilyApp

Initial technical foundation for a mobile-first family platform.

## Prerequisites

- Node.js 20+
- pnpm 9+ (`corepack enable` or `npm install --global pnpm`)
- Expo Go or an Android/iOS development environment for device testing

## Getting started

```bash
pnpm install
pnpm dev:mobile
pnpm dev:api
pnpm typecheck
```

The mobile app runs through Expo; the API runs locally through Wrangler at `http://localhost:8787` and exposes `GET /health`.

## Database

Copy `packages/db/.env.example` to `packages/db/.env` or otherwise provide `DATABASE_URL` in the shell running database commands. Keep this server-side; never expose it to the mobile app.

```bash
pnpm db:generate
pnpm db:migrate
```

`db:generate` creates SQL migrations from the Drizzle schema without connecting to a database. `db:migrate` requires an explicit `DATABASE_URL`.

For local authentication, copy `apps/api/.dev.vars.example` to `apps/api/.dev.vars` and set a random `BETTER_AUTH_SECRET` plus the server-side `DATABASE_URL`. Copy `apps/mobile/.env.example` to `apps/mobile/.env.local` and set the reachable API origin for the device or browser. The mobile environment must never contain database credentials or auth secrets.

Better Auth handles `/api/auth/*`; authenticated server routes use the session middleware, including `GET /me`.

## Structure

- `packages/db` — PostgreSQL schema, migrations, and Neon/Drizzle client

- `apps/mobile` — Expo Router React Native app
- `apps/api` — Hono Cloudflare Worker
- `packages/shared` — framework-independent shared types
- `packages/config` — reusable design tokens
- `docs` — project documentation
