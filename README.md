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
cd app
cp .env.example .env        # add ANTHROPIC_API_KEY to use the AI features
npm ci
npx playwright install chromium
npm run dev                 # http://localhost:5173
```

Without an API key everything except the AI parts works (reading an uploaded report, filling the profile from free text, the explanations). Use "Exempel: komplett analys" on the analysis step instead.

## Commands

Run in `app/`. CI runs format, lint, typecheck, unit and e2e on every PR.

| Command | What |
|---|---|
| `npm test` | Unit tests for the calculation engine, including hand calculated SLU cases |
| `npm run test:e2e` | Playwright tests of every user flow, AI mocked, no key needed |
| `npm run lint` | ESLint (type aware) |
| `npm run typecheck` | TypeScript |
| `npm run format` | Prettier |
| `node scripts/importera-produkter.mjs` | Rebuilds `src/data/products.json` from the store data |
| `node scripts/utvardera-utlasning.mjs` | Checks AI extraction against the answer key (needs `npm run dev` and an API key, about 11 API calls) |

To hide the formatting commit from `git blame`: `git config blame.ignoreRevsFile .git-blame-ignore-revs`.

## Structure

| Part | Where | Does |
|---|---|---|
| SLU model | `app/src/domain/slu.ts` | Requirements per SLU Rapport 289, every value with its table reference |
| Roughage | `app/src/domain/forage.ts`, `intake.ts` | Supply from the roughage, default values when the analysis lacks a nutrient |
| Selection | `app/src/domain/optimize.ts` | Cheapest product combination within min and max limits |
| Plan | `app/src/domain/plan.ts` | SLU adjustment order, warnings, nitrogen |
| Roughage quality | `app/src/domain/kvalitet.ts` | SLU table 32, dry matter range, soil contamination |
| Sensitivities | `app/src/domain/kanslighet.ts` | Excludes products and gives advice based on health |
| Feed transition | `app/src/domain/injustering.ts` | Step schedule for changing feed, by sensitivity |
| Journal | `app/src/domain/journal.ts` | Trend, follow up and saved plans per horse |
| AI | `app/server/ai.ts` | Reads reports, interprets free text, explains. Never calculates |
| Products | `app/src/data/products.json` | Generated from store data (228 items), not edited by hand |
| Selectable products | `app/scripts/produktval.json` | The 15 products the optimiser may choose, with hand converted doses and sources |
| E2E tests | `app/e2e/` | Playwright specs, AI mocks and fixtures |
| Test data | `testdata/Testdata-from-other-dev/` | Synthetic lab reports based on national statistics, with an answer key |

The AI understands, asks and explains. The model calculates. Numbers in explanations come only from the calculation.
