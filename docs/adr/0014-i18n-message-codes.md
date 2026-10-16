# 0014. i18n: message codes and react-i18next

Status: Accepted. Date: 2026-10-16.

## Context

The spec prepares for English after the beta. Today the domain itself produces finished Swedish sentences (for example in `plan.ts`, `kanslighet.ts`, `kvalitet.ts`) and UI strings are inline in components.

## Decision

- **The domain returns message codes with parameters**, never sentences: for example `{ code: "action.remove_concentrate", params: { product: "...", gramsPerDay: 1000 } }`. SLU source references are data too.
- **The web app** renders all text through **react-i18next** (17.x, with i18next 26.x). The beta ships with a Swedish catalogue only; English is a later translation file.
- **AI prompts** stay Swedish for the beta; the response language becomes a parameter when English ships.
- Numbers, dates and money are formatted with `Intl` for the active locale, never by hand.

## Alternatives

- **A tiny own `t()` helper.** Fewer dependencies, but plurals, interpolation and lazy loading become our code.
- **Keep Swedish sentences in the domain.** English would require a second engine or string parsing.

## Consequences

- Moving the domain to codes is a behaviour preserving refactor in M1, guarded by unit tests and the e2e suite (rendered text stays identical).
- Unit tests of the domain assert codes and parameters instead of sentences, which makes them less brittle.
