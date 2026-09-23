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

## Structure

- `apps/mobile` — Expo Router React Native app
- `apps/api` — Hono Cloudflare Worker
- `packages/shared` — framework-independent shared types
- `packages/config` — reusable design tokens
- `docs` — project documentation
