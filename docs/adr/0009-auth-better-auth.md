# 0009. Authentication with Better Auth

Status: Accepted. Date: 2026-10-16.

## Context

CF1 requires sign up with email and password, email verification, password reset, magic link login and logout. Today accounts are a localStorage mock (audit M1). Authentication is security critical and easy to get subtly wrong when written from scratch.

## Decision

Use **Better Auth**, pinned to an exact version **no older than 1.7.7**, with its Drizzle adapter (ADR 0008):

- Built in email and password, email verification and password reset.
- The **magic link plugin**, and no other plugins until a spec requires them.
- Sessions in **httpOnly, Secure, SameSite=Lax cookies**. The web app and API are served from the same origin (ADR 0005), so no tokens live in JavaScript and no CORS is needed.
- Emails are sent through our `Mailer` interface (ADR 0005), caught by Mailpit locally (ADR 0006).
- Rate limiting on sign in, sign up and magic link requests.

## Alternatives

- **Own session implementation** (the approach Lucia now recommends after its deprecation). Full control, but every flow, token and timing safe comparison is code we must get right.
- **Hosted auth** (Auth0, Clerk). Least code, but cost and data outside the EU.
- **Supabase Auth.** Only sensible together with Supabase, rejected in ADR 0002.

## Consequences

- Better Auth has had many security advisories in 2026, including a critical one involving magic links fixed in 1.7.7 (GHSA-965c-763c-88jm) and a high one fixed in 1.6.22 (GHSA-qq9h-g4jm-xgf3). Most advisories concern plugins we do not use. We pin versions, enable Dependabot security alerts and upgrade promptly; keeping the plugin set minimal is a rule.
- Better Auth owns its tables; our tables reference `users.id`.

## Notes

- 2026-10-21 (#22): Better Auth 1.7.7, exact (the only release both at least 1.7.7 and two weeks old; no GitHub advisory covers it). The email is verified before password login (`requireEmailVerification`); the link verifies and signs in. The magic link logs existing users in only (`disableSignUp`), and its reply never says whether an account exists. Emails are sent without awaiting SMTP, so response times do not reveal accounts either. Telemetry is off. Tables follow ADR 0008 (plural, UUID IDs, timestamptz rather than the generator's plain timestamp). Rate limits are always on and stored in Postgres (`rate_limits`), keyed on the client IP, which the app resolves itself: from `CLIENT_IP_HEADER` when a trusted proxy sets one (the M5 host, #45), else the connection's address, never from a header the client chooses (Better Auth's default reads `x-forwarded-for`, which a client can rotate to dodge the limit) (owner).

