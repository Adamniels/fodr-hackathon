# 0013. Error model: problem+json with stable codes

Status: Accepted. Date: 2026-10-16.

## Context

Errors today are `{ fel: string }` with raw exception messages, invalid JSON becomes a 500, the domain throws plain `Error`s with Swedish text, and invalid input silently produces plans (audit C1 to C3, section 5).

## Decision

- **API errors** use `application/problem+json` (RFC 9457) with a stable machine readable `code`, for example `{ type, title, status, code: "analysis.not_a_feed_analysis", errors?: [{ path, code }] }`.
  - 400 for validation errors, with field paths from zod
  - 401 unauthenticated, 404 not found or not yours (ADR 0010), 409 conflicts, 429 quota or rate limit
  - 502 or 503 when the AI provider fails
  - 500 for anything unexpected, with only a request ID, never an internal message
- **The domain does not throw for expected outcomes.** It returns typed results, for example `{ ok: false, code: "plan.infeasible", nutrient: "se" }`, which fixes C3 by making "infeasible" a value the UI must handle.
- **The web app** maps codes to translated messages (ADR 0014), shows field errors next to fields, and wraps each route in an error boundary.

## Alternatives

- **Free text errors.** Cannot be translated, tested or handled differently by the UI.
- **Exceptions in the domain.** Easy to forget to catch; expected outcomes are not exceptional.

## Consequences

- Error codes become part of the contracts in `packages/contracts` and are tested like any other output.
- Unexpected errors are logged with the request ID (ADR 0015), so a user report can be traced.
