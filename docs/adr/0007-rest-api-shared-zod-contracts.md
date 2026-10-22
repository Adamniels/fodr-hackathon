# 0007. REST API with shared zod contracts

Status: Accepted. Date: 2026-10-16.

## Context

Today the client trusts `res.json()` with a type cast, the server does not validate bodies, and the AI response shapes are duplicated by hand on both sides (audit sections 4 and 5).

## Decision

- The API is **REST over JSON** under `/api/v1`, with resource oriented routes (for example `GET /api/v1/horses`, `POST /api/v1/horses/:id/analyses`).
- Every request and response body is defined once as a **zod schema** (zod 4) in `packages/contracts`.
- The API validates every request with these schemas (`@hono/zod-validator`) before any handler logic runs.
- The web app calls the API through a small typed client of our own that **parses every response with the same schema**, so a contract drift fails loudly instead of rendering wrong data.
- Breaking changes to a contract go to a new route version; additive changes do not.

## Alternatives

- **Hono RPC client (`hc`).** End to end types without our own client, but types only (no runtime check of responses), sensitive to mismatched Hono versions on client and server, and documented to slow down type checking with many routes.
- **tRPC.** Strong types, but couples client and server tightly and is not plain REST for other consumers.
- **OpenAPI first with code generation.** More tooling than two people need now; OpenAPI can be generated from the zod schemas later if an external consumer appears.

## Consequences

- One place to change a contract; both ends fail to compile or fail at runtime when they drift.
- The AI fixtures in `app/e2e/fixtures/ai.ts` are typed against these contracts once they move.
- A thin typed client is code we own; it stays small (request, parse, map errors per ADR 0013).

## Notes

- 2026-10-21 (#24): requests are validated with a small helper of our own (`apps/api/src/validation.ts`: parse with the contract, else a problem+json 400 with each field's path and zod's issue code) rather than `@hono/zod-validator`, which would be a dependency for about fifteen lines.
- 2026-10-22 (#27): a saved plan's envelope (IDs, versions, date) is validated field by field, but the plan itself, the inputs it was computed from and the catalogue's products are typed as the domain's types (`z.custom`) rather than mirrored in zod (owner). Web and API ship from one build, so they cannot drift. A stored plan is a record of the past: validating its inputs against today's schemas would refuse or strip an older plan once the profile changes shape, so each plan names the engine version that computed it instead, for a later engine to recognise an older plan's shape.
