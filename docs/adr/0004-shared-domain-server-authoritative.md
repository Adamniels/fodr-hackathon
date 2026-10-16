# 0004. Shared pure domain package, server authoritative

Status: Accepted. Date: 2026-10-16.

## Context

A plan depends on the profile, the analysis and the product data, and must update whenever one of them changes. Today it is computed in the browser on every change (measured 2026-10-16: about 56 ms per plan on a recent Mac, almost all in the optimiser). The spec requires saved plans to be reproducible (CF5) and product data to be curated and versioned on the server (CF9).

## Decision

The calculation engine lives in `packages/domain` as **pure functions**: input in, result out, no I/O (no `fetch`, storage, timers, Node or DOM APIs). The same code runs in two places:

- **Browser:** live previews while the user edits, using a cached, versioned product snapshot fetched from the API.
- **Server:** every plan that is saved is computed by the API, which records the engine version and the product data version with it. The server result is the truth; after saving, the UI shows what the server computed.

## Alternatives

- **Server only.** One place to compute, but every edit costs an estimated 0.3 to 1.5 s on a mobile connection (network, small shared CPU, a database waking from scale to zero), plus debouncing, out of order responses, loading states and no offline behaviour. Would become the right choice if product data turned confidential (for example negotiated supplier prices), since it could then never reach the browser.
- **Browser only (today).** Fast, but saved plans cannot be trusted or reproduced, product data must ship in the bundle, and server features (reminders, exports, stable views) would have no engine.

## Consequences

- A lint rule restricts imports in `packages/domain` so it stays pure.
- The API exposes a product snapshot endpoint with a version, cached by the client.
- A stale browser tab can preview with an older engine; harmless, because the saved plan is always the server's.
- If previews are slow on low end phones, the engine moves into a Web Worker without architectural change.
