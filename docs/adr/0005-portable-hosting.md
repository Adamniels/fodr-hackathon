# 0005. Portable hosting, provider chosen in M5

Status: Accepted. Date: 2026-10-16.

## Context

All data must be hosted in the EU on about 300 SEK per month including AI (spec section 5). Provider prices and terms change often; we do not want early code to depend on a provider we may need to leave.

## Decision

The system depends only on standard interfaces:

| Need | Interface | Implemented by |
|---|---|---|
| Runtime | One Docker image running a long lived Node server; config via environment variables | any container host |
| Database | Plain Postgres over a normal connection (`pg` driver), migrations via drizzle-kit | any managed or self hosted Postgres |
| Files | S3 API, endpoint and bucket from config (ADR 0011) | any S3 compatible store |
| Email | SMTP behind a small `Mailer` interface in the API | any transactional email provider |

**Not allowed in application code:** provider specific database drivers or features (for example Neon's serverless driver or branching), edge or Workers runtimes, provider specific volumes, and serverless function platforms with small body limits (Vercel functions cap bodies at 4.5 MB, too small for report uploads).

The provider is chosen in **M5** in a new ADR, when the deployment pipeline is built. Research on 2026-10-16 puts **Fly.io (Frankfurt) + Neon Postgres (Frankfurt) + Cloudflare R2 (EU jurisdiction) + Scaleway Transactional Email + Sentry (EU)** in front at an estimated 90 to 120 SEK per month; alternatives were all Scaleway (about 130 to 150 SEK) and Hetzner with Coolify (about 70 SEK, but self managed Postgres and backups).

## Alternatives

- **Choose the provider now.** Would let early slices deploy, but costs money before the beta and invites provider specific shortcuts.

## Consequences

- Moving provider later means `pg_dump`/`pg_restore`, copying a bucket, new environment variables and a new deploy target: roughly a day, not a rewrite.
- Until M5 there is no deployed environment; everything is verified locally and in CI (ADR 0006).
