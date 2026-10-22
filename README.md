# Fodr (Krubba)

Upload a roughage analysis, describe the horse, and get a feeding plan following SLU Rapport 289: products, grams per day and cost per month. Started as a hackathon proof of concept; now being built into a foundation for its first real users.

- What we build and what done means: [`docs/spec.md`](docs/spec.md)
- State of the codebase and known findings: [`docs/audit.md`](docs/audit.md)
- Domain vocabulary (Swedish in code): [`docs/glossary.md`](docs/glossary.md)
- Conventions for humans and agents: [`.claude/CLAUDE.md`](.claude/CLAUDE.md)
- Work items: the GitHub Project "fodr"; how agents write and work tickets: [`docs/agent-workflow.md`](docs/agent-workflow.md)
- Original hackathon goal (Swedish): [`malbild.md`](malbild.md)

## Setup

Requires Node 24 or newer (see `.nvmrc`) and Docker (Docker Desktop, or any Docker with Compose v2).

```bash
cp .env.example .env        # service ports and DATABASE_URL; add ANTHROPIC_API_KEY to use the AI features
docker compose up --wait    # Postgres, the S3 store (SeaweedFS) and Mailpit (inbox: http://localhost:8025)
bash scripts/dev/check-services.sh       # optional: checks that all three answer
npm ci
npx playwright install chromium
npm run db:migrate          # applies the database migrations
npm run products:import     # loads the product catalogue into the database; the API refuses to start without it
npm run seed                # the demo account from SEED_EMAIL and SEED_PASSWORD, with Sixten and Pysen
npm run dev                 # the web app on http://localhost:5173, the API on http://localhost:3000
```

Without an API key everything except the AI parts works (reading an uploaded report, filling the profile from free text, the explanations). Log in as the seeded demo account instead: its Sixten has an analysis and a journal, so the plan works without reading a report.

## Commands

Run at the repository root. `lint`, `typecheck`, `test` and `format` run in every workspace (`apps/web`, `apps/api`, `packages/domain`, `packages/contracts`); `dev` and `build` run the web app and the API; `test:e2e` runs `apps/web`; `test:integration`, `db:migrate`, `products:import`, `admin:grant`, `admin:revoke` and `seed` run `apps/api`; `test:scripts` runs the script tests. CI runs format, lint, typecheck, unit, script, integration and e2e tests on every PR, builds and smoke tests the Docker image, and runs the extraction eval when a PR changes the prompts, schemas or model (#34).

| Command | What |
|---|---|
| `npm test` | Unit tests for the calculation engine (including hand calculated SLU cases) and the API, no services needed |
| `npm run test:integration` | API tests against the Compose Postgres, in their own `fodr_test` database |
| `npm run test:e2e` | Playwright tests of every user flow against the real API (needs `docker compose up --wait`), AI mocked (report reading by a fake in the API), no key needed |
| `npm run test:scripts` | Offline tests of the scripts in `scripts/agent/` and `scripts/ci/` (needs `jq`) |
| `npm run lint` | ESLint (type aware) |
| `npm run typecheck` | TypeScript |
| `npm run format` | Prettier |
| `npm run db:migrate` | Applies pending migrations from `apps/api/drizzle/` to `DATABASE_URL` |
| `npm run products:import` | Mirrors the catalogue file `apps/api/src/data/products.json` into the product tables (new set only when something changed); idempotent, also in the image (`node apps/api/dist/import-products.mjs`) |
| `npm run admin:grant -- <email>` | Makes a verified account an admin (product administration, CF9); `admin:revoke` takes it back; also in the image (`node apps/api/dist/admin.mjs grant <email>`) |
| `npm run seed` | Creates the demo account (`SEED_EMAIL`, `SEED_PASSWORD`) with Sixten and Pysen; idempotent, also in the image (`node apps/api/dist/seed.mjs`) |
| `docker build -t fodr .` | The production image: one Node process serving the API and the web app (`docker run -p 3000:3000 -e DATABASE_URL=... fodr`) |
| `node apps/web/scripts/import-products.mjs` | Rebuilds `apps/api/src/data/products.json` from the store data |
| `npm run eval:analysis -w apps/api` | Checks AI extraction against the answer key and fails below the gate (calls the provider directly; needs an API key, about 11 API calls; CI runs it when the prompts, schemas or model change) |

To hide the formatting commit from `git blame`: `git config blame.ignoreRevsFile .git-blame-ignore-revs`.

## Structure

| Part | Where | Does |
|---|---|---|
| SLU model | `packages/domain/src/slu.ts` | Requirements per SLU Rapport 289, every value with its table reference |
| Roughage | `packages/domain/src/forage.ts`, `intake.ts` | Supply from the roughage, default values when the analysis lacks a nutrient |
| Selection | `packages/domain/src/optimize.ts` | Cheapest product combination within min and max limits |
| Plan | `packages/domain/src/plan.ts` | SLU adjustment order, warnings, nitrogen |
| Roughage quality | `packages/domain/src/quality.ts` | SLU table 32, dry matter range, soil contamination |
| Sensitivities | `packages/domain/src/sensitivity.ts` | Excludes products and gives advice based on health |
| Feed transition | `packages/domain/src/transition.ts` | Step schedule for changing feed, by sensitivity |
| Journal | `packages/domain/src/journal.ts` | Trend, follow up and saved plans per horse |
| Web routes | `apps/web/src/router.tsx`, `routes/` | A URL for every page: `/`, `/login`, `/horses` and `/horses/:horseId/{profile,analysis,plan,journal}`; an error boundary on every page and step |
| API | `apps/api/src/` | Hono app (`app.ts`), config from the environment (`config.ts`), problem+json errors, Drizzle (`db.ts`, migrations in `apps/api/drizzle/`) |
| Auth | `apps/api/src/auth.ts`, `session.ts`, `mail/` | Better Auth at `/api/auth/*` (sign up, verification, login, logout, password reset, magic link), `requireUser` for protected routes, account emails over SMTP (Mailpit locally) |
| Horses API | `apps/api/src/horses-routes.ts`, `repositories/horses.ts` | `/api/v1/horses`: CRUD for the signed-in user's horses, every query scoped through `horse_members` (ADR 0010) |
| Web horses | `apps/web/src/horses.ts` | The account's horses on `/api/v1/horses`, edits autosaved when typing pauses |
| Analyses API | `apps/api/src/analyses-routes.ts`, `repositories/analyses.ts`, `storage.ts` | Report upload per horse (type by magic bytes, PDF 20 MB, photo 5 MB), read by the AI, converted by the domain, stored with the file in S3 (ADR 0011) |
| Product catalogue | `apps/api/src/products.ts`, `repositories/products.ts`, `import-products-cli.ts` | Products, their immutable versions and the product sets plans record (ADR 0008), read per request from the newest set |
| Plans API | `apps/api/src/plans-routes.ts`, `repositories/plans.ts`, `repositories/explanations.ts` | Saved plans per horse, computed by the server and stored immutably with the build (`APP_VERSION`) and catalogue versions (ADR 0004); the plan step saves the plan it shows, and each saved plan's AI explanation is stored with it (CF6) |
| Journal API | `apps/api/src/journal-routes.ts`, `repositories/journal.ts` | The journal per horse; an entry can update the profile atomically, and a saved plan's entry is made with it (CF7) |
| Terms and privacy | `apps/web/src/routes/Legal.tsx`, `packages/contracts/src/terms.ts`, texts under `legal.*` in `sv.json` | The beta terms and privacy notice at `/villkor` and `/integritet`, accepted at sign-up by version; the disclaimer on every plan |
| Account deletion | `apps/api/src/auth.ts` (`deleteUser`), `apps/web/src/components/DeleteAccount.tsx` | Deletes the account and everything of it at once with the password, and emails a receipt; AI usage stays, anonymous (CF8) |
| My data export | `apps/api/src/export-routes.ts`, `repositories/export.ts` | Everything about the user as a ZIP: account, horses with analyses and original reports, plans with explanations, journal, AI usage (CF8) |
| AI usage | `apps/api/src/ai/metered.ts`, `repositories/ai-usage.ts` | Every model call logged with tokens and estimated cost, a daily quota per user (`AI_DAILY_CALLS_PER_USER`); the monthly cost query is in `docs/operations.md` |
| Contracts | `packages/contracts/src/` | zod schemas shared by the web app and the API: problem+json, `GET /api/v1/me`, horses, analyses, plans and their explanations, journal, the AI routes |
| AI | `apps/api/src/ai/` | Reads reports (in the analysis upload), interprets free text and explains at `/api/v1/ai/*` for signed-in users, behind the `AiProvider` interface (`anthropic.ts`). Never calculates |
| Products | `apps/api/src/data/products.json` | Generated from store data (228 items), not edited by hand; served at `/api/v1/products`, versioned by its hash |
| Selectable products | `apps/web/scripts/produktval.json` | The 15 products the optimiser may choose, with hand converted doses and sources |
| E2E tests | `apps/web/e2e/` | Playwright specs, AI mocks and fixtures; the API they run against is `apps/api/test/e2e-server.ts` |
| Test data | `testdata/Testdata-from-other-dev/` | Synthetic lab reports based on national statistics, with an answer key |

The AI understands, asks and explains. The model calculates. Numbers in explanations come only from the calculation.
