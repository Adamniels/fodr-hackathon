# 0012. Frontend: React Router and TanStack Query

Status: Accepted. Date: 2026-10-16.

## Context

The app has no routing (steps are a `useState`), all state sits in `App.tsx`, and the analysis is lost on reload or leaks between horses (audit C4). With an API, the frontend needs URLs, loading and error states, caching and invalidation.

## Decision

- **React Router** (v8, library or data mode, not framework mode) gives every horse and step a URL, for example `/horses/:horseId/plan`, so reload, back and deep links work.
- **TanStack Query** (v5) owns all server state: fetching, caching, invalidation after mutations, retries. React state is only for local UI state.
- Forms validate with the shared zod schemas before submitting.
- The landing page is a public route in the same app (spec section 4).

## Alternatives

- **Keep `useState` and hand written fetching.** Every loading, error and cache case becomes custom code.
- **React Router framework mode or Next.js.** Server rendering we do not need, and a larger rewrite (ADR 0002).
- **A global store (Redux, Zustand).** Solves client state; most of our state is server state, which TanStack Query handles better.

## Consequences

- `App.tsx` splits into route components; steps load their data by URL parameters.
- E2E tests navigate by URL as well as by clicking.
- React Router 8 requires React 19.2.7 or newer; the app is on 19.3.
