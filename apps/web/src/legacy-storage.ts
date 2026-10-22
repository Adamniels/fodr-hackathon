// Data the browser kept before the real backend (#23 to #29): the mock accounts, the demo, horses, journals and plan
// explanations. Nothing reads it any more, and some of it is health notes, so it is removed once at startup. The only
// module allowed to touch localStorage besides preferences (eslint.config.js).
const KEYS = ['krubba.konton.v1', 'krubba.session.v1', 'fodr.demo.v1']
const PREFIXES = ['krubba.hastar.v2.', 'krubba.journal.v1.', 'fodr.forklaring.v1.']

export function forgetLocalData(): void {
  try {
    const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i))
    for (const key of keys) {
      if (key && (KEYS.includes(key) || PREFIXES.some((prefix) => key.startsWith(prefix)))) localStorage.removeItem(key)
    }
  } catch {
    // Storage blocked: nothing to remove.
  }
}
