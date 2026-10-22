// Error tracking (#43, ADR 0015): unexpected errors go to the API's Sentry project in the EU region, linked to their log
// lines by the request ID. Without SENTRY_DSN nothing leaves the process. A report carries IDs only: the error is
// cleaned like a log line (a failed query without its SQL and parameters), and every event goes through the shared
// scrubbing rules before it is sent.
import * as Sentry from '@sentry/node'
import { ERROR_DATA_COLLECTION, scrubBreadcrumb, scrubEvent } from '@fodr/contracts/error-scrubbing'
import type { Config } from './config'
import { reportableError } from './logger'

export interface ErrorReport {
  requestId?: string
  userId?: string
}

export interface ErrorReporter {
  report: (error: unknown, context: ErrorReport) => void
  /** Sends what is still queued, before the process exits. */
  close?: () => Promise<void>
}

export const noErrorReporter: ErrorReporter = { report: () => undefined }

export function createErrorReporter(
  config: Pick<Config, 'errorTracking' | 'appVersion'>,
  transport?: Sentry.NodeOptions['transport'],
): ErrorReporter {
  const { dsn, environment } = config.errorTracking
  if (!dsn) return noErrorReporter
  // Errors only: no tracing, no instrumentation of other modules. The process handlers keep Node's own behaviour, an
  // uncaught exception or unhandled rejection ends the process, after it is reported.
  Sentry.initWithoutDefaultIntegrations({
    dsn,
    environment,
    release: config.appVersion,
    transport,
    dataCollection: ERROR_DATA_COLLECTION,
    integrations: [
      Sentry.onUncaughtExceptionIntegration(),
      Sentry.onUnhandledRejectionIntegration({ mode: 'strict' }),
      Sentry.linkedErrorsIntegration(),
      Sentry.dedupeIntegration(),
      Sentry.contextLinesIntegration(),
      Sentry.nodeContextIntegration(),
    ],
    beforeSend: (event) => scrubEvent(event),
    beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
  })
  return {
    report: (error, { requestId, userId }) => {
      Sentry.withScope((scope) => {
        if (requestId) scope.setTag('request_id', requestId)
        if (userId) scope.setUser({ id: userId })
        Sentry.captureException(reportableError(error))
      })
    },
    close: async () => {
      await Sentry.close(2000)
    },
  }
}
