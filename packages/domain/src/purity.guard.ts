// Compile-time and lint guard, never imported or run. Each line below must stay an error: typecheck fails on an
// unused @ts-expect-error, and lint fails on an unused eslint-disable directive (ADR 0004, #9).
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access,
   @typescript-eslint/no-unsafe-call -- the lines below are deliberately untyped. */

// @ts-expect-error fetch is a platform API: the package has no DOM lib.
export const io = fetch // eslint-disable-line no-restricted-globals -- deliberate, guards the purity rule

// @ts-expect-error process is a Node global.
export const nodeGlobal = process.env // eslint-disable-line no-restricted-globals -- deliberate, guards the purity rule

// @ts-expect-error Node modules are not available to the pure engine.
export { readFile } from 'node:fs/promises' // eslint-disable-line no-restricted-imports -- deliberate, guards the purity rule

// @ts-expect-error Array.prototype.at is ES2022; lib stays ES2020 to match the web app's build target.
export const es2022 = [1].at(-1)
