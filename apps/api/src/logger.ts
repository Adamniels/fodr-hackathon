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
