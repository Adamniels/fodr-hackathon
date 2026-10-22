# Spec: from hackathon PoC to closed beta

Status: draft for review. Date: 2026-10-15. Owners: the two person team.
Inputs: `docs/audit.md` (current state), the phase 2 interview (2026-10-15), `malbild.md` (original PoC goal).

This document says **what** we build and **what done means**. **How** (frameworks, hosting, schema, API shape) is decided in phase 4 as ADRs in `docs/adr/`. **When and who** lives in the GitHub Project "fodr" as issues, one per slice.

## 1. Goal

Turn the hackathon proof of concept into a web app that is robust enough for a **closed beta** with 10 to 50 real horse owners in Sweden, and a foundation we can keep building on.

The product's core stays the same: an owner uploads a roughage analysis and describes the horse; the app produces a feeding plan following SLU Rapport 289, with products, grams per day and cost per month. AI reads, asks and explains. **The code calculates; the AI never does.**

There is no deadline. Progress is measured against the milestones in section 8.

### Positioning decisions

| Decision | Consequence |
|---|---|
| Open sign-up, free | Anyone can sign up: real accounts and data, no billing. How and when the product launches, who it is for and how it earns money are decided later (owner, 2026-10-22). |
| Business model undecided | Recommendations stay store neutral. Nothing in the data model or optimiser may favour a store. |
| Decision support, not authority | Concrete doses stay, with visible sources, disclaimers and vet referrals. A plan must never be confidently wrong: invalid input is rejected and infeasible plans are shown as infeasible. |

## 2. Users

**Beta user:** an individual horse owner in Sweden with one account and one to a few horses, mostly on a phone (often in the stable, photographing the lab report), sometimes on a computer with the PDF.

Not in the beta: stables, feed advisors, sharing a horse between users. The data model must allow a horse to get more users later (see 6.3), but no sharing feature is built.

## 3. Core flows and acceptance criteria

Every flow below must work against the real backend with no mocks. Each flow has at least one Playwright e2e test (AI mocked at the HTTP boundary) and the listed criteria are what the tests and reviewers check.

### CF1. Account

- A new user can sign up with email and password; the email must be verified before horses can be saved.
- A user can log in with email and password, or request a magic link and log in from it.
- A user can reset a forgotten password by email.
- A user can log out on the current device; the session is no longer valid afterwards.
- Unauthenticated requests to any user data or AI endpoint are rejected with 401.
- A user can never read or change another user's data (checked by an integration test that tries).

### CF2. Horse profiles

- A logged in user can create, edit and delete horses. Changes are saved on the server and visible after reload and on another device.
- Every numeric field is validated: required fields cannot be empty, and values outside the documented range (for example weight, age at least 3, body condition 1 to 9, roughage kg per day) are shown with a message next to the field and stop the plan, which the engine refuses to calculate (`validateProfile`). The server refuses wrong types and missing fields; a value out of range is saved as a draft, so typing is never lost (owner, 2026-10-21, #24). Clearing a field never silently becomes 0.
- Deleting a horse asks for confirmation and removes its analyses, plans and journal.

### CF3. AI profile fill

- From the profile, the user can describe the horse, its current feed and health in free text; the AI fills fields and may ask at most two follow-up questions.
- The AI can add sensitivities but never remove ones the owner set (today's rule, kept).
- A product the AI names is only linked if it exists in the product table; otherwise it is kept as an unknown feed and shown as such.
- Nothing is saved until the user has seen the filled fields.

### CF4. Analysis upload and review

- The user uploads a PDF or a photo (PNG, JPEG, WebP) up to a documented size limit. Other types and oversized files are rejected before upload with a clear message.
- The original file is stored with the analysis. An analysis belongs to exactly one horse; a horse can have several analyses over time, and one is marked current.
- Extracted values are shown with their source (analysis, converted, estimated, missing) and can be corrected. Invalid corrections (non numbers, negatives, dry matter outside 1 to 100 %) are rejected.
- A document that is not a feed analysis is rejected with a message, and nothing is saved.
- The analysis survives reload, and switching horse shows that horse's own analysis (fixes audit C4).

### CF5. Feeding plan

- Given a valid horse and analysis, the plan shows: actions, shopping list with grams per day and cost per month, cheaper alternative, swaps, health adaptations, roughage quality, and the nutrient balance table with SLU source per row.
- Invalid input never produces a plan; the user sees what to fix (fixes C1, C2).
- If no combination satisfies the SLU limits, the plan says so explicitly, names the limiting nutrient and does not say "no supplements needed" (fixes C3).
- Laminitis, EMS, PPID and PSSM trigger the same low sugar rules and warnings (fixes C5).
- Every plan shown is reproducible: a saved plan records the analysis, profile values and product data version it was calculated from.
- The existing hand calculated SLU cases still pass.

### CF6. Plan explanation and transition

- An AI explanation is generated for a plan, cached for that exact plan, and can be regenerated. If the AI fails, the plan is still fully usable and the user sees a short message.
- The transition calendar shows the step schedule for the horse's sensitivity, and the user can download it as an `.ics` file that imports in Google Calendar and Apple Calendar.

### CF7. Journal

- The user can add entries with date, weight, body condition and text; dates default to today in the user's local time zone (fixes C6).
- An entry with weight or body condition can update the profile, after which the plan is recalculated.
- The user can save the current plan as a version in the journal.
- Trend, follow up date and rapid weight loss warning are shown as today.
- AI journal analysis returns a summary, at most three patterns, a vet flag and at most three next steps, and never gives doses or diagnoses.

### CF8. My data

- A user can export all their data (profiles, analyses including original files, plans, journal) as a downloadable archive.
- A user can delete their account; all their data and files are removed, and this is confirmed by email.

### CF9. Product administration

- An admin (a role, given to the team) can list, create, edit and retire products, including declaration per kg, dose range, ingredients, form, price, package size and a "last verified" date.
- Only products marked selectable, with a complete declaration and a dose range, can be chosen by the optimiser.
- Changing a product never changes a saved plan (see CF5 reproducibility).

## 4. Scope

### In scope for the beta

- Everything in section 3.
- The public landing page as a route in the same app. Its plan preview may keep calculating from the test fixture horse.
- i18n preparation: all UI text goes through an i18n layer, and the domain returns message codes with parameters instead of Swedish sentences. The beta ships in Swedish only.
- A seed script that can create a demo or beta account with example horses in any environment.
- Privacy notice, terms for the beta, and visible disclaimers on plans.

### Removed

- localStorage accounts and persistence (`auth.ts`, `storage.ts` as they are today).
- The always-seeded demo account and the "Exempel" analysis buttons. `src/data/examples.ts` stays, as test fixtures only.
- `app/scratchverify/`, the tracked `.DS_Store` files and `Krubba – pitch.pdf` (moved out of the repo).

### Out of scope for the beta

Payments and billing; social login (Google, Apple); native apps and PWA; sharing horses and stable views (the `origin/stall` designs, which may be revisited later); the English translation itself; pasture as a feed source, foals, young horses, pregnant and lactating mares; comparison with the national statistics; competitor comparison.

## 5. Constraints

| Area | Constraint |
|---|---|
| Baseline | `main` at `9dedc8d`. `origin/stall` and `origin/ux` are not merged. |
| Language | TypeScript end to end, so the domain engine and validation schemas are shared by client and server. |
| Hosting | All data and files in the EU. |
| Budget | About 300 kr per month during beta, AI calls included. |
| Auth | Email and password with verification and reset, plus magic link. |
| Data protection | GDPR: export and deletion (CF8), privacy notice, health notes disclosed as sent to the AI provider. |
| AI | Anthropic API, called from the server only. The model is configuration, not code. |
| Product data | Curated table in the database is the source of truth. The scraper becomes an import helper, not a source. |
| Devices | Mobile first responsive web. Must work at 360 px width. |

## 6. Quality bar

### 6.1 Testing

- **Unit:** the domain engine, including regression tests for audit findings C1 to C8.
- **Integration:** the API against a real Postgres, including authorisation (a user cannot reach another user's data).
- **E2E:** Playwright for every core flow, driving the UI by roles and labels, with the AI mocked at the HTTP boundary. Written in M0 at user level so they survive the backend swap.
- **AI evaluation:** the extraction eval runs against the answer key in `testdata/` whenever prompts, schemas or the model change, and must pass before merge.
- **CI** runs lint, typecheck, unit, integration and e2e on every PR from M0 onwards. Deployment pipelines come in M5.

### 6.2 Errors and observability

- A typed error model end to end: validation errors are 400 with field details, domain errors carry codes, unexpected errors are 500 without internal messages.
- React error boundaries around each step.
- Structured server logs with request IDs; error tracking in an EU region; AI usage and cost logged per user and request.

### 6.3 Data

- Every entity has a server generated unique ID and an owner. Horse ownership is modelled so more users can be added later without a migration of existing data.
- Schema changes go through migrations; no silent data loss.

### 6.4 Accessibility

WCAG 2.2 AA for all core flows, checked with automated axe checks in e2e plus a manual keyboard and screen reader pass per milestone.

### 6.5 AI guardrails

All AI endpoints require auth, validate requests with shared schemas, and are limited by a per user daily quota. The user reviews extracted values before a plan is saved. AI output never contains calculated values that the user acts on.

## 7. Ways of working

- **Team:** two people. Work is split in vertical slices: one PR delivers one issue end to end, owned by one person and reviewed by the other, and may fold in small open tickets of the same type (`.claude/CLAUDE.md`).
- **Git:** `main` is protected and always releasable. Short lived branch per issue, PR with green CI and one approval, squash merge, Conventional Commit titles.
- **Refactoring and features never share a PR.** A refactor keeps behaviour identical (tests unchanged and green); a fix or feature changes behaviour on purpose and says so.
- **Language:** the Swedish domain vocabulary (hull, grovfoder, smbRp, foderplan) stays as the ubiquitous language, with a glossary in `docs/glossary.md`. Everything else (new technical code, comments, commits, PRs, docs) is in English.
- **Agents implement, humans own.** AI agents write most code from issues; a human owns each design decision and reviews every PR. The project `.claude/CLAUDE.md`, issue templates with acceptance criteria and CI are the main quality levers.
- **Where things live:** spec, ADRs, architecture overview, glossary and agent conventions in `docs/` and `.claude/`; slices, status and assignment in the GitHub Project "fodr".

## 8. Milestones

| Milestone | Content | Kind of change | Done when |
|---|---|---|---|
| **M0 Safety net** (done 2026-10-15) | Repo hygiene (deletions in section 4, root `.gitignore`, `.env.example`), `npm test`, Prettier, type aware ESLint, Playwright e2e for today's flows, CI on PRs, project `CLAUDE.md`, glossary, fixed eval script (C7) | Tooling only | CI green on `main`; every existing flow has an e2e test |
| **M1 Domain hardening** | Workspaces monorepo, `packages/domain`, i18n layer, validation at the domain boundary, explicit infeasible result, message codes instead of sentences, fixes for C1, C2, C3, C5 and C6 | Refactor PRs and fix PRs kept separate | Regression tests for C1, C2, C3, C5 and C6 pass; no Swedish prose produced by `packages/domain` |
| **M2 Backend foundation** | Server, Postgres, auth (CF1), persistence for horses, analyses with stored reports, plans and journal (CF2, CF4, CF7), fix for C4, frontend off localStorage, routing, demo removed, seed script | Rebuild | CF1, CF2, CF4, CF7 e2e green against the real backend; no localStorage or demo account left |
| **M3 AI hardening** | Shared AI contracts, auth and request validation on AI routes, usage logging and quotas, server side explanations, fix for C8, eval gate in CI (CF3, CF6) | Refactor and feature | CF3, CF6 green; eval gate blocks a deliberately broken prompt |
| **M4 Product data** | Product table, curation of the selectable set, admin view (CF9), plan reproducibility (CF5) | Rebuild of the process | CF5, CF9 green; optimiser reads only from the table |
| **M5 Beta readiness** | Observability, AA pass, CF8, privacy notice and terms, hosting decision, deployment pipeline, beta invites | Feature | All core flows green in a deployed environment; first beta users invited |

The slices for M1 to M5 are issues on the GitHub Project "Fodr"; `docs/roadmap.md` gives the overview.

After the beta: English translation, sharing, stable views, social login, payments. Each would get its own spec.

## 9. Decision log

| Date | Decision | Alternatives considered |
|---|---|---|
| 2026-10-15 | Baseline is `main`; `origin/stall` stays out for now | Merge stall first |
| 2026-10-15 | First release is a closed, free beta | Public free, paid, demo only |
| 2026-10-15 | No deadline, milestones instead | 1 month, 2 to 3 months |
| 2026-10-15 | Business model undecided, stay store neutral | Subscription, affiliate, B2B |
| 2026-10-15 | Decision support with doses, sources and disclaimers | Advisor review, information only |
| 2026-10-15 | All existing flows must become real | Subset for beta |
| 2026-10-15 | Individual owners; sharing later | Sharing or stables now |
| 2026-10-15 | Mobile first web | Desktop first, native |
| 2026-10-15 | i18n prepared now, English after beta | English at beta, Swedish only |
| 2026-10-15 | Remove demo mode; seed script instead | Explicit demo mode, seed into new accounts |
| 2026-10-15 | Curated product table with admin view | Seed files only, scraping |
| 2026-10-15 | Landing page stays in the app | Separate site |
| 2026-10-15 | TypeScript end to end | .NET or Python backend, BaaS only |
| 2026-10-15 | About 300 kr per month | Near zero, about 1000 kr |
| 2026-10-15 | Email and password plus magic link | Social login, magic link only |
| 2026-10-15 | EU hosting, keep uploaded reports | Discard reports, no residency |
| 2026-10-15 | Two people, vertical slices, short branches, squash merge | Layer split, git flow |
| 2026-10-15 | Swedish domain vocabulary, English for everything else | All English, all Swedish |
| 2026-10-15 | Agents implement, humans own | Mostly human written |
| 2026-10-15 | Layered tests, CI before the backend rebuild | CI after foundation, lighter tests |
| 2026-10-15 | Standard observability baseline | Minimal, full |
| 2026-10-15 | WCAG 2.2 AA | Best effort |
| 2026-10-15 | AI quotas plus eval gate | Quotas only, global cap |
| 2026-10-15 | Spec, ADRs and conventions in the repo; slices in the GitHub Project | Everything in a roadmap file |
| 2026-10-15 | Delete `app/scratchverify/`, tracked `.DS_Store`, move pitch PDF out of the repo | Keep them |
| 2026-10-16 | Milestones aligned with the roadmap: C4, report storage and the seed script move to M2 (needed for M2's CF4 criterion and demo removal), C8 to M3, invite only sign up added to M5 | Keep the original milestone table |
| 2026-10-22 | Open sign-up for everyone instead of an invite-only closed beta; #39 dropped. The current work is the foundation: launch, access and payment are decided later (owner) | Invite-only sign up (2026-10-16) |
