// What an error report may carry (#43, ADR 0015): IDs, never personal data or what a user wrote. Both apps run every
// Sentry event and breadcrumb through these before it leaves (beforeSend, beforeBreadcrumb), so the rule lives in one
// place. The types are the fields Sentry's own types have, so the functions take Sentry's events as they are.

/**
 * What the Sentry SDKs may collect on their own (their `dataCollection` option, whose defaults collect nearly
 * everything): nothing but the request ID header. The scrubbing below is the second line, for what reaches an event
 * another way, such as an error's message.
 */
export const ERROR_DATA_COLLECTION = {
  userInfo: false,
  cookies: false,
  httpHeaders: { request: { allow: ['x-request-id'] }, response: { allow: ['x-request-id'] } },
  httpBodies: [],
  urlQueryParams: false,
  graphQL: { document: false, variables: false },
  genAI: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  stackFrameVariables: false,
}

export interface ScrubbableEvent {
  message?: string
  exception?: { values?: { value?: string }[] }
  request?: {
    url?: string
    method?: string
    headers?: Record<string, string>
    data?: unknown
    query_string?: unknown
    cookies?: unknown
    env?: unknown
  }
  user?: { id?: string | number }
  extra?: unknown
  breadcrumbs?: ScrubbableBreadcrumb[]
}

export interface ScrubbableBreadcrumb {
  category?: string
  message?: string
  data?: Record<string, unknown>
}

// The one header that links a report to its log lines and to the other app's report.
const KEPT_HEADER = 'x-request-id'
// What a request or navigation breadcrumb needs to say which call failed; sizes, bodies and the rest are dropped.
const KEPT_BREADCRUMB_DATA = ['url', 'method', 'status_code', 'from', 'to']
const PATHS = new Set(['url', 'from', 'to'])
const EMAIL = /[^\s@<>"'(),;:]+@[^\s@<>"'(),;:]+\.[a-z]{2,}/gi

const withoutQuery = (url: string) => url.split(/[?#]/, 1)[0] ?? ''
const withoutEmails = (text: string) => text.replace(EMAIL, '[email]')

/** The event without anything personal, changed in place and returned (as Sentry's beforeSend expects). */
export function scrubEvent<E extends ScrubbableEvent>(event: E): E {
  const e: ScrubbableEvent = event
  if (e.message !== undefined) e.message = withoutEmails(e.message)
  for (const value of e.exception?.values ?? []) {
    if (value.value !== undefined) value.value = withoutEmails(value.value)
  }
  if (e.request) {
    const { url, method, headers } = e.request
    const kept = Object.entries(headers ?? {}).filter(([name]) => name.toLowerCase() === KEPT_HEADER)
    e.request = {
      ...(url !== undefined && { url: withoutQuery(url) }),
      ...(method !== undefined && { method }),
      ...(kept.length > 0 && { headers: Object.fromEntries(kept) }),
    }
  }
  if (e.user) e.user = e.user.id === undefined ? {} : { id: e.user.id }
  delete e.extra
  if (e.breadcrumbs) {
    e.breadcrumbs = e.breadcrumbs.map(scrubBreadcrumb).filter((b): b is ScrubbableBreadcrumb => b !== null)
  }
  return event
}

/** The breadcrumb without anything personal, or null to drop it (as Sentry's beforeBreadcrumb expects). */
export function scrubBreadcrumb<B extends ScrubbableBreadcrumb>(breadcrumb: B): B | null {
  // Console output may print anything, a horse's notes included.
  if (breadcrumb.category === 'console') return null
  const b: ScrubbableBreadcrumb = breadcrumb
  if (b.message !== undefined) b.message = withoutEmails(b.message)
  if (b.data) {
    b.data = Object.fromEntries(
      Object.entries(b.data)
        .filter(([key]) => KEPT_BREADCRUMB_DATA.includes(key))
        .map(([key, value]) => [key, PATHS.has(key) && typeof value === 'string' ? withoutQuery(value) : value]),
    )
  }
  return breadcrumb
}
