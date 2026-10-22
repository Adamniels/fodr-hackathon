// An error reporter that records what the app reports, for tests (#43).
import type { ErrorReport, ErrorReporter } from '../src/error-reporting'

export function recordingErrorReporter(): ErrorReporter & { reports: { error: unknown; context: ErrorReport }[] } {
  const reports: { error: unknown; context: ErrorReport }[] = []
  return {
    reports,
    report: (error, context) => {
      reports.push({ error, context })
    },
  }
}
