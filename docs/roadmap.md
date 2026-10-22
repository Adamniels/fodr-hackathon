# Roadmap: from today to the closed beta

Status: accepted 2026-10-16. Every slice is an issue on the [Fodr project board](https://github.com/users/Adamniels/projects/6), grouped by [milestone](https://github.com/Adamniels/fodr-hackathon/milestones). **The issue is the source of truth** for scope, acceptance criteria and the e2e tests that must stay green; this file is the overview.

Inputs: `docs/spec.md`, `docs/architecture.md` and ADRs 0001 to 0015, `docs/audit.md` (findings C1 to C8), and the deferred minors from the M0 review.

## Rules for every slice

- One slice is one issue and one PR, owned end to end by one person and reviewed by the other.
- **Type** is one of `refactor` (behaviour unchanged, tests unchanged), `fix`, `feature`, `chore` (tooling, data, infrastructure) or `docs`. A slice never mixes refactor with fix or feature.
- **Mocks are replaced before new features are added.** M2 removes the mocks; quotas, admin, export and other new capabilities come after.
- **Always green:** `format:check`, `lint`, `typecheck`, unit, integration (from M2) and e2e. The E2E section of each issue names the spec files that must stay green, and what the slice changes in them.
- A `test.skip` marker for a finding (C2, C3, C4, C6) is turned into a real test by the slice that fixes it.

E2E spec files today: `landing-and-account`, `horse-profile`, `analysis-and-plan`, `journal` (in `apps/web/e2e/`).

## M1 Domain hardening

The calculation engine lives in its own pure package, never produces a plan from invalid input, reports infeasible plans honestly, and returns codes instead of Swedish sentences. The app still runs on localStorage.

| Slice | Issue | Type | Title | Depends on |
|---|---|---|---|---|
| M1-01 | [#6](https://github.com/Adamniels/fodr-hackathon/issues/6) | chore | harden the e2e harness and CI |  |
| M1-02 | [#7](https://github.com/Adamniels/fodr-hackathon/issues/7) | chore | enable Dependabot security alerts and version updates |  |
| M1-03 | [#8](https://github.com/Adamniels/fodr-hackathon/issues/8) | refactor | npm workspaces skeleton with apps/web | M1-01 ([#6](https://github.com/Adamniels/fodr-hackathon/issues/6)) |
| M1-04 | [#9](https://github.com/Adamniels/fodr-hackathon/issues/9) | refactor | extract packages/domain | M1-03 ([#8](https://github.com/Adamniels/fodr-hackathon/issues/8)) |
| M1-05 | [#10](https://github.com/Adamniels/fodr-hackathon/issues/10) | refactor | i18n layer for UI text | M1-03 ([#8](https://github.com/Adamniels/fodr-hackathon/issues/8)) |
| M1-06 | [#11](https://github.com/Adamniels/fodr-hackathon/issues/11) | refactor | domain returns message codes for plan actions, warnings and notes | M1-04 ([#9](https://github.com/Adamniels/fodr-hackathon/issues/9)), M1-05 ([#10](https://github.com/Adamniels/fodr-hackathon/issues/10)) |
| M1-07 | [#12](https://github.com/Adamniels/fodr-hackathon/issues/12) | refactor | message codes for sensitivities, roughage quality, transition and journal | M1-06 ([#11](https://github.com/Adamniels/fodr-hackathon/issues/11)) |
| M1-08 | [#13](https://github.com/Adamniels/fodr-hackathon/issues/13) | fix | reject invalid horse and analysis input (C1, C2) | M1-04 ([#9](https://github.com/Adamniels/fodr-hackathon/issues/9)) |
| M1-09 | [#14](https://github.com/Adamniels/fodr-hackathon/issues/14) | fix | report infeasible plans explicitly (C3) | M1-06 ([#11](https://github.com/Adamniels/fodr-hackathon/issues/11)) |
| M1-10 | [#15](https://github.com/Adamniels/fodr-hackathon/issues/15) | fix | same low sugar rules for laminitis, EMS, PPID and PSSM (C5) | M1-06 ([#11](https://github.com/Adamniels/fodr-hackathon/issues/11)) |
| M1-11 | [#16](https://github.com/Adamniels/fodr-hackathon/issues/16) | fix | "today" in the user's local time zone (C6) | M1-03 ([#8](https://github.com/Adamniels/fodr-hackathon/issues/8)) |
| M1-12 | [#17](https://github.com/Adamniels/fodr-hackathon/issues/17) | chore | strict type-aware lint ratchet | M1-08 ([#13](https://github.com/Adamniels/fodr-hackathon/issues/13)), M1-09 ([#14](https://github.com/Adamniels/fodr-hackathon/issues/14)) |

## M2 Backend foundation

Real accounts and server persistence for horses, analyses, plans and journal. localStorage and the demo account are gone. Every core flow except CF3, CF6, CF8 and CF9 runs against the real backend.

| Slice | Issue | Type | Title | Depends on |
|---|---|---|---|---|
| M2-01 | [#18](https://github.com/Adamniels/fodr-hackathon/issues/18) | chore | Docker Compose for Postgres, an S3 store (SeaweedFS) and Mailpit | M1-03 ([#8](https://github.com/Adamniels/fodr-hackathon/issues/8)) |
| M2-02 | [#19](https://github.com/Adamniels/fodr-hackathon/issues/19) | feature | apps/api skeleton | M2-01 ([#18](https://github.com/Adamniels/fodr-hackathon/issues/18)) |
| M2-03 | [#20](https://github.com/Adamniels/fodr-hackathon/issues/20) | refactor | move the AI routes from Vite middleware to apps/api | M2-02 ([#19](https://github.com/Adamniels/fodr-hackathon/issues/19)) |
| M2-04 | [#21](https://github.com/Adamniels/fodr-hackathon/issues/21) | feature | URL routing and server-state layer | M1-05 ([#10](https://github.com/Adamniels/fodr-hackathon/issues/10)) |
| M2-05 | [#22](https://github.com/Adamniels/fodr-hackathon/issues/22) | feature | authentication API (CF1) | M2-02 ([#19](https://github.com/Adamniels/fodr-hackathon/issues/19)) |
| M2-06 | [#23](https://github.com/Adamniels/fodr-hackathon/issues/23) | feature | account UI on the real backend (replaces the auth mock) | M2-04 ([#21](https://github.com/Adamniels/fodr-hackathon/issues/21)), M2-05 ([#22](https://github.com/Adamniels/fodr-hackathon/issues/22)) |
| M2-07 | [#24](https://github.com/Adamniels/fodr-hackathon/issues/24) | feature | horses API with repository authorization (CF2) | M2-05 ([#22](https://github.com/Adamniels/fodr-hackathon/issues/22)) |
| M2-08 | [#25](https://github.com/Adamniels/fodr-hackathon/issues/25) | feature | horse profiles in the UI on the API (replaces localStorage horses) | M2-06 ([#23](https://github.com/Adamniels/fodr-hackathon/issues/23)), M2-07 ([#24](https://github.com/Adamniels/fodr-hackathon/issues/24)) |
| M2-09 | [#26](https://github.com/Adamniels/fodr-hackathon/issues/26) | feature | analyses with stored reports, per horse (CF4, fixes C4) | M2-03 ([#20](https://github.com/Adamniels/fodr-hackathon/issues/20)), M2-08 ([#25](https://github.com/Adamniels/fodr-hackathon/issues/25)) |
| M2-10 | [#27](https://github.com/Adamniels/fodr-hackathon/issues/27) | feature | saved plans computed on the server (CF5, CF6 calendar) | M2-09 ([#26](https://github.com/Adamniels/fodr-hackathon/issues/26)) |
| M2-11 | [#28](https://github.com/Adamniels/fodr-hackathon/issues/28) | feature | journal on the API (CF7) | M2-10 ([#27](https://github.com/Adamniels/fodr-hackathon/issues/27)) |
| M2-12 | [#29](https://github.com/Adamniels/fodr-hackathon/issues/29) | chore | remove the demo account and example analyses, add a seed script | M2-11 ([#28](https://github.com/Adamniels/fodr-hackathon/issues/28)) |

## M3 AI hardening

AI calls are authenticated, validated, metered and cached, and extraction quality is guarded by CI.

| Slice | Issue | Type | Title | Depends on |
|---|---|---|---|---|
| M3-01 | [#30](https://github.com/Adamniels/fodr-hackathon/issues/30) | fix | AI routes require auth and validate requests with shared contracts | M2-12 ([#29](https://github.com/Adamniels/fodr-hackathon/issues/29)) |
| M3-02 | [#31](https://github.com/Adamniels/fodr-hackathon/issues/31) | feature | AI usage logging and per-user daily quotas | M3-01 ([#30](https://github.com/Adamniels/fodr-hackathon/issues/30)) |
| M3-03 | [#32](https://github.com/Adamniels/fodr-hackathon/issues/32) | feature | server-side explanation per saved plan (CF6) | M3-01 ([#30](https://github.com/Adamniels/fodr-hackathon/issues/30)) |
| M3-04 | [#33](https://github.com/Adamniels/fodr-hackathon/issues/33) | fix | AI profile fill only links products that exist (C8, CF3) | M3-01 ([#30](https://github.com/Adamniels/fodr-hackathon/issues/30)) |
| M3-05 | [#34](https://github.com/Adamniels/fodr-hackathon/issues/34) | chore | extraction eval gate in CI | M3-01 ([#30](https://github.com/Adamniels/fodr-hackathon/issues/30)) |

## M4 Product data

A curated, versioned product table is the only source the optimiser reads, edited through an admin view, and saved plans never change when products do.

| Slice | Issue | Type | Title | Depends on |
|---|---|---|---|---|
| M4-01 | [#35](https://github.com/Adamniels/fodr-hackathon/issues/35) | feature | versioned product tables and import | M2-10 ([#27](https://github.com/Adamniels/fodr-hackathon/issues/27)) |
| M4-02 | [#36](https://github.com/Adamniels/fodr-hackathon/issues/36) | feature | admin role and product administration (CF9) | M4-01 ([#35](https://github.com/Adamniels/fodr-hackathon/issues/35)) |
| M4-03 | [#37](https://github.com/Adamniels/fodr-hackathon/issues/37) | chore | curate the selectable product set | M4-02 ([#36](https://github.com/Adamniels/fodr-hackathon/issues/36)) |
| M4-04 | [#38](https://github.com/Adamniels/fodr-hackathon/issues/38) | chore | plans are reproducible across product changes (CF5): tests only, as #35 and #36 made it hold | M4-01 ([#35](https://github.com/Adamniels/fodr-hackathon/issues/35)) |

## M5 Beta readiness

Deployed in the EU, observable, accessible, GDPR-ready, and the first beta users invited.

| Slice | Issue | Type | Title | Depends on |
|---|---|---|---|---|
| M5-01 | [#39](https://github.com/Adamniels/fodr-hackathon/issues/39) | feature | invite-only sign up | M2-06 ([#23](https://github.com/Adamniels/fodr-hackathon/issues/23)) |
| M5-02 | [#40](https://github.com/Adamniels/fodr-hackathon/issues/40) | feature | export my data (CF8) | M2-11 ([#28](https://github.com/Adamniels/fodr-hackathon/issues/28)) |
| M5-03 | [#41](https://github.com/Adamniels/fodr-hackathon/issues/41) | feature | delete my account (CF8) | M2-11 ([#28](https://github.com/Adamniels/fodr-hackathon/issues/28)) |
| M5-04 | [#42](https://github.com/Adamniels/fodr-hackathon/issues/42) | feature | privacy notice, beta terms and plan disclaimers | M2-04 ([#21](https://github.com/Adamniels/fodr-hackathon/issues/21)) |
| M5-05 | [#43](https://github.com/Adamniels/fodr-hackathon/issues/43) | feature | error tracking in the EU | M2-02 ([#19](https://github.com/Adamniels/fodr-hackathon/issues/19)) |
| M5-06 | [#44](https://github.com/Adamniels/fodr-hackathon/issues/44) | fix | accessibility to WCAG 2.2 AA | M2-12 ([#29](https://github.com/Adamniels/fodr-hackathon/issues/29)) |
| M5-07 | [#45](https://github.com/Adamniels/fodr-hackathon/issues/45) | docs | hosting provider decision (ADR 0016) | M2-02 ([#19](https://github.com/Adamniels/fodr-hackathon/issues/19)) |
| M5-08 | [#46](https://github.com/Adamniels/fodr-hackathon/issues/46) | chore | production deployment pipeline | M5-07 ([#45](https://github.com/Adamniels/fodr-hackathon/issues/45)), M5-05 ([#43](https://github.com/Adamniels/fodr-hackathon/issues/43)) |
| M5-09 | [#47](https://github.com/Adamniels/fodr-hackathon/issues/47) | chore | beta launch | all of M5. |

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
