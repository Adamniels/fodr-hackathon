# Fodr (Krubba)

Upload a roughage analysis, describe the horse, and get a feeding plan following SLU Rapport 289: products, grams per day and cost per month. Started as a hackathon proof of concept; now being built towards a closed beta.

- What we build and what done means: [`docs/spec.md`](docs/spec.md)
- State of the codebase and known findings: [`docs/audit.md`](docs/audit.md)
- Domain vocabulary (Swedish in code): [`docs/glossary.md`](docs/glossary.md)
- Conventions for humans and agents: [`.claude/CLAUDE.md`](.claude/CLAUDE.md)
- Work items: the GitHub Project "fodr"; how agents write and work tickets: [`docs/agent-workflow.md`](docs/agent-workflow.md)
- Original hackathon goal (Swedish): [`malbild.md`](malbild.md)

## Setup

Requires Node 24 or newer (see `.nvmrc`).

```bash
cp apps/web/.env.example apps/web/.env   # add ANTHROPIC_API_KEY to use the AI features
npm ci
npx playwright install chromium
npm run dev                 # http://localhost:5173
```

Without an API key everything except the AI parts works (reading an uploaded report, filling the profile from free text, the explanations). Use "Exempel: komplett analys" on the analysis step instead.

## Commands

Run at the repository root; each fans out to every workspace (today only `apps/web`). CI runs format, lint, typecheck, unit and e2e on every PR.

| Command | What |
|---|---|
| `npm test` | Unit tests for the calculation engine, including hand calculated SLU cases |
| `npm run test:e2e` | Playwright tests of every user flow, AI mocked, no key needed |
| `npm run lint` | ESLint (type aware) |
| `npm run typecheck` | TypeScript |
| `npm run format` | Prettier |
| `node apps/web/scripts/importera-produkter.mjs` | Rebuilds `apps/web/src/data/products.json` from the store data |
| `node apps/web/scripts/utvardera-utlasning.mjs` | Checks AI extraction against the answer key (needs `npm run dev` and an API key, about 11 API calls) |

To hide the formatting commit from `git blame`: `git config blame.ignoreRevsFile .git-blame-ignore-revs`.

## Structure

| Part | Where | Does |
|---|---|---|
| SLU model | `packages/domain/src/slu.ts` | Requirements per SLU Rapport 289, every value with its table reference |
| Roughage | `packages/domain/src/forage.ts`, `intake.ts` | Supply from the roughage, default values when the analysis lacks a nutrient |
| Selection | `packages/domain/src/optimize.ts` | Cheapest product combination within min and max limits |
| Plan | `packages/domain/src/plan.ts` | SLU adjustment order, warnings, nitrogen |
| Roughage quality | `packages/domain/src/kvalitet.ts` | SLU table 32, dry matter range, soil contamination |
| Sensitivities | `packages/domain/src/kanslighet.ts` | Excludes products and gives advice based on health |
| Feed transition | `packages/domain/src/injustering.ts` | Step schedule for changing feed, by sensitivity |
| Journal | `packages/domain/src/journal.ts` | Trend, follow up and saved plans per horse |
| AI | `apps/web/server/ai.ts` | Reads reports, interprets free text, explains. Never calculates |
| Products | `apps/web/src/data/products.json` | Generated from store data (228 items), not edited by hand |
| Selectable products | `apps/web/scripts/produktval.json` | The 15 products the optimiser may choose, with hand converted doses and sources |
| E2E tests | `apps/web/e2e/` | Playwright specs, AI mocks and fixtures |
| Test data | `testdata/Testdata-from-other-dev/` | Synthetic lab reports based on national statistics, with an answer key |

The AI understands, asks and explains. The model calculates. Numbers in explanations come only from the calculation.
