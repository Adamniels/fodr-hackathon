// Structured JSON logs (ADR 0015). Log IDs, never personal data or health notes.
import pino, { type DestinationStream, type Logger } from 'pino'
import type { Config } from './config'

export type { Logger }

export function createLogger(level: Config['logLevel'], destination?: DestinationStream): Logger {
  return pino({ level }, destination)
}
