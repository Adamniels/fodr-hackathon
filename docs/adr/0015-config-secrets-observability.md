# 0015. Configuration, secrets and observability

Status: Accepted. Date: 2026-10-16.

## Context

Configuration today is one `ANTHROPIC_API_KEY` read in `vite.config.ts`; the model name is hardcoded (audit M10); there are no logs, error tracking or record of AI cost (audit section 5).

## Decision

**Configuration.** All configuration comes from environment variables, parsed by a zod schema at API startup; the process refuses to start if something required is missing or invalid. `.env.example` lists every variable without values. The AI model, token limits and per user quotas are configuration, not code. Only values meant to be public may use the `VITE_` prefix.

**Secrets.** Local secrets live in git ignored `.env` files. Deployed secrets live in the host's secret store and in GitHub Actions secrets. Secrets are never logged, never sent to the browser and never committed.

**Observability.**
- Structured JSON logs with **pino** (10.x), one request ID per request, returned in responses and included in error reports.
- **Sentry** (11.x) for API and web app errors, in Sentry's EU region (whether the free plan allows the EU region is checked at signup; fallback GlitchTip, hosted in Germany).
- Every AI call writes a row to `ai_usage` (ADR 0008) with user, route, model, tokens and estimated cost. The per user daily quota (spec 6.5) is enforced from this table, and monthly AI cost is queryable.
- No personal data or health notes in logs; IDs only.

## Alternatives

- **Config files per environment.** Easy to commit secrets by mistake; environment variables are the container standard (ADR 0005).
- **Metrics dashboards and tracing.** More than a 50 user beta needs (spec 6.2 "standard baseline").

## Consequences

- A missing variable fails at deploy time, not at the first user request.
- AI cost against the 300 SEK budget is visible from day one of the beta.

## Notes

- 2026-10-22 (#31): `AI_MODEL`, `AI_DAILY_CALLS_PER_USER` and the prices `AI_PRICE_SEK_PER_MTOK_INPUT` and `AI_PRICE_SEK_PER_MTOK_OUTPUT` are configuration; the prices are required, so no environment runs on a made-up price. The quota counts calls per user per calendar day in Sweden, every call that reached the model included (failed ones too), reserved under a per-user lock before the call. The monthly cost query is in `docs/operations.md`. The per-call `max_tokens` stay in code, next to the prompts they belong to.
- 2026-10-22 (#43): error tracking is `@sentry/node` and `@sentry/react` 11, errors only (no tracing, no session replay), and off without a DSN: `SENTRY_DSN` at runtime for the API, `SENTRY_DSN_WEB` as an image build argument for the browser bundle. Both SDKs collect nothing of their own (`dataCollection`) and run every event through one set of scrubbing rules (`packages/contracts/src/error-scrubbing.ts`), so a report carries the error, release, environment, request ID and user ID; a failed query is reported by the same rules as it is logged. The API reports its unexpected 500s and process crashes; the browser reports uncaught errors, route error pages and API calls that failed with a 5xx the API did not mean (no problem code, or `http.internal_error`), tagged with the response's request ID so both reports link. Expected failures, the AI ones included, are only logged. Setup and the admin's test error: `docs/operations.md`.
