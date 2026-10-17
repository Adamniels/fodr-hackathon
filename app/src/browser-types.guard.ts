// Compile-time guard, never imported or run: `npm run typecheck` fails if a line below stops being a type error.
// The browser app's program sees only browser types (lib ES2020, DOM, vite/client), never Node's (#67).
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call --
   the lines below are deliberately untyped. */

// @ts-expect-error process is a Node global and does not exist in the browser.
export const nodeGlobal = process.env

// @ts-expect-error Node modules cannot be imported in browser code.
export { readFile } from 'node:fs/promises'

// @ts-expect-error Array.prototype.at is ES2022; lib stays ES2020 to match Vite's default build target.
export const es2022 = [1].at(-1)
