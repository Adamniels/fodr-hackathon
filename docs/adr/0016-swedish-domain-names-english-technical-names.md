# 0016. Swedish names for the domain, English names for the software

Status: Accepted. Date: 2026-10-20.

## Context

The hackathon proof of concept was written in Swedish throughout. When the project moved towards a beta, `docs/glossary.md` and `.claude/CLAUDE.md` kept one sentence of policy: the code keeps the Swedish horse feeding vocabulary as its domain language, and new technical code is in English. No ADR recorded why, and the line between the two was never drawn. The code shows it:

- technical helpers in Swedish next to English ones in one file (`tal`, `kr`, `etikett` beside `parseDecimal` in `apps/web/src/format.ts`)
- domain modules named in both languages (`raser.ts`, `byten.ts` beside `analysis.ts`, `nutrients.ts`)
- software concepts named in Swedish (`DomanFel`, `Startsida`, `loggaIn`, `laddaHastar`)

Keeping Swedish domain names has real reasons. The requirements come from SLU Rapport 289, which is in Swedish, so `smbRp` or `Arbetsniva` maps onto an SLU table (table 9 for the work level) without a translation step where errors can enter. Several terms have no exact English equivalent: hösilage, schablon, lösdrift. The users, the feed labels and the laboratory reports are Swedish, and so are the AI prompts. It also has costs: two languages in one codebase; identifiers without å, ä and ö that can be ambiguous (`Hastprofil`, `fang`, `'ho'`); and a barrier for readers and reviewers who do not read Swedish.

## Decision

1. **Swedish for what the domain is about.** An identifier whose concept is a term in `docs/glossary.md` is Swedish throughout. That covers domain types, their fields and values, constants holding domain data, and functions that compute, build or order domain values: `Hastprofil`, `viktKg`, `'hosilage'`, `demoHast`, `beraknaBehov`, `skapaPlan`, `valjProdukter`, `nyPost`, `sorteradePoster`. The concept decides, not the grammatical head of the word: `Hastprofil` is about a horse, `Balansrad` about the nutrient balance, `kraverLagSockerStarkelse` about the horse's health. Generic structural words (rad, steg, post, flagga) follow their concept, and the other words in the name need no glossary row of their own.
2. **English for how the software works.** Everything else is English, even when it handles domain data: UI components, formatting and display, i18n, storage, the API client and server, authentication, errors, message envelopes, scripts and tooling. Such a name refers to a domain concept with the glossary's English column: `HorseStep`, `loadHorses`, `explainPlan`, `bodyConditionText`, `DomainError`, `LandingPage`. What a name is about decides, not the file it lives in: a constant of domain data in a web helper module is still rule 1.
3. **One language per identifier.** No identifier mixes Swedish and English words (`UrvalsInput` becomes `UrvalsIndata`). Words spelled the same in both languages (plan, status, trend, journal, text, demo, id) are neutral and take the language of the rest of the name.
4. **File names are English**, also in `packages/domain`, so the file tree reads as a map for every reader. The symbols inside follow rules 1 to 3: `transition.ts` exports `skapaInjustering`. Acronyms stay as they are (`slu.ts`).
5. **ASCII only.** Identifiers drop the diacritics (å→a, ä→a, ö→o). The glossary's "In code" column records the exact form, which settles ambiguous cases such as `fang`. A name whose ASCII form reads as either language is renamed (`schablonFor`, where "For" can be "för" or "for").
6. **The glossary is the list of domain terms.** A Swedish identifier needs its concept in the glossary, and a new Swedish name adds the row in the same change. A term belongs there when it comes from SLU Rapport 289 or Swedish horse feeding practice, not when it is a general word (kostnad, lista, namn).
7. **Contracts keep their names.** These are never renamed in a naming refactor, because each one is shared with something outside the code being renamed:
   - persisted values and field names: everything stored as JSON, such as `Hastprofil`, `Journalpost` and the account records, and the storage keys
   - the request and response fields and route paths between the web app and its server
   - every field that reaches the model, in an AI schema or serialised into a prompt
   - i18n keys

   Renaming one needs a migration, or the AI evaluation for fields the model reads. A renamed technical type keeps its field names.
8. **One recorded exception.** The nutrient table and its types keep their English names (`NUTRIENTS`, `NutrientKey`, `NUTRIENT_KEYS`, `NutrientValues`). They are used in every layer, and their keys are already the glossary's Swedish forms (`'energi'`, `'smbRp'`), so renaming them would touch almost every file for little gain. Swedish names about nutrients use ämne (`styrandeAmnen`).
9. **Review enforces it.** No lint rule: one would have to guess what an identifier is about. `.claude/CLAUDE.md` states the rule and links here.

## Alternatives

- **Swedish for everything in `packages/domain`, English in `apps/web`.** It is simple to state, but it makes plumbing such as `DomanFel` Swedish, renames the nutrient types, and gives no answer for domain names in the web app.
- **Swedish for types and data fields, English for all functions.** It is easy to apply, but it renames the domain's core functions (`beraknaBehov`, `skapaPlan`, `valjProdukter`) away from the vocabulary of the types they compute.
- **The grammatical head noun decides.** It looks mechanical, but it fails on Swedish compounds (the head of `Hastprofil` is "profil") and keeps technical work Swedish whenever its object is a domain term (`laddaHastar`).
- **English everywhere.** It suits readers who do not read Swedish, but it breaks the direct link to SLU's tables and the users' vocabulary, and it means a rename across almost every file.
- **The rule for new code only.** It costs nothing now, but existing names never change, because a rename cannot ride along in a fix or feature PR.
- **File names following rules 1 to 3.** It is as much churn in the other direction (`forage.ts` to `grovfoder.ts`) and worse for navigation.

## Consequences

- An agent or contributor decides any new name by looking up its concept in the glossary.
- Existing names are brought in line in a separate refactor (#88). It renames files and identifiers only, never contracts (rule 7).
- The glossary grows to cover the domain terms already in use, so it becomes the complete vocabulary of the domain.
- Readers who do not read Swedish can navigate by file names and technical code, and use the glossary for domain names.
