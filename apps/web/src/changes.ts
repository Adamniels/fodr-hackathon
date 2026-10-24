// What differs between the page's copy of a record and the server's, when a save was refused because the server's copy
// changed since the page read it (#140): each changed value by its path, for the notice that shows both.

type Value = unknown

const isRecord = (v: Value): v is Record<string, Value> => typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * The paths of the values that differ between two records, in the order the first one lists them (then the second's
 * own). Objects are compared field by field; a list is one value, named whole when anything in it differs. A value one
 * side lacks differs from any value, 0 included. `ignore` leaves out top-level fields such as the version.
 */
export function changedFields(mine: Value, theirs: Value, ignore: readonly string[] = []): string[] {
  const walk = (a: Value, b: Value, path: string): string[] => {
    if (isRecord(a) || isRecord(b)) {
      const left = isRecord(a) ? a : {}
      const right = isRecord(b) ? b : {}
      const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])]
      return keys
        .filter((k) => path !== '' || !ignore.includes(k))
        .flatMap((k) => walk(left[k], right[k], path === '' ? k : `${path}.${k}`))
    }
    return same(a, b) ? [] : [path]
  }
  return walk(mine, theirs, '')
}

/** Deep equality, whatever the order of an object's keys (Postgres keeps jsonb keys in its own order). */
function same(a: Value, b: Value): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => same(v, b[i]))
  }
  if (isRecord(a) || isRecord(b)) {
    if (!isRecord(a) || !isRecord(b)) return false
    const keys = new Set([...Object.keys(a), ...Object.keys(b)])
    return [...keys].every((k) => same(a[k], b[k]))
  }
  return Object.is(a, b)
}
