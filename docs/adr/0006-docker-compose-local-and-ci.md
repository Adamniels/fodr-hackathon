# 0006. Local development and CI with Docker Compose

Status: Accepted. Date: 2026-10-16.

## Context

With a real backend, development and tests need Postgres, object storage and email. They should behave like production and be identical for both developers and CI, without paying for cloud services before the beta (ADR 0005).

## Decision

A `compose.yaml` at the repository root starts the backing services:

- **Postgres** (same major version as production will use)
- **MinIO** as the S3 compatible file store
- **Mailpit** to catch outgoing email, with a web inbox for verification and magic link flows

The API and the web app run on the host with `npm run dev`, configured through `.env` pointing at these services. CI uses the same images as GitHub Actions service containers, so integration and e2e tests run against real Postgres, S3 and SMTP.

## Alternatives

- **Native installs** (Postgres.app, local filesystem for files, console logged email). No Docker needed, but local behaviour drifts from production and CI.
- **Cloud dev databases** (for example a free Neon branch). Ties development to a provider and the network.

## Consequences

- Both developers need Docker Desktop or OrbStack.
- E2E tests in M2 run against the real API and database; only the Anthropic API stays mocked.
- Seed data (the future demo or beta account, spec section 4) is loaded by a script into this database.
