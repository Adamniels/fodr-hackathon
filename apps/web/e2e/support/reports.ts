// Report files for upload tests. The e2e API reads reports with a fake AI (apps/api/test/e2e-server.ts) that takes its
// answer from the file: the line `FODR-E2E-READING <json>`, after a real PDF signature so the API accepts the type.

export interface ReportFile {
  name: string
  mimeType: string
  buffer: Buffer
}

/** A PDF report the fake AI reads as `reading`, or fails on with `{ error: '<kind>' }`. */
export const reportWith = (reading: object, name = 'analys.pdf'): ReportFile => ({
  name,
  mimeType: 'application/pdf',
  buffer: Buffer.from(`%PDF-1.4\nFODR-E2E-READING ${JSON.stringify(reading)}\n%%EOF\n`),
})
