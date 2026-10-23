// Error tracking (#43, ADR 0015): unexpected errors in the browser go to the web app's Sentry project in the EU region.
// Without VITE_SENTRY_DSN at build time nothing is sent, as in development and the tests. A report carries IDs only:
// the SDK collects no user, request or header data of its own (ERROR_DATA_COLLECTION) and every event goes through
// the shared scrubbing rules.
// A failed API call carries the request ID the API answered with, which links it to the API's report and log lines.
import * as Sentry from '@sentry/react'
import { ERROR_DATA_COLLECTION, scrubBreadcrumb, scrubEvent } from '@fodr/contracts/error-scrubbing'

let started = false

// What errors need, and only that: an allowlist, so a session per page load (BrowserSession), console output, the
// visitor's locale or whatever a later SDK version adds by default never comes along.
const INTEGRATIONS = new Set([
  'Breadcrumbs',
  'BrowserApiErrors',
  'Dedupe',
  'EventFilters',
  'FunctionToString',
  'GlobalHandlers',
  'HttpContext',
  'LinkedErrors',
])

/**
 * Before the app renders (main.tsx), and whether it started. Errors only: no tracing, no session replay, nothing sent
 * on a page load where nothing fails.
 */
export function startErrorReporting(
  env: ImportMetaEnv = import.meta.env,
  transport?: Sentry.BrowserOptions['transport'],
): boolean {
  if (!env.VITE_SENTRY_DSN) return false
  Sentry.init({
    dsn: env.VITE_SENTRY_DSN,
    environment: env.VITE_SENTRY_ENVIRONMENT || 'development',
    release: env.VITE_APP_VERSION || undefined,
    transport,
    integrations: (defaults) => defaults.filter((integration) => INTEGRATIONS.has(integration.name)),
    sendClientReports: false,
    dataCollection: ERROR_DATA_COLLECTION,
    beforeSend: (event) => scrubEvent(event),
    beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
  })
  started = true
  return true
}

/** A failed call: the API's request ID, and the path without its query (IDs only; a query may hold anything). */
export interface FailedCall {
  requestId?: string
  path?: string
}

export function reportError(error: unknown, call: FailedCall = {}): void {
  if (!started) return
  Sentry.withScope((scope) => {
    if (call.requestId) scope.setTag('request_id', call.requestId)
    if (call.path) scope.setTag('api_path', call.path)
    Sentry.captureException(error)
  })
}

/**
 * React's report of an error no boundary caught (createRoot in main.tsx, only once reporting started); the route
 * boundaries report theirs. It replaces React's default, which prints the error, so it prints it too.
 */
export const onUncaughtError = Sentry.reactErrorHandler((error) => {
  console.error(error)
})
