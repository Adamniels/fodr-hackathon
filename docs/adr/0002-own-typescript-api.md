# 0002. Own TypeScript API (Hono) instead of a backend-as-a-service

Status: Accepted. Date: 2026-10-16.

## Context

The PoC has no backend outside the Vite dev server (audit section 1). The spec requires real accounts, server side persistence, request validation, per user AI quotas, reproducible plans and a typed error model, on about 300 SEK per month **including AI calls**, with all data in the EU.

## Decision

We build our own HTTP API in TypeScript with **Hono** (4.13.x) on Node (`@hono/node-server` 2.x), backed by Postgres. The API owns validation, authorization, quotas, plan calculation for saved plans and all calls to the Anthropic API.

## Alternatives

- **Supabase** (Postgres, Auth, Storage, Edge Functions). Least own code. Rejected because Pro costs $25 per month (about 275 SEK), leaving almost nothing for AI, while the Free tier pauses projects after a week of inactivity and has no backups (checked 2026-10-16). Server logic would also be split between Row Level Security policies and Deno functions.
- **Full stack framework** (Next.js, React Router framework mode). Would require rewriting the frontend around server rendering, which the app does not need.
- **Express or Fastify.** Both viable; Hono is smaller, typed end to end, uses web standard Request and Response, and runs on any Node host.

## Consequences

- More code we own and maintain, in exchange for one codebase where the rules live.
- Portable: nothing ties us to a provider (see ADR 0005).
- The API must be run locally during development (ADR 0006), replacing the Vite middleware in `app/server/apiPlugin.ts`.

## Notes

- 2026-10-21 (#19): `apps/api` runs TypeScript with `tsx` in development and as an esbuild bundle (`dist/main.mjs`) in production, because Node's built-in type stripping cannot load `packages/domain`'s extensionless imports. `GET /api/v1/health` is a liveness check that does not touch the database, so a host's polling neither keeps a scale-to-zero Postgres awake nor restarts the app when only the database is down; a readiness check can be added with the host in M5 (ADR 0005). In development Vite proxies `/api/v1` to the API; in production the API serves the built web app on the same origin (owner).
