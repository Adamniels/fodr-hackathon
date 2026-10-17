# Fodr (Krubba): project conventions

Fodr turns a horse owner's roughage analysis into a feeding plan following SLU Rapport 289. It is being taken from a hackathon proof of concept to a closed beta.

Read before changing anything substantial:

- `docs/spec.md`: what we build and what done means (core flows CF1 to CF9, milestones M0 to M5)
- `docs/audit.md`: the state of the codebase and known findings (C1 to C8)
- `docs/architecture.md`: the target architecture, with links to every decision in `docs/adr/`
- `docs/glossary.md`: the Swedish domain vocabulary used in code
- `docs/agent-workflow.md`: how tickets are written and worked by agents, and the Mac mini runbook

Work is tracked as issues in the GitHub Project "fodr". One issue is one PR. Write a ticket with `/write-ticket <description>`; work on one with `/pick-up-ticket <number>`.

## Commands

All run in `app/`. Every one must pass before a PR is opened; CI runs the same set.

| Command | What |
|---|---|
| `npm run dev` | Vite dev server with the `/api` routes (the AI routes need `app/.env`) |
| `npm test` | Unit tests (Vitest, `src/**/*.test.ts`) |
| `npm run test:e2e` | Playwright e2e tests, AI mocked, no API key needed |
| `npm run lint` | ESLint, type aware |
| `npm run typecheck` | `tsc -b` |
| `npm run format` / `format:check` | Prettier |

## Rules

- **Refactoring and features never share a PR.** A refactor keeps behaviour identical and leaves tests unchanged; a fix or feature changes behaviour on purpose and says so in the PR.
- **Vertical slices.** A PR delivers one issue end to end (data, API, UI, tests), not one layer.
- **Commits and PR titles** follow Conventional Commits (`feat:`, `fix:`, `refactor:`, `test:`, `chore:`, `docs:`, `ci:`, `style:`).
- **Language.** Swedish domain identifiers stay (see the glossary). New technical code, comments, commits, PRs and docs are in English. UI text is Swedish and goes through the i18n layer once it exists (M1).
- **Never commit secrets.** The Anthropic key lives only in `app/.env`, which is git ignored. Copy `app/.env.example`.
- Ask before adding dependencies, changing the architecture, or deleting files.

## Rules for AI agents

- **Never merge a PR and never use a branch protection bypass**, even when asked. A human merges after approving. The owner can bypass review through PRs, and an agent working with the owner's credentials inherits that bypass, so this rule is what keeps the review gate real.
- **No agent attribution.** Never add `Co-Authored-By` trailers naming an AI agent to commits, and never add "Generated with" lines or similar agent credits to commit messages, PR titles or PR descriptions.

## Domain invariants

- **The AI never calculates.** It reads reports, asks follow-up questions and explains. Requirements, doses and costs come only from `src/domain`.
- **A missing value is unknown, never zero.** Do not default a missing nutrient, weight or dry matter to 0.
- **Every requirement value cites its source** (SLU table or page) next to the value.
- **Assumptions not from SLU** are marked `ANTAGANDE` in code and shown as "ej SLU" in the UI.
- Recommendations stay store neutral: nothing may favour a store.

## Testing

- New behaviour gets a failing test first (unit for `src/domain`, e2e for user flows).
- E2E tests drive the UI by role, label and visible text only. They never read or write storage directly and never use CSS classes unless no accessible alternative exists (say so in a comment).
- The AI is mocked at the HTTP boundary through `e2e/support/mock-ai.ts`; an unmocked `/api` call fails the test. `/api/v1` is not intercepted, because it belongs to the real backend.
- Tests characterising known bugs do not assert the bug: use a `test.skip` marker naming the finding.
- Changes to AI prompts, schemas or the model must be checked with `node scripts/utvardera-utlasning.mjs` (costs about 11 API calls).
