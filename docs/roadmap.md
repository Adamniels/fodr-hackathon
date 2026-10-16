# Roadmap: from today to the closed beta

Status: draft for review, 2026-10-16. Inputs: `docs/spec.md` (milestones, core flows CF1 to CF9), `docs/architecture.md` and ADRs 0001 to 0015, `docs/audit.md` (findings C1 to C8), and the deferred minors from the M0 review.

Once approved, every slice below becomes one issue in the GitHub Project "Fodr", with its milestone and type label, and this file shrinks to the milestone overview with links.

## Rules for every slice

- One slice is one issue and one PR, owned end to end by one person and reviewed by the other.
- **Type** is one of `refactor` (behaviour unchanged, tests unchanged), `fix`, `feature`, `chore` (tooling, data, infrastructure) or `docs`. A slice never mixes refactor with fix or feature.
- **Mocks are replaced before new features are added.** M2 removes the mocks; quotas, admin, export and other new capabilities come after.
- **Always green:** `format:check`, `lint`, `typecheck`, unit, integration (from M2) and e2e. "E2E" below names the spec files that must stay green, and what the slice changes in them.
- A `test.skip` marker for a finding (C2, C3, C4, C6) is turned into a real test by the slice that fixes it.

E2E spec files today: `landing-and-account`, `horse-profile`, `analysis-and-plan`, `journal` (in `app/e2e/`, later `apps/web/e2e/`).

---

## M1 Domain hardening

Goal: the calculation engine lives in its own pure package, never produces a plan from invalid input, reports infeasible plans honestly, and returns codes instead of Swedish sentences. The app still runs on localStorage.

### M1-01 chore: harden the e2e harness and CI
- Scope: the deferred M0 review minors. `context.route` instead of `page.route`. Narrow the unmocked guard to AI routes only, so a real backend can serve `/api/v1`. ICS test asserts `DTSTART`. Breed test asserts the type was inactive before. Explanation cache test waits for requests to settle. A01 path resolved from the spec file. `timeout-minutes` and a Playwright browser cache in CI. `@types/node` 24. `CLAUDE.md`: only the AI routes need `.env`.
- Acceptance: every listed item done; CI time not higher than today.
- E2E: all files green; no assertion weakened.

### M1-02 chore: enable Dependabot security alerts and version updates
- Scope: turn on Dependabot alerts (repository setting, owner) and add `.github/dependabot.yml` with weekly npm and GitHub Actions updates, grouped, that respect the two-weeks-old rule via a cooldown.
- Acceptance: alerts on; a first Dependabot PR is opened and CI runs on it. Required by ADR 0009.
- E2E: unaffected.

### M1-03 refactor: npm workspaces skeleton with apps/web
- Depends on: M1-01.
- Scope: root `package.json` with workspaces. Move `app/` to `apps/web` unchanged. Root scripts run each workspace. CI and docs updated (ADR 0003).
- Acceptance: `npm ci` and every check run from the root; `git log --follow` works on moved files; no source changes apart from paths.
- E2E: all files green, unchanged.

### M1-04 refactor: extract packages/domain
- Depends on: M1-03.
- Scope: move `src/domain` and its tests to `packages/domain`. Lint rule: the package may not import browser, Node or I/O APIs, nor `apps/*` (ADR 0004). The web app imports `@fodr/domain`.
- Acceptance: unit tests run in the package; a deliberate `fetch` in the package fails lint.
- E2E: all files green, unchanged.

### M1-05 refactor: i18n layer for UI text
- Depends on: M1-03.
- Scope: react-i18next with a Swedish catalogue. Move all strings in `apps/web` components into it. Numbers, dates and money formatted with `Intl` (ADR 0014).
- Acceptance: rendered text identical; no hardcoded Swedish string literals left in components (checked by a lint rule or a grep in CI).
- E2E: all files green, unchanged (they assert visible Swedish text).

### M1-06 refactor: domain returns message codes for plan actions, warnings and notes
- Depends on: M1-04, M1-05.
- Scope: `plan.ts`, `slu.ts` and `optimize.ts` return `{ code, params }` instead of sentences; the web app translates them. SLU sources become data.
- Acceptance: no Swedish prose produced by these modules; unit tests assert codes and parameters; rendered text identical.
- E2E: all files green, unchanged.

### M1-07 refactor: message codes for sensitivities, roughage quality, transition and journal
- Depends on: M1-06.
- Scope: the same as M1-06 for `kanslighet.ts`, `kvalitet.ts`, `injustering.ts`, `journal.ts` and `byten.ts`.
- Acceptance: `packages/domain` produces no Swedish prose at all (spec M1 done criterion); rendered text identical.
- E2E: all files green, unchanged.

### M1-08 fix: reject invalid horse and analysis input (C1, C2)
- Depends on: M1-04.
- Scope: create `packages/contracts` with zod schemas for the horse profile and the analysis, with the ranges from CF2 and CF4. The domain refuses invalid input with a typed result. The UI shows field errors, and clearing a number field no longer becomes 0.
- Acceptance: the 0 kg horse and NaN dry matter probes from the audit return validation results instead of plans; unit tests for every range; the C2 marker becomes a real test.
- E2E: `horse-profile` gains "clearing weight is rejected"; others green.

### M1-09 fix: report infeasible plans explicitly (C3)
- Depends on: M1-06.
- Scope: the optimiser returns `plan.infeasible` with the limiting nutrient when no candidate fits; the UI shows it instead of "Inga tillskott behövs" (ADR 0013).
- Acceptance: the selenium probe from the audit yields `infeasible` naming selenium; the C3 marker becomes a real test.
- E2E: `analysis-and-plan` gains the infeasible case (example analysis edited to high selenium); others green.

### M1-10 fix: same low sugar rules for laminitis, EMS, PPID and PSSM (C5)
- Depends on: M1-06.
- Scope: one rule decides the low sugar requirement and the sugar warning.
- Acceptance: a unit test per condition shows the warning.
- E2E: green.

### M1-11 fix: "today" in the user's local time zone (C6)
- Depends on: M1-03.
- Scope: one date helper for local dates, used by the journal and the calendar.
- Acceptance: unit test at 00:30 Stockholm time gives the local date; new C6 e2e test with the clock at 00:30.
- E2E: `journal` gains the C6 test; others green.

### M1-12 chore: strict type-aware lint ratchet
- Depends on: M1-08, M1-09.
- Scope: switch to `strictTypeChecked`. Fix the non-null assertions now covered by validation and typed results; anything left gets a justified disable comment.
- Acceptance: lint clean under the strict config; all suites unchanged.
- E2E: green.

---

## M2 Backend foundation

Goal: real accounts and server persistence for horses, analyses, plans and journal. localStorage and the demo account are gone. Every core flow except CF3, CF6, CF8 and CF9 runs against the real backend.

### M2-01 chore: Docker Compose for Postgres, MinIO and Mailpit
- Depends on: M1-03.
- Scope: `compose.yaml`, `.env.example` entries, and GitHub Actions service containers with the same images (ADR 0006). README setup updated.
- Acceptance: `docker compose up` gives healthy services; CI can reach all three.
- E2E: unaffected.

### M2-02 feature: apps/api skeleton
- Depends on: M2-01.
- Scope:
  - Hono app with zod-validated config, pino logs with a request ID, the problem+json error middleware and `GET /api/v1/health` (ADRs 0002, 0013, 0015)
  - Drizzle connection and the first migration (empty schema)
  - Integration test harness against Compose Postgres
  - Dev setup: Vite proxies `/api` to the API; one production start command serves the SPA and the API from one origin
  - A Dockerfile that builds that image
- Acceptance: health returns 200 with a request ID header; an unknown route returns problem+json 404; a missing env var stops startup with a clear message; the Docker image builds in CI.
- E2E: green (web still uses localStorage).

### M2-03 refactor: move the AI routes from Vite middleware to apps/api
- Depends on: M2-02.
- Scope:
  - The four AI handlers move from `server/ai.ts` to `apps/api` behind an `AiProvider` interface, with a fake provider for tests
  - Same request and response shapes
  - The Vite middleware (`apiPlugin.ts`) is deleted
- Acceptance: integration tests cover all four routes with the fake provider; the dev setup works with a real key; no behaviour change visible in the UI.
- E2E: all files green, unchanged (AI still mocked in the browser).

### M2-04 feature: URL routing and server-state layer
- Depends on: M1-05.
- Scope:
  - React Router: landing, login, `/horses/:horseId/{profile,analysis,plan,journal}`
  - TanStack Query provider
  - An error boundary per route
  - Still on localStorage (ADR 0012)
- Acceptance: reload and back keep the horse and step; deep links work; existing flows unchanged.
- E2E: green, plus a new test that a deep link opens the right horse and step.

### M2-05 feature: authentication API (CF1)
- Depends on: M2-02.
- Scope:
  - Better Auth at 1.7.7 or newer with the Drizzle adapter: sign up, email verification, login, logout, password reset and magic link via SMTP; no other plugins
  - Rate limits
  - httpOnly cookie sessions
  - Integration tests that read the mail from Mailpit (ADR 0009)
- Acceptance: every CF1 criterion holds at API level; unauthenticated requests to protected routes get 401.
- E2E: unaffected (UI not wired yet).

### M2-06 feature: account UI on the real backend (replaces the auth mock)
- Depends on: M2-04, M2-05.
- Scope:
  - Login, sign up, verify, reset and magic link screens against the API
  - `auth.ts` mock removed
  - E2E helpers `createAccount` and `logIn` rewritten to use the API and Mailpit
  - The demo button stays until M2-11
- Acceptance: CF1 e2e flows pass against the real API; the password is actually checked.
- E2E: `landing-and-account` rewritten for real auth (same flows plus verification, reset and magic link); others green.

### M2-07 feature: horses API with repository authorization (CF2)
- Depends on: M2-05.
- Scope:
  - The `horses` and `horse_members` tables
  - A repository layer that always takes the user (ADR 0010), plus a lint rule that blocks direct DB imports in handlers
  - CRUD endpoints with contract validation
  - Delete cascades
- Acceptance: integration tests show user B cannot read, change or delete user A's horse (always 404); validation errors are 400 with field paths.
- E2E: unaffected.

### M2-08 feature: horse profiles in the UI on the API (replaces localStorage horses)
- Depends on: M2-06, M2-07.
- Scope: the horse list and profile form use TanStack Query against the API; `storage.ts` horse functions removed.
- Acceptance: CF2 criteria; profile survives reload and another browser context.
- E2E: `horse-profile` runs against the API; the reload test also checks a fresh browser context.

### M2-09 feature: analyses with stored reports, per horse (CF4, fixes C4)
- Depends on: M2-03, M2-08.
- Scope:
  - The `analyses` table and S3 storage through MinIO (ADR 0011)
  - Upload endpoint with type and size limits; the API passes the file to extraction and stores the extracted and corrected values
  - A current flag per horse
  - The UI loads the horse's current analysis
- Acceptance: CF4 criteria; the analysis survives reload; switching horse shows that horse's analysis (C4 marker becomes a test); an oversized or wrong-type file is rejected before upload.
- E2E: `analysis-and-plan` upload tests on the API; the C4 test added.

### M2-10 feature: saved plans computed on the server (CF5, CF6 calendar)
- Depends on: M2-09.
- Scope:
  - The `plans` table: immutable, with inputs, result, engine version and product set version
  - Product set version: a hash of the bundled catalogue until M4
  - The API serves a versioned product snapshot, and the web app stops bundling `products.json`
  - Previews in the browser, saving on the server (ADR 0004)
- Acceptance: a saved plan matches the preview for the same inputs; the saved plan is shown after save; the bundle no longer contains the catalogue.
- E2E: `analysis-and-plan` plan tests on the API; values unchanged (66 g / 14 g / 88 kr).

### M2-11 feature: journal on the API (CF7)
- Depends on: M2-10.
- Scope: the `journal_entries` table and endpoints; saving a plan links the journal entry to the stored plan; a profile update from an entry triggers a recalculation.
- Acceptance: CF7 criteria except the AI analysis, which still works through the existing route.
- E2E: `journal` on the API.

### M2-12 chore: remove the demo account and example analyses, add a seed script
- Depends on: M2-11.
- Scope:
  - Remove the demo account, the "Exempel" buttons and the remaining localStorage code
  - `npm run seed` creates a demo account with Sixten and Pysen in any environment
  - E2E helpers use the seed script, not the demo button
  - `exempel.ts` stays as test fixtures
- Acceptance: no localStorage use left apart from per-viewer UI preferences; `npm run seed` is idempotent; the landing page preview still renders from the fixtures.
- E2E: all files use seeded accounts; flows unchanged.

---

## M3 AI hardening

Goal: AI calls are authenticated, validated, metered and cached, and extraction quality is guarded by CI.

### M3-01 fix: AI routes require auth and validate requests with shared contracts
- Depends on: M2-12.
- Scope: AI request and response schemas move to `packages/contracts`, and the client and e2e fixtures use them. Every AI route requires a session. Media type and size are checked (closes the open-proxy finding).
- Acceptance: unauthenticated AI calls get 401; malformed bodies get 400; arbitrary JSON is no longer forwarded to the model.
- E2E: green.

### M3-02 feature: AI usage logging and per-user daily quotas
- Depends on: M3-01.
- Scope: the `ai_usage` table; a row for every call with tokens and estimated cost; a daily quota per user from config; 429 with a clear message; model and limits are config (ADR 0015).
- Acceptance: integration test of the quota boundary; a monthly cost query documented.
- E2E: a new test that a quota hit shows the message.

### M3-03 feature: server-side explanation per saved plan (CF6)
- Depends on: M3-01.
- Scope: the explanation is generated for a stored plan, cached in the database by plan ID and regenerated on request; no duplicate requests from React StrictMode.
- Acceptance: CF6 criteria; revisiting a plan never calls the provider again; AI failure leaves the plan usable.
- E2E: `analysis-and-plan` explanation tests updated.

### M3-04 fix: AI profile fill only links products that exist (C8, CF3)
- Depends on: M3-01.
- Scope: product IDs from the AI are validated against the snapshot, and unknown ones are kept as an unknown feed.
- Acceptance: CF3 criteria; a unit test with an invented ID.
- E2E: `horse-profile` gains an invented-product case.

### M3-05 chore: extraction eval gate in CI
- Depends on: M3-01.
- Scope:
  - The eval script runs against `apps/api`
  - A CI job runs it only when prompts, AI schemas or the model config change, using an API key from GitHub secrets
  - Results go into the job summary
- Acceptance: a deliberately broken prompt fails the job (spec M3 done criterion); the job is skipped on unrelated PRs.
- E2E: unaffected.

---

## M4 Product data

Goal: a curated, versioned product table is the only source the optimiser reads, edited through an admin view, and saved plans never change when products do.

### M4-01 feature: versioned product tables and import
- Depends on: M2-10.
- Scope:
  - The `products` and `product_versions` tables, plus product set versions (ADR 0008)
  - An import script loads today's catalogue and `produktval.json`
  - The snapshot endpoint and the server optimiser read from the database
- Acceptance: the plan for the fixture horse is unchanged; changing a product version creates a new product set version; saved plans keep their old version.
- E2E: green; plan values unchanged.

### M4-02 feature: admin role and product administration (CF9)
- Depends on: M4-01.
- Scope: an admin role on users; list, create, edit and retire products with declaration, dose range, ingredients, form, price, package size and "last verified"; only complete, selectable products reach the optimiser.
- Acceptance: CF9 criteria; non-admins get 404 on admin routes.
- E2E: a new `admin-products` spec.

### M4-03 chore: curate the selectable product set
- Depends on: M4-02.
- Scope: verify doses, declarations and ingredient lists for the selectable products against packaging, and fill in the known gaps (Trikem E+Selen selenium, Granngården mineral feed Ca and P), with "last verified" set. Owner-driven data work.
- Acceptance: every selectable product has a complete declaration, a dose range and a source.
- E2E: plan values may change on purpose; the pinned values in `analysis-and-plan` are updated in this PR with the reason stated.

### M4-04 fix: plans are reproducible across product changes (CF5)
- Depends on: M4-01.
- Scope: an end-to-end proof that editing a product never changes a saved plan, and that a new plan uses the new version.
- Acceptance: integration and e2e test of both halves.
- E2E: a new test in `analysis-and-plan`.

---

## M5 Beta readiness

Goal: deployed in the EU, observable, accessible, GDPR-ready, and the first beta users invited.

### M5-01 feature: invite-only sign up
- Depends on: M2-06.
- Scope: sign up only for emails on an allowlist managed by admins; the closed beta (spec section 1).
- Acceptance: a non-invited email gets a clear message and no account; integration test.
- E2E: the `landing-and-account` sign-up uses an invited email; new negative test.

### M5-02 feature: export my data (CF8)
- Depends on: M2-11.
- Scope: an archive with profiles, analyses including original files, plans and the journal.
- Acceptance: CF8 export criterion; the archive contents are tested.
- E2E: new test that the download contains the expected files.

### M5-03 feature: delete my account (CF8)
- Depends on: M2-11.
- Scope: delete all of the user's data and files, with email confirmation.
- Acceptance: CF8 deletion criterion; integration test that no rows or objects remain.
- E2E: new test.

### M5-04 feature: privacy notice, beta terms and plan disclaimers
- Depends on: M2-04.
- Scope: pages and consent at sign up, disclosure that health notes are sent to the AI provider, a disclaimer and vet referral on every plan.
- Acceptance: texts reviewed by the owners; consent stored with the account.
- E2E: the sign-up flow includes consent.

### M5-05 feature: error tracking in the EU
- Depends on: M2-02.
- Scope: Sentry (EU region, or GlitchTip) for API and web, with request IDs linked and no personal data in events (ADR 0015).
- Acceptance: a test error in each app appears in the EU project; the scrubbing rules are verified.
- E2E: unaffected (Sentry disabled in tests).

### M5-06 fix: accessibility to WCAG 2.2 AA
- Depends on: M2-12.
- Scope: automated axe checks in every e2e spec; fix what fails (dialog focus trap and Escape, unlabelled analysis inputs, colour-only states); manual keyboard and screen reader pass.
- Acceptance: zero axe violations on core flows; the manual pass is documented.
- E2E: all files gain axe assertions.

### M5-07 docs: hosting provider decision (ADR 0016)
- Depends on: none (can start any time after M2-02).
- Scope: re-check prices and EU terms; choose the provider (front runner per ADR 0005: Fly.io + Neon + R2 + Scaleway TEM); data processing agreements in place.
- Acceptance: an accepted ADR with cost estimate and DPA links.
- E2E: unaffected.

### M5-08 chore: production deployment pipeline
- Depends on: M5-07, M5-05.
- Scope: production resources, secrets, migrations on deploy, deploy on merge to `main`, backups verified with a test restore, a health check.
- Acceptance: a merge deploys automatically; a restore drill succeeds; all core flows pass a smoke e2e run against production.
- E2E: a new smoke subset runnable against a deployed URL.

### M5-09 chore: beta launch
- Depends on: all of M5.
- Scope: seed invites, onboard the first users, a feedback channel.
- Acceptance: the first beta users are invited and have logged in (spec M5 done criterion).
- E2E: n/a.

---

## Order at a glance

```
M1  01 02 → 03 → 04 ─┬→ 06 → 07          08 → 12
                     └→ 05 ─┘  06 → 09 10   11
M2  01 → 02 → 03        04 (after M1-05)
         02 → 05 → 06 (+04) → 07 → 08 → 09 → 10 → 11 → 12
M3  01 → 02  03  04  05
M4  01 → 02 → 03   01 → 04
M5  07 any time · 01 02 03 04 05 06 → 08 → 09
```

Within a milestone, slices without a dependency between them can be worked in parallel by the two of us.
