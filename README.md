# Fodr (Krubba)

Upload a roughage analysis, describe the horse, and get a feeding plan following SLU Rapport 289: products, grams per day and cost per month. Started as a hackathon proof of concept; now being built towards a closed beta.

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
npm run dev                 # the web app on http://localhost:5173, the API on http://localhost:3000
```

Without an API key everything except the AI parts works (reading an uploaded report, filling the profile from free text, the explanations). Use "Exempel: komplett analys" on the analysis step instead.

## Commands

Run at the repository root. `lint`, `typecheck`, `test` and `format` run in every workspace (`apps/web`, `apps/api`, `packages/domain`, `packages/contracts`); `dev` and `build` run the web app and the API; `test:e2e` runs `apps/web`; `test:integration` and `db:migrate` run `apps/api`; `test:scripts` runs the agent script tests. CI runs format, lint, typecheck, unit, script, integration and e2e tests on every PR, and builds and smoke tests the Docker image.

| Command | What |
|---|---|
| `npm test` | Unit tests for the calculation engine (including hand calculated SLU cases) and the API, no services needed |
| `npm run test:integration` | API tests against the Compose Postgres, in their own `fodr_test` database |
| `npm run test:e2e` | Playwright tests of every user flow, AI mocked, no key needed |
| `npm run test:scripts` | Offline tests of the agent scripts in `scripts/agent/` (needs `jq`) |
| `npm run lint` | ESLint (type aware) |
| `npm run typecheck` | TypeScript |
| `npm run format` | Prettier |
| `npm run db:migrate` | Applies pending migrations from `apps/api/drizzle/` to `DATABASE_URL` |
| `docker build -t fodr .` | The production image: one Node process serving the API and the web app (`docker run -p 3000:3000 -e DATABASE_URL=... fodr`) |
| `node apps/web/scripts/import-products.mjs` | Rebuilds `apps/web/src/data/products.json` from the store data |
| `node apps/web/scripts/evaluate-analysis-reading.mjs` | Checks AI extraction against the answer key (needs `npm run dev` and an API key, about 11 API calls) |

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
| Contracts | `packages/contracts/src/` | zod schemas shared by the web app and the API: problem+json, `GET /api/v1/me` |
| AI | `apps/api/src/ai/` | Reads reports, interprets free text, explains, behind the `AiProvider` interface (`anthropic.ts`). Never calculates |
| Products | `apps/web/src/data/products.json` | Generated from store data (228 items), not edited by hand |
| Selectable products | `apps/web/scripts/produktval.json` | The 15 products the optimiser may choose, with hand converted doses and sources |
| E2E tests | `apps/web/e2e/` | Playwright specs, AI mocks and fixtures |
| Test data | `testdata/Testdata-from-other-dev/` | Synthetic lab reports based on national statistics, with an answer key |

The AI understands, asks and explains. The model calculates. Numbers in explanations come only from the calculation.
