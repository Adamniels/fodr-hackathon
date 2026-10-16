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
