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

- 2026-10-21 (#22): Better Auth 1.7.7, exact (the only release both at least 1.7.7 and two weeks old; no GitHub advisory covers it). The email is verified before password login (`requireEmailVerification`); the link verifies and signs in. The magic link logs existing users in only (`disableSignUp`) and goes only to an email with an account, with the same reply either way. A sign up with an email that has an account replies as to a new one and mails the mailbox instead: a verified owner hears an account exists, an unverified account gets a link to choose a password, and a used reset link marks the email verified, replaces any password and revokes sessions, which closes pre-account takeover (owner, after the review). Mail and the account lookups behind it run without being awaited, so response times reveal no accounts. Origin, CSRF and callback URL checks are forced on, since Better Auth skips them when `NODE_ENV` is test. Tokens are stored hashed. Better Auth's own logs go through pino without SQL parameters (ADR 0015). Telemetry is off. Tables follow ADR 0008 (plural, UUID IDs, timestamptz rather than the generator's plain timestamp). Rate limits are always on and stored in Postgres (`rate_limits`), keyed on the client IP, which the app resolves itself: from `CLIENT_IP_HEADER` when a trusted proxy sets one (the M5 host, #45), else the connection's address, never from a header the client chooses. Per-account limits (distributed guessing, mail to one address) are left to M5.
- Better Auth's own routes under `/api/auth/*` answer errors in its format, `{ code, message }` with English text (a 429 is `{ message }` with `X-Retry-After`), not problem+json (ADR 0013). The web app (#23) maps Better Auth's codes to translated text; our own routes stay problem+json.
- 2026-10-22 (#36): `users.role` ('user' or 'admin') is a Better Auth additional field with `input: false`, so it travels with the session and no sign-up or profile update can set it. Only `npm run admin:grant -- <email>` and `admin:revoke` (`dist/admin.mjs` in the image) change it, for a verified account; the API applies the change to the account's next request (the web app reads the session again on its next load). The admin routes answer 404 to anyone without the role, signed out included.
- 2026-10-22 (#41): account deletion is Better Auth's `deleteUser`, at `POST /api/auth/delete-user`, always with the password (a hook refuses it without one; Better Auth alone would accept a recent session) and at once (owner). It takes at most five tries a minute, like signing in. `beforeDelete` deletes the horses the user owns, removing each one's reports right after its rows, and the user's pending reset and login links; `afterDelete` sends a receipt email, which holds no link. The emailed-link confirmation Better Auth also offers is not used: a mail scanner that opens links could delete an account.
