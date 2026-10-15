# M0 Safety Net Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lock in today's behaviour with e2e tests, tooling and CI before any restructuring, so M1 and M2 can change the code safely.

**Architecture:** No product code changes, apart from one bug fix (C7) and behaviour-preserving lint and format fixes. Playwright drives the existing Vite dev server, with all `/api/*` calls intercepted in the browser and answered from fixtures, so tests need no API key and no network. GitHub Actions runs the checks on every PR, and each later task extends the workflow it introduced.

**Tech Stack:** Node 24 LTS, Vite 6, React 19, Vitest 5, Playwright (`@playwright/test` 1.55.0, Chromium only), Prettier 3.6.2, ESLint 9 with `typescript-eslint` type-aware config, GitHub Actions.

**Spec:** `docs/spec.md` (milestone M0, sections 4, 6.1, 7). Findings referenced as C1 to C8 come from `docs/audit.md` section 5.

## Global Constraints

- Baseline is `main` at `9dedc8d`. `origin/stall` and `origin/ux` are not touched.
- Refactoring and features never share a PR. In M0 the only behaviour change is the C7 fix, which gets its own PR.
- The e2e tests characterise **current** behaviour, mocks included. If the app does something the spec calls a bug (C1 to C8), the test must not assert the buggy behaviour; it skips that case with a comment naming the finding, so M1 can add the real test.
- E2E tests drive the UI by role, label and visible text only. They never read or write `localStorage` directly, so they survive the M2 backend swap.
- No app source changes for testability (no `data-testid`) in M0.
- New technical code, comments, commits and docs are in English. Swedish domain identifiers stay as they are.
- Commit titles follow Conventional Commits (`chore:`, `test:`, `ci:`, `fix:`, `style:`, `docs:`).
- All npm commands run in `app/`. Paths below are relative to the repo root.

## Decisions in this plan that need your approval

1. **New dev dependencies:** `@playwright/test@1.55.0` and `prettier@3.6.2`, pinned exactly. No runtime dependencies.
2. **Node 24 LTS** in `.nvmrc`, CI and `engines`. Local machines run Node 26, which is fine for development. I'd pin 26 instead only once it is the active LTS line in the setup-node action.
3. **ESLint `recommendedTypeChecked`, not `strictTypeChecked`.** Strict gives 226 errors today, 65 of them non-null assertions whose fixes change behaviour (they belong to M1's validation work). The plan adds strict as a ratchet task in M1.
4. **The pitch PDF moves to `~/Documents/fodr/`**, outside the repo. Change the path if you prefer another place.
5. **PR batching:** seven PRs, listed in "PR plan" below.
6. **Branch protection is set up by you** in GitHub settings after PR B (Task 11). I don't change repository settings.

## Review Focus

1. **Unmocked API calls.** `PlanStep` requests an explanation as soon as it mounts. A test that forgets a mock would hit the dev server, get a "no API key" error and pass or fail by accident. Expected: any unmocked `/api/*` request fails the test immediately. Pinned in Task 4 (`unmocked api request fails the test`).
2. **Date and time zone.** The journal defaults to "today", the calendar starts "tomorrow", and C6 makes the default UTC based. Expected: tests are deterministic on any machine at any hour. Pinned in Task 4 (fixed clock and `Europe/Stockholm`) and Task 7 (`journal entry defaults to the fixed date`).
3. **Swedish number formatting.** `toLocaleString('sv-SE')` uses a no-break space as the thousands separator (`1 000`). Expected: amount assertions don't break on whitespace. Pinned in Task 4 (`expectMoney` helper) and used in Task 6.
4. **State leaking between accounts.** Horses and the journal are stored per user. Expected: a new account starts empty even after the demo account was used in the same browser. Pinned in Task 4 (`new account starts empty after demo use`).
5. **Formatter and lint fixes that silently change behaviour.** Expected: the full unit and e2e suites give identical results before and after Tasks 8 and 9. Pinned as explicit verification steps in both tasks.

## File structure

```
.gitignore                         new, root: .DS_Store, .env, editor files
.nvmrc                             new: 24
.git-blame-ignore-revs             new (Task 8): the formatting commit
.github/workflows/ci.yml           new (Task 2), extended in Tasks 4, 8, 9
.github/pull_request_template.md   new (Task 10)
.claude/CLAUDE.md                  new (Task 10)
docs/glossary.md                   new (Task 10)
README.md                          modified (Task 10)
app/.env.example                   restored
app/package.json                   scripts, devDependencies, engines
app/vite.config.ts                 Vitest include list
app/tsconfig.node.json             include e2e and playwright.config.ts
app/eslint.config.js               type-aware config (Task 9)
app/.prettierrc.json, app/.prettierignore   new (Task 8)
app/playwright.config.ts           new (Task 4)
app/e2e/support/mock-ai.ts         mocks for the four /api routes
app/e2e/support/helpers.ts         login and navigation helpers, expectMoney
app/e2e/fixtures/ai/*.json         AI responses: analys-a01, profil, profil-foljdfraga, forklaring, journal
app/e2e/*.spec.ts                  one file per flow group (Tasks 4 to 7)
app/scripts/utvardera-utlasning.mjs  C7 fix (Task 3)
deleted: app/scratchverify/, .DS_Store, testdata/.DS_Store, "Krubba – pitch.pdf"
```

---

### Task 1: Repo hygiene and test scripts

**Files:**
- Create: `.gitignore`, `.nvmrc`, `app/.env.example`
- Modify: `app/package.json`, `app/vite.config.ts`
- Delete: `app/scratchverify/`, `.DS_Store`, `testdata/.DS_Store`, `Krubba – pitch.pdf` (moved, see decision 4)

**Interfaces:**
- Produces: npm scripts `test` (`vitest run`), `test:watch` (`vitest`), `typecheck` (`tsc -b`), and the existing `lint`. `engines.node` is `>=24`.

- [ ] **Step 1:** Move the pitch PDF to `~/Documents/fodr/` (create the folder), then `git rm` it. Delete `app/scratchverify/` (untracked, plain `rm -r`). `git rm --cached` both `.DS_Store` files and delete them.
- [ ] **Step 2:** Root `.gitignore` with `.DS_Store`, `.env`, `.env.*`, `!.env.example`, `.idea/`, `.vscode/*`, `!.vscode/extensions.json`. `.nvmrc` containing `24`. `app/.env.example` containing `ANTHROPIC_API_KEY=` (the exact content from commit `292bd3d`).
- [ ] **Step 3:** In `app/vite.config.ts` add `test: { include: ['src/**/*.test.ts', 'server/**/*.test.ts'] }` to the returned config (Vitest must never pick up Playwright's `*.spec.ts`). Use `defineConfig` from `vitest/config` if the `test` key fails typechecking.
- [ ] **Step 4:** Add the scripts and `engines` to `app/package.json`.
- [ ] **Step 5: Verify**
  Run: `npm test && npm run typecheck && npm run lint && git status --short`
  Expected: `Tests 52 passed (52)` across 8 files, typecheck exit 0, lint with 0 problems (the 4 errors came from the deleted scratch file), and git status showing only the intended changes.
- [ ] **Step 6: Commit** `chore: clean repo, restore .env.example, add test scripts`

### Task 2: CI for static checks

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Produces: workflow `CI` with job `checks`. Later tasks add steps to `checks` and a job `e2e`.

- [ ] **Step 1:** Write `ci.yml`: triggers `pull_request` and `push` to `main`; `concurrency` per ref with `cancel-in-progress: true`; `permissions: contents: read`; `defaults.run.working-directory: app`. Job `checks` on `ubuntu-latest`: `actions/checkout@v4`, `actions/setup-node@v4` with `node-version-file: .nvmrc`, `cache: npm`, `cache-dependency-path: app/package-lock.json`, then `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`.
- [ ] **Step 2: Verify locally** that the exact command sequence passes from a clean install: `rm -rf node_modules && npm ci && npm run lint && npm run typecheck && npm test`. Expected: all exit 0.
- [ ] **Step 3: Commit** `ci: run lint, typecheck and unit tests on every PR`
- [ ] **Step 4: Verify on GitHub** once PR B is open: the `checks` job is green on the PR. Paste the run URL into the PR description.

### Task 3: Fix the AI eval script URL (C7)

Separate PR: this is a behaviour change.

**Files:**
- Modify: `app/scripts/utvardera-utlasning.mjs:26`

- [ ] **Step 1: Reproduce.** With no dev server running: `node scripts/utvardera-utlasning.mjs`. Expected today: it fails with `ERR_INVALID_URL`.
- [ ] **Step 2: Fix** by making the URL a template literal (backticks), so `${port}` is interpolated.
- [ ] **Step 3: Verify.** Same command, still with no server. Expected: it now fails with a connection error (`ECONNREFUSED` / `fetch failed`), which proves the URL parses. A full run against the real API is optional and costs about 11 API calls.
- [ ] **Step 4: Commit** `fix(scripts): interpolate port in eval script URL`

The regression guard is ESLint's `no-template-curly-in-string`, added in Task 9.

### Task 4: Playwright harness, AI mocks, landing and account flows

**Files:**
- Modify: `app/package.json` (devDependency, scripts `test:e2e`, `test:e2e:ui`), `app/tsconfig.node.json` (`include` adds `e2e` and `playwright.config.ts`; add `resolveJsonModule: true` for the JSON fixtures), `app/.gitignore` (`playwright-report/`, `test-results/`), `.github/workflows/ci.yml`
- Create: `app/playwright.config.ts`, `app/e2e/support/mock-ai.ts`, `app/e2e/support/helpers.ts`, `app/e2e/fixtures/ai/*.json`, `app/e2e/landing-and-account.spec.ts`

**Interfaces:**
- Produces, in `e2e/support/mock-ai.ts`:
  - `type AiRoute = 'analys' | 'profil' | 'forklaring' | 'journal'`
  - `interface AiMock { calls(route: AiRoute): unknown[]; respondWith(route: AiRoute, body: unknown, status?: number): void }`
  - `export async function mockAi(page: Page): Promise<AiMock>` registers `page.route('**/api/**')` *before* navigation. Each known route answers its default fixture (status 200) unless overridden by `respondWith`, and records request bodies for `calls`. Any other `/api/` path, or a route with no response configured, calls `route.abort()` and makes the test fail.
  - Export `test` from `e2e/support/helpers.ts` as Playwright's `test.extend<{ ai: AiMock }>` with an auto fixture, so every test gets the mocks without remembering to install them.
- Produces, in `e2e/support/helpers.ts`:
  - `enterDemo(page: Page): Promise<void>`: from `/`, clicks the first "Testa med demohästen" button and waits for the "Mina hästar" sidebar.
  - `createAccount(page: Page, name: string, email: string): Promise<void>` and `logIn(page: Page, email: string): Promise<void>`
  - `goToStep(page: Page, step: 'Hästen' | 'Analysen' | 'Foderplan' | 'Journal'): Promise<void>`: clicks the button in `nav[aria-label="Steg"]` whose name ends with the step.
  - `expectMoney(locator: Locator, kronor: number): Promise<void>`: asserts the text matches the amount with any whitespace as the thousands separator, followed by `kr`.

Config values for `playwright.config.ts`: `testDir: 'e2e'`, Chromium only, `use: { baseURL: 'http://localhost:5173', locale: 'sv-SE', timezoneId: 'Europe/Stockholm', trace: 'retain-on-failure' }`, `webServer: { command: 'npm run dev -- --strictPort', url: 'http://localhost:5173', reuseExistingServer: !process.env.CI }`, `retries: process.env.CI ? 1 : 0`, `forbidOnly: !!process.env.CI`. The auto fixture also calls `page.clock.setFixedTime(new Date('2026-10-15T10:00:00+02:00'))`.

Fixtures: `analys-a01.json` is a valid `UtlastAnalys` (`app/src/domain/analysis.ts:6`) built from the A01 entry in `testdata/Testdata-from-other-dev/krubba-testdata-v2/data/facit.json`. `profil.json` is a `ProfilTolkning` (`app/src/api.ts:24`) with `fang: true` and no follow-up questions. `profil-foljdfraga.json` is the same with one entry in `foljdfragor`. `forklaring.json` is `{ "text": "E2E-förklaring: stycke ett.\nStycke två." }`. `journal.json` is a `JournalAnalys` with `veterinar.behovs: true`. Each fixture must typecheck: import it in a `satisfies` check inside `mock-ai.ts`.

- [ ] **Step 1:** Install `@playwright/test@1.55.0` (exact), run `npx playwright install chromium`, and add the config, support files and fixtures.
- [ ] **Step 2: Write the tests** in `landing-and-account.spec.ts`:
  - `landing page offers the demo and login`: headline "Rätt foder till din häst" is visible, and buttons "Testa med demohästen" and "Logga in" exist.
  - `demo account opens with Sixten and Pysen`: after `enterDemo`, the sidebar lists "Sixten" and "Pysen", and the page heading is "Sixten".
  - `create account, log out, log in again`: `createAccount(page, 'E2E Test', 'e2e@example.se')`, the sidebar shows "E2E Test", "Logga ut" returns to the landing page, and `logIn` with the same email shows "E2E Test" again.
  - `unknown email shows an error`: `logIn` with `nobody@example.se` shows "Det finns inget konto med den e-postadressen".
  - `new account starts empty after demo use` (Review Focus 4): `enterDemo`, log out, create an account, and the sidebar shows no horse except "Lägg till häst".
  - `unmocked api request fails the test` (Review Focus 1): mark this with `test.fail()`, then call `page.evaluate(() => fetch('/api/okand', { method: 'POST' }))` and assert it resolves to an OK response. The test passing (as an expected failure) proves the guard aborts unknown routes.
- [ ] **Step 3: Run** `npm run test:e2e`. Expected: 6 passed. Tests describe current behaviour, so they pass immediately. To prove each assertion bites, temporarily change one expected text per test, watch it fail, then revert.
- [ ] **Step 4:** Add job `e2e` to `ci.yml`: same setup as `checks`, then `npx playwright install --with-deps chromium`, `npm run test:e2e`, and `actions/upload-artifact@v4` of `app/playwright-report` with `if: failure()`.
- [ ] **Step 5: Commit** `test(e2e): add Playwright harness with AI mocks and account flows`

### Task 5: Horse profile flows (F3, F4)

**Files:**
- Create: `app/e2e/horse-profile.spec.ts`

**Interfaces:**
- Consumes: `test`, `createAccount`, `enterDemo`, `goToStep` from Task 4, and `AiMock` via the `ai` fixture.

- [ ] **Step 1: Write the tests:**
  - `add a horse and it survives reload`: on a new account, click "Lägg till din första häst", fill "Namn" with "Blixten", "Vikt (kg)" with 480, "Ålder (år)" with 9; reload; the sidebar and heading show "Blixten" and the "Vikt" property shows "480 kg".
  - `choosing a breed sets the type`: select "Islandshäst" in "Ras"; the "Lättfödd" segment button has class `aktiv`. Asserting the class is acceptable here because no accessible state exists yet; add a comment saying so.
  - `AI fill sets fields and sensitivities`: in the demo account, fill "Om hästen och vad den äter i dag", click "Fyll i med AI"; the "Har haft fång" checkbox is checked; `ai.calls('profil')` has length 1 and its body contains the typed text and a non-empty `produkter` array.
  - `AI follow-up question round trip`: `respondWith('profil', <profil-foljdfraga>)`; after "Fyll i med AI" the question appears as a labelled input; answer it and click "Svara"; the second request's `tidigareSvar` contains the question and answer.
  - `AI error is shown and the form stays usable`: `respondWith('profil', { fel: 'Testfel' }, 500)`; "Testfel" is visible and the "Namn" field is still editable.
- [ ] **Step 2: Run** `npx playwright test horse-profile`. Expected: 5 passed, after the same temporary-break check as in Task 4.
- [ ] **Step 3: Commit** `test(e2e): cover horse profile and AI profile fill`

C2 (an empty number field becomes 0) is deliberately not asserted. Add `test.skip('clearing weight is rejected (C2, fixed in M1)')` as a marker.

### Task 6: Analysis and plan flows (F5 to F8)

**Files:**
- Create: `app/e2e/analysis-and-plan.spec.ts`

**Interfaces:**
- Consumes: Task 4 helpers, `expectMoney`, and the fixtures `analys-a01.json` and `forklaring.json`.

- [ ] **Step 1: Write the tests** (all in the demo account, horse Sixten):
  - `upload a report shows extracted values`: on Analysen, `setInputFiles` on the file input with `testdata/Testdata-from-other-dev/krubba-testdata-v2/pdf/A01-medel-skord1.pdf`; the "Torrsubstans" input has the fixture's `tsProcent`; the "Energi" row shows the fixture value; `ai.calls('analys')[0]` has `mediaType: 'application/pdf'` and a non-empty `base64`.
  - `non-analysis document is rejected`: `respondWith('analys', { ...fixture, arAnalys: false })`; after upload, "Dokumentet ser inte ut att vara en foderanalys." is visible and "Räkna fram foderplan" is absent.
  - `example analysis produces the known plan`: click "Exempel: komplett analys", then "Räkna fram foderplan". The shopping list contains rows "Eclipse Biofarmab Foderkrita 6kg" with "23 g", "Krafft Miner Original Pellets 20kg" with "75 g", and "Salt 1,5 kg" with "13 g", and the actions list contains "Ta bort Krafft Leisure Pellets 20kg". These values were verified on 2026-10-15 by running `skapaPlan` with `demoHast` and `analysKomplett`. **If they differ, stop and report. Don't update them silently.** Use `expectMoney` on the total row with the value shown at that point, and record it in the test with a comment.
  - `plan explanation comes from the AI mock`: "E2E-förklaring: stycke ett." and "Stycke två." are visible as separate paragraphs; `ai.calls('forklaring')` has length 1. Navigating away and back does not add a call (cache).
  - `explanation failure keeps the plan usable`: `respondWith('forklaring', { fel: 'Nere' }, 502)`; "Förklaringen kunde inte hämtas" is visible and the shopping list still renders.
  - `calendar download is a valid ics`: click "Lägg in i min kalender"; the download's content starts with `BEGIN:VCALENDAR`, contains `SUMMARY:Fodr: Sixten` and ends with `END:VCALENDAR`.
- [ ] **Step 2: Run** `npx playwright test analysis-and-plan`. Expected: 6 passed, after the temporary-break check.
- [ ] **Step 3: Commit** `test(e2e): cover analysis upload, plan, explanation and calendar`

Markers for M1: `test.skip('switching horse uses that horse\'s analysis (C4)')` and `test.skip('infeasible plan is not shown as no supplements (C3)')`.

### Task 7: Journal flows (F9, F10)

**Files:**
- Create: `app/e2e/journal.spec.ts`

- [ ] **Step 1: Write the tests** (demo account, Sixten, with the example analysis loaded via the Task 6 steps; extract a `loadExamplePlan(page)` helper into `helpers.ts` instead of duplicating):
  - `demo journal shows trend`: the Journal step shows "570 → 550 kg" and a "Hull" trend "8 → 7".
  - `journal entry defaults to the fixed date` (Review Focus 2): the "Datum" input value is `2026-10-15`.
  - `entry with weight updates the profile`: fill "Vikt (kg)" with 545 and "Vad har du sett?" with "Pigg", keep "Uppdatera profilen" checked, click "Lägg till"; the timeline shows "545 kg" and "Pigg", and the "Vikt" property shows "545 kg".
  - `saving the plan adds a timeline entry`: from Foderplan click "Spara planen i journalen"; the Journal step opens and the timeline has "Foderplan sparad".
  - `AI journal analysis shows the vet flag`: click "Analysera journalen"; "Kontakta veterinär." is visible; the request body has `poster` sorted by date.
- [ ] **Step 2: Run** `npm run test:e2e`. Expected: the whole suite passes (22 tests, 3 skipped markers).
- [ ] **Step 3: Commit** `test(e2e): cover journal and AI journal analysis`

### Task 8: Prettier

Separate PR: pure formatting.

**Files:**
- Create: `app/.prettierrc.json` (`{ "semi": false, "singleQuote": true, "printWidth": 120 }`, which matches today's style), `app/.prettierignore` (`dist`, `package-lock.json`, `src/data/products.json`, `playwright-report`, `test-results`), `.git-blame-ignore-revs`
- Modify: `app/package.json` (devDependency, scripts `format` = `prettier --write .`, `format:check` = `prettier --check .`), `.github/workflows/ci.yml` (`npm run format:check` in `checks`)

- [ ] **Step 1:** Record the baseline: `npm test` and `npm run test:e2e` results (counts).
- [ ] **Step 2:** Add the config and run `npm run format`. Expected: about 20 files change, no other edits.
- [ ] **Step 3: Verify** that `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test` and `npm run test:e2e` all pass with the same counts as Step 1 (Review Focus 5).
- [ ] **Step 4: Commit** `style: format codebase with Prettier`. Then add that commit's SHA to `.git-blame-ignore-revs` and commit `chore: ignore formatting commit in blame`.

### Task 9: Type-aware ESLint

Separate PR: may touch code, behaviour-preserving only.

**Files:**
- Modify: `app/eslint.config.js`, and the source files with findings

Config: for `**/*.{ts,tsx}` use `tseslint.configs.recommendedTypeChecked` with `parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname }`. For `**/*.{js,mjs}` use `js.configs.recommended`, node globals and `tseslint.configs.disableTypeChecked`. Globally enable `no-template-curly-in-string: 'error'` (the C7 guard). Keep the react-hooks and react-refresh rules.

- [ ] **Step 1:** Record baseline test counts as in Task 8.
- [ ] **Step 2:** Change the config and run `npm run lint`. Expected: a handful of findings (the measurement gave 4 `no-misused-promises` plus a few `no-unsafe-*`).
- [ ] **Step 3:** Fix each finding without changing behaviour. For example, `onClick={() => void kor()}` for floating promises, and typing the Playwright `JSON.parse` results. A finding that can only be fixed by changing behaviour gets `// eslint-disable-next-line <rule> -- M1: <reason>` and is listed in the PR description.
- [ ] **Step 4: Verify** that lint is clean and all suites match the baseline counts (Review Focus 5). Also confirm the C7 guard bites: temporarily revert Task 3's fix and check that `npm run lint` reports `no-template-curly-in-string`, then restore the fix.
- [ ] **Step 5: Commit** `chore(lint): enable type-aware ESLint rules`

### Task 10: Conventions for humans and agents

**Files:**
- Create: `.claude/CLAUDE.md`, `docs/glossary.md`, `.github/pull_request_template.md`
- Modify: `README.md` (setup steps, the `npm test` and `npm run test:e2e` commands, and links to `docs/spec.md`, `docs/audit.md` and the GitHub Project; drop the "Att göra före demo" list)

`.claude/CLAUDE.md` must contain, briefly:
- what the app is, with links to the spec, audit, ADRs and glossary
- the commands (`dev`, `test`, `test:e2e`, `lint`, `typecheck`, `format`) and that all must pass before a PR
- the rules from spec section 7: vertical slices, one issue per PR, refactor and feature never mixed, Conventional Commits, the language rule
- domain invariants: the AI never calculates; a missing value is unknown, never zero; every requirement value cites its SLU table; non-SLU assumptions are marked `ANTAGANDE` in code and "ej SLU" in the UI
- testing rules: new behaviour gets a test first; e2e drives the UI by role and label and never touches storage; AI is mocked at the HTTP boundary
- never commit secrets; the API key lives only in `app/.env`

The `superpowers` or `init-project-config` skills may scaffold this file, but its content must match the list above.

`docs/glossary.md` maps each Swedish term to its English meaning and its identifier in code, at least: hull (body condition score, 1 to 9), grovfoder (roughage), hö (hay), hösilage (haylage), ts / torrsubstans (dry matter), smbRp / smältbart råprotein (digestible crude protein), OE / energi (metabolisable energy, MJ), behov (requirement), intag / tillförsel (intake), brist (deficiency), överskott (surplus), schablon (default value when the analysis lacks a nutrient), urval (product selection), kraftfoder (concentrate), mineralfoder (mineral feed), tillskott (supplement), fång (laminitis), EMS, PPID, PSSM / korsförlamning, injustering / foderbyte (feed transition), foderstat (ration), lösdrift (loose housing), täcke (rug), arbetstillägg (work allowance), ANTAGANDE (assumption not from SLU).

The PR template has: a summary; a type checkbox (refactor: behaviour unchanged / fix / feature / tooling / docs); a "linked issue" field; a checklist (tests added or unchanged, all checks pass locally, no refactor and feature mix, docs updated if behaviour changed).

- [ ] **Step 1:** Write the three files and the README changes.
- [ ] **Step 2: Verify** by following the README setup from a fresh clone in the scratchpad: `git clone`, `npm ci`, `cp .env.example .env`, `npm test`, `npm run test:e2e`. All must succeed.
- [ ] **Step 3: Commit** `docs: add project conventions, glossary and PR template`

### Task 11: Branch protection (you, in GitHub)

- [ ] After PR B is merged: in the repo settings, protect `main`: require a PR, 1 approval, status checks `checks` (and `e2e` once PR D is merged), linear history, and no force pushes. Squash merge only.

---

## PR plan

Revised 2026-10-15 at the owner's request: the docs go straight to `main`, and all tooling work goes on one branch. Execution is native (one implementer, one whole-branch review at the end).

| PR | Content | Branch |
|---|---|---|
| (none) | `docs/audit.md`, `docs/spec.md`, this plan, pushed to `main` | `main` |
| 1 | Tasks 1, 2 and 4 to 10, one commit per task | `chore/m0-safety-net` |
| 2 | Task 3 (behaviour change, so kept separate) | `fix/eval-script-url` |

Within the branch, commit order follows task order. Tasks 4 to 7 land before 8 and 9, so formatting and lint changes run against the full e2e suite. Task 11 (branch protection) happens after PR 1 is merged.

## Done when (spec M0)

- CI is green on `main` with jobs `checks` (format, lint, typecheck, unit) and `e2e`.
- Every existing flow (F1 to F10 in the audit) has at least one e2e test. F1 and F2 are covered in Task 4, F3 and F4 in Task 5, F5 to F8 in Task 6, F9 and F10 in Task 7.
- The three skipped markers (C2, C3, C4) and the strict-lint ratchet are recorded as M1 issues.
