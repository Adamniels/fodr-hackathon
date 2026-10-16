# 0003. npm workspaces monorepo

Status: Accepted. Date: 2026-10-16.

## Context

Today everything is one Vite package in `app/`, with server code compiled by the frontend toolchain and client and server contracts duplicated by hand (audit section 4). With a real API, the calculation engine and the contracts must be shared by browser and server.

## Decision

The repository becomes an **npm workspaces** monorepo:

```
apps/web            React SPA (today's app/src without domain/)
apps/api            Hono API (ADR 0002)
packages/domain     pure calculation engine (today's app/src/domain), ADR 0004
packages/contracts  zod schemas for API requests and responses, ADR 0007
```

Dependencies point inwards only: `apps/*` may import `packages/*`; `packages/contracts` may import `packages/domain` types; `packages/domain` imports nothing from the others. Each package has its own `package.json`, `tsconfig` and tests; the root runs them all. No build orchestrator (Turborepo, Nx) until build times call for one.

## Alternatives

- **Keep a single `app/` package.** Less restructuring now, but browser and server keep sharing one build and one dependency set, and the boundary between them stays a convention.
- **Separate repositories.** Shared code would need publishing; too much overhead for two people.
- **pnpm workspaces or Turborepo.** Better at scale; npm is what the team already uses and suffices here.

## Consequences

- The move from `app/` is a pure refactor and gets its own PRs, with the M0 e2e suite as the safety net.
- CI and the `.claude/CLAUDE.md` commands change to run from the root.
- Package boundaries are enforced by lint rules, not only by convention.
