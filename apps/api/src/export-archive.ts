// The ZIP of a user's export (#40, CF8), streamed: the JSON files are small and written as they come; each report flows
// from the file store into the archive and out to the browser, so an export of many large reports never sits in
// memory whole. A report the store cannot open (an operations incident) is left out and listed in
// missing-reports.json, rather than failing an export the user is entitled to.
import { strToU8, Zip, ZipDeflate, ZipPassThrough } from 'fflate'
import { EXPORT_README } from './export-readme'
import type { UserExport } from './repositories/export'
import type { FileStore } from './storage'

const EXTENSIONS: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

export const extensionOf = (mediaType: string) => EXTENSIONS[mediaType] ?? 'bin'

/** A folder name for the horse: its name in plain letters, and the start of its ID so two of one name stay apart. */
export function folderOf(name: string, id: string): string {
  const plain = name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `horses/${plain || 'horse'}-${id.slice(0, 8)}`
}

const json = (value: unknown) => strToU8(`${JSON.stringify(value, null, 2)}\n`)

/** The export as a stream of ZIP bytes; `onMissing` hears of each report left out. */
export function exportArchive(
  data: UserExport,
  files: FileStore,
  onMissing: (report: { horseId: string; analysisId: string }, err: unknown) => void,
): ReadableStream<Uint8Array> {
  const zip = new Zip()
  return new ReadableStream<Uint8Array>({
    start(controller) {
      zip.ondata = (err, chunk, final) => {
        if (err) controller.error(err)
        else {
          controller.enqueue(chunk)
          if (final) controller.close()
        }
      }
      const add = (name: string, bytes: Uint8Array) => {
        const entry = new ZipDeflate(name, { level: 6 })
        zip.add(entry)
        entry.push(bytes, true)
      }
      void (async () => {
        try {
          add('README.txt', strToU8(EXPORT_README))
          add('account.json', json(data.account))
          add('sessions.json', json(data.sessions))
          add('ai-usage.json', json(data.aiUsage))
          const missing: { horseId: string; analysisId: string }[] = []
          for (const { horse, analyses, reports, plans, journal } of data.horses) {
            const folder = folderOf(horse.namn, horse.id)
            add(`${folder}/profile.json`, json(horse))
            add(`${folder}/analyses.json`, json(analyses))
            add(`${folder}/plans.json`, json(plans))
            add(`${folder}/journal.json`, json(journal))
            for (const report of reports) {
              let body: ReadableStream<Uint8Array>
              try {
                body = await files.open(report.key)
              } catch (err) {
                missing.push({ horseId: horse.id, analysisId: report.analysisId })
                onMissing({ horseId: horse.id, analysisId: report.analysisId }, err)
                continue
              }
              // Stored as they are: reports are compressed formats already.
              const entry = new ZipPassThrough(
                `${folder}/reports/${report.analysisId}.${extensionOf(report.mediaType)}`,
              )
              zip.add(entry)
              for await (const chunk of body) entry.push(chunk)
              entry.push(new Uint8Array(0), true)
            }
          }
          if (missing.length > 0) add('missing-reports.json', json(missing))
          zip.end()
        } catch (err) {
          // Partway through, the response has started: all that can be done is to end it as broken.
          zip.terminate()
          controller.error(err)
        }
      })()
    },
    cancel() {
      zip.terminate()
    },
  })
}
