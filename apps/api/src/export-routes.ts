// GET /api/v1/me/export (#40, CF8): everything the app holds about the signed-in user as one ZIP, built on request.
// An account's data is a few MB at most, so it is built in memory and sent at once. JSON keeps the data readable by
// other programs (GDPR portability); the reports are the files the user uploaded, as they were.
import { strToU8, zipSync, type Zippable } from 'fflate'
import { Hono } from 'hono'
import type { AppEnv } from './app'
import type { Auth } from './auth'
import { EXPORT_README } from './export-readme'
import type { ExportRepository } from './repositories/export'
import type { JournalRepository } from './repositories/journal'
import { requireUser, type UserVariables } from './session'
import type { FileStore } from './storage'

const EXTENSION: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

/** A folder name for the horse: its name in plain letters, and the start of its ID so two Sixtens stay apart. */
const folderOf = (name: string, id: string) => {
  const plain = name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `horses/${plain || 'hast'}-${id.slice(0, 8)}`
}

const json = (value: unknown) => strToU8(`${JSON.stringify(value, null, 2)}\n`)

export function exportRoutes({
  auth,
  exports,
  journal,
  files,
}: {
  auth: Auth
  exports: ExportRepository
  journal: JournalRepository
  files: FileStore
}) {
  const routes = new Hono<AppEnv & { Variables: UserVariables }>()
  routes.use(requireUser(auth))

  routes.get('/', async (c) => {
    const user = c.get('user')
    const data = await exports.forUser(user)
    const archive: Zippable = {
      'README.txt': strToU8(EXPORT_README),
      'account.json': json(data.account),
      'ai-usage.json': json(data.aiUsage),
    }
    for (const { horse, analyses, reports, plans } of data.horses) {
      const folder = folderOf(horse.namn, horse.id)
      archive[`${folder}/profile.json`] = json(horse)
      archive[`${folder}/analyses.json`] = json(analyses)
      archive[`${folder}/plans.json`] = json(plans)
      archive[`${folder}/journal.json`] = json((await journal.list(user, horse.id)) ?? [])
      for (const report of reports) {
        const extension = EXTENSION[report.mediaType] ?? 'bin'
        // Stored as they are: reports are compressed formats already.
        archive[`${folder}/reports/${report.analysisId}.${extension}`] = [await files.get(report.key), { level: 0 }]
      }
    }
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' })
    return c.body(zipSync(archive, { level: 6 }), 200, {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="fodr-export-${today}.zip"`,
      'Cache-Control': 'no-store',
    })
  })

  return routes
}
