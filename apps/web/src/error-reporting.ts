// Error tracking (#43, ADR 0015): unexpected errors in the browser go to the web app's Sentry project in the EU region.
// Without VITE_SENTRY_DSN at build time nothing is sent, as in development and the tests. A report carries IDs only:
// the SDK collects nothing of its own (ERROR_DATA_COLLECTION) and every event goes through the shared scrubbing rules.
// A failed API call carries the request ID the API answered with, which links it to the API's report and log lines.
import * as Sentry from '@sentry/react'
import { ERROR_DATA_COLLECTION, scrubBreadcrumb, scrubEvent } from '@fodr/contracts/error-scrubbing'

let started = false

/** Before the app renders (main.tsx). Errors only: no tracing, no session replay. */
export function startErrorReporting(
  env: ImportMetaEnv = import.meta.env,
  transport?: Sentry.BrowserOptions['transport'],
): void {
  if (!env.VITE_SENTRY_DSN) return
  Sentry.init({
    dsn: env.VITE_SENTRY_DSN,
    environment: env.VITE_SENTRY_ENVIRONMENT ?? 'development',
    release: env.VITE_APP_VERSION,
    transport,
    dataCollection: ERROR_DATA_COLLECTION,
    beforeSend: (event) => scrubEvent(event),
    beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
  })
  started = true
}

export function reportError(error: unknown, requestId?: string | null): void {
  if (!started) return
  Sentry.withScope((scope) => {
    if (requestId) scope.setTag('request_id', requestId)
    Sentry.captureException(error)
  })
}

/** React's own report of an error no boundary caught (createRoot in main.tsx); the route boundaries report theirs. */
export const onUncaughtError: (error: unknown, errorInfo: { componentStack?: string }) => void = (error, errorInfo) => {
  if (started) Sentry.reactErrorHandler()(error, errorInfo)
}
