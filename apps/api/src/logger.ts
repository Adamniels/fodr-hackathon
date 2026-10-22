// Structured JSON logs to stdout (ADR 0015). Log IDs, never personal data or health notes. No pino transports: they
// load worker files from disk, which the esbuild bundle (build.mjs) does not ship.
import { DrizzleQueryError } from 'drizzle-orm'
import { DatabaseError } from 'pg'
import pino, { type DestinationStream, type Logger } from 'pino'
import type { Config } from './config'

export type { Logger }

export function createLogger(level: Config['logLevel'], destination?: DestinationStream): Logger {
  return pino({ level, serializers: { err: serializeError } }, destination)
}

interface LoggedError {
  type: string
  message?: string
  stack?: string
  code?: string
  constraint?: string
  table?: string
  column?: string
  cause?: LoggedError | string
}

// Replaces pino's default, which copies every property and folds each cause's message into the logged one. A failed
// query's message holds its SQL and parameters, and a Postgres error's `detail` holds row values, so neither is
// logged; the error type, Postgres code and constraint, and the stack frames identify the failure.
export function serializeError(err: unknown): LoggedError | string {
  if (!(err instanceof Error)) return typeof err
  const type = err.constructor.name
  const cause = err.cause === undefined ? undefined : serializeError(err.cause)
  if (err instanceof DrizzleQueryError) {
    // The stack starts with the message, over several lines; only the frames are kept.
    return { type, stack: stackFrames(err.stack), cause }
  }
  if (err instanceof DatabaseError) {
    const { message, stack, code, constraint, table, column } = err
    return { type, message, stack, code, constraint, table, column, cause }
  }
  return { type, message: err.message, stack: err.stack, cause }
}

function stackFrames(stack: string | undefined): string | undefined {
  return stack
    ?.split('\n')
    .filter((line) => line.startsWith('    at '))
    .join('\n')
}

// The error as an error report may carry it (error-reporting.ts, #43), stricter than the log line above: a failed
// query keeps its type and stack frames, not its SQL or parameters; a Postgres error keeps its code and constraint,
// not its message or the row values in `detail`. The cause chain is copied the same way, as Sentry links causes.
export function reportableError(error: unknown): unknown {
  if (!(error instanceof Error)) return error
  const name = error.constructor.name
  const cause = error.cause === undefined ? undefined : { cause: reportableError(error.cause) }
  if (error instanceof DrizzleQueryError) {
    const copy = new Error('Failed query', cause)
    copy.name = name
    copy.stack = `${name}: Failed query\n${stackFrames(error.stack) ?? ''}`
    return copy
  }
  // Postgres quotes the input it refused in some messages (invalid input syntax for type uuid: "..."), so a report
  // names the error by its code and constraint only.
  const message =
    error instanceof DatabaseError
      ? [error.code, error.constraint].filter(Boolean).join(' ') || 'Database error'
      : error.message
  const copy = new Error(message, cause)
  copy.name = name
  copy.stack = error.stack
  return copy
}
