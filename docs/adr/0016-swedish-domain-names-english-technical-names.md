# 0016. Swedish names for the domain, English names for the software

Status: Accepted. Date: 2026-10-20.

## Context

The hackathon proof of concept was written in Swedish throughout. When the project moved towards a beta, `docs/glossary.md` and `.claude/CLAUDE.md` kept one sentence of policy: the code keeps the Swedish horse feeding vocabulary as its domain language, and new technical code is in English. No ADR recorded why, and the line between the two was never drawn. The code shows it:

- technical helpers in Swedish next to English ones in one file (`tal`, `kr`, `etikett` beside `parseDecimal` in `apps/web/src/format.ts`)
- domain modules named in both languages (`raser.ts`, `byten.ts` beside `analysis.ts`, `nutrients.ts`)
- software concepts named in Swedish (`DomanFel`, `Startsida`, `loggaIn`, `laddaHastar`)

Keeping Swedish domain names has real reasons. The requirements come from SLU Rapport 289, which is in Swedish, so `smbRp` or `Bytekanslighet` maps onto an SLU table without a translation step where errors can enter. Several terms have no exact English equivalent: hösilage, schablon, lösdrift. The users, the feed labels and the laboratory reports are Swedish, and so are the AI prompts. It also has costs: two languages in one codebase; identifiers without å, ä and ö that can be ambiguous (`Hastprofil`, `fang`, `'ho'`); and a barrier for readers and reviewers who do not read Swedish.

## Decision

1. **Swedish for what the domain is about.** An identifier whose concept is a term in `docs/glossary.md` is Swedish throughout. That covers domain types, their fields and values, constants holding domain data, and functions that compute a domain result: `Hastprofil`, `viktKg`, `'hosilage'`, `demoHast`, `beraknaBehov`, `skapaPlan`, `valjProdukter`. Generic structural words follow the concept they belong to: `Balansrad`, `Injusteringssteg`, `Kvalitetsflagga`. The concept needs a glossary row, the other words in the name do not: `kraverLagSockerStarkelse` is about a sensitivity, and socker has no row of its own.
2. **English for how the software works.** Everything else is English, even when it handles domain data: UI components, formatting, i18n, storage, the API client and server, authentication, errors, message envelopes, scripts and tooling. Such a name refers to a domain concept with the glossary's English column: `HorseStep`, `loadHorses`, `explainPlan`, `bodyConditionText`, `DomainError`, `LandingPage`.
3. **One language per identifier.** The concept decides, so no identifier mixes Swedish and English words (`hullText` becomes `bodyConditionText`, `AtgardMeddelande` becomes `ActionMessage`).
4. **File names are English**, also in `packages/domain`, so the file tree reads as a map for every reader. The symbols inside follow rules 1 to 3: `transition.ts` exports `skapaInjustering`. Acronyms stay as they are (`slu.ts`).
5. **ASCII only.** Identifiers drop the diacritics (å→a, ä→a, ö→o). The glossary's "In code" column records the exact form, which settles ambiguous cases such as `fang`.
6. **The glossary is the list of domain terms.** A Swedish identifier needs a glossary row, so introducing a new Swedish name means adding the row in the same change.
7. **Data contracts keep their names.** Persisted values (`'hosilage'`, `'brist'`), storage keys, and the field names in AI schemas and prompts are contracts with stored data or the model. Renaming one needs a migration or a prompt check, and is never part of a naming refactor.
8. **Review enforces it.** No lint rule: one would have to guess what an identifier is about. `.claude/CLAUDE.md` states the rule and links here.

## Alternatives

- **Swedish for everything in `packages/domain`, English in `apps/web`.** It is simple to state, but it makes plumbing such as `DomanFel` Swedish, renames domain names that are already English (`NUTRIENTS`, `NutrientKey`), and gives no answer for domain names in the web app.
- **English everywhere.** It suits readers who do not read Swedish, but it breaks the direct link to SLU's tables and the users' vocabulary, and it means a rename across almost every file.
- **The rule for new code only.** It costs nothing now, but existing names never change, because a rename cannot ride along in a fix or feature PR.
- **File names following rules 1 to 3.** It is as much churn in the other direction (`forage.ts` to `grovfoder.ts`) and worse for navigation.

## Consequences

- An agent or contributor decides any new name by looking up its concept in the glossary.
- Existing names are brought in line in a separate refactor (#88). It renames files and identifiers only, never data contracts.
- The glossary grows to cover the domain terms already in use, so it becomes the complete vocabulary of the domain.
- Readers who do not read Swedish can navigate by file names and technical code, and use the glossary for domain names.
