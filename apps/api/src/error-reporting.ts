// Error tracking (#43, ADR 0015): unexpected errors go to the API's Sentry project in the EU region, linked to their
// log lines by the request ID. Without SENTRY_DSN nothing leaves the process. A report carries IDs only: the SDK
// collects no user, request or header data of its own (ERROR_DATA_COLLECTION), every error is cleaned like a log line
// and stricter (a failed
// query without its SQL and parameters, a Postgres error without its message), and every event goes through the
// shared scrubbing rules before it is sent.
import * as Sentry from '@sentry/node'
import { ERROR_DATA_COLLECTION, scrubBreadcrumb, scrubEvent } from '@fodr/contracts/error-scrubbing'
import type { Config } from './config'
import { reportableError } from './logger'

export interface ErrorReport {
  requestId?: string
  userId?: string
  /** The route's pattern (/api/v1/horses/:id), which holds no IDs. */
  route?: string
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
  // Errors only: no tracing, no instrumentation of other modules, no host name. The process handlers keep Node's own
  // behaviour, an uncaught exception or unhandled rejection ends the process, after it is reported.
  Sentry.initWithoutDefaultIntegrations({
    dsn,
    environment,
    release: config.appVersion,
    transport,
    enableRuntimeChannelInjection: false,
    includeServerName: false,
    dataCollection: ERROR_DATA_COLLECTION,
    integrations: [
      Sentry.onUncaughtExceptionIntegration(),
      Sentry.onUnhandledRejectionIntegration({ mode: 'strict' }),
      Sentry.linkedErrorsIntegration(),
      Sentry.dedupeIntegration(),
      Sentry.contextLinesIntegration(),
      Sentry.nodeContextIntegration(),
    ],
    // Every event, the crashes the SDK captures itself included, is cleaned here rather than where it is reported.
    beforeSend: (event, hint) => scrubEvent(cleanExceptions(event, hint.originalException)),
    beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
  })
  return {
    report: (error, { requestId, userId, route }) => {
      Sentry.withScope((scope) => {
        if (requestId) scope.setTag('request_id', requestId)
        if (route) scope.setTag('route', route)
        if (userId) scope.setUser({ id: userId })
        Sentry.captureException(error)
      })
    },
    close: async () => {
      await Sentry.close(2000)
    },
  }
}

// Each exception of the event (Sentry lists the cause chain deepest first, the error itself last) gets the type and
// message of the error as the logs' rules allow it (reportableError): a failed query without its SQL and parameters.
function cleanExceptions(event: Sentry.ErrorEvent, original: unknown): Sentry.ErrorEvent {
  let error = reportableError(original)
  for (const value of [...(event.exception?.values ?? [])].reverse()) {
    if (error instanceof Error) {
      value.type = error.name
      value.value = error.message
      error = error.cause
    }
    // Whatever the chain did not cover: a failed query's message never leaves, however it was captured.
    if (value.value?.startsWith('Failed query')) value.value = 'Failed query'
  }
  return event
}
