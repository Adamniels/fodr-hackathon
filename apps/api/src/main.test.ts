import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const API_DIR = fileURLToPath(new URL('..', import.meta.url))

// Starts the real entry point with only the given variables (plus PATH), as `npm start` would.
function start(env: Record<string, string>) {
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/main.ts'], {
    cwd: API_DIR,
    env: { PATH: process.env.PATH, ...env },
  })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (d: Buffer) => (stdout += d.toString()))
  child.stderr.on('data', (d: Buffer) => (stderr += d.toString()))
  const exited = new Promise<number | null>((resolve) => child.on('exit', resolve))
  return { child, exited, output: () => ({ stdout, stderr }) }
}

describe('the API process', () => {
  it('stops at startup with a clear message when DATABASE_URL is missing', async () => {
    const api = start({})
    expect(await api.exited).toBe(1)
    expect(api.output().stderr).toMatch(/Invalid configuration[\s\S]*DATABASE_URL is required/)
  })

  it('serves health, then stops cleanly on SIGTERM', async () => {
    const api = start({
      // Nothing listens there either: the API serves health before its database answers, whatever a local one holds
      // (its product catalogue is checked once the database answers, #35).
      DATABASE_URL: 'postgres://fodr:fodr@127.0.0.1:1/fodr',
      PORT: '0',
      BETTER_AUTH_SECRET: 'a-test-secret-of-at-least-32-characters',
      BETTER_AUTH_URL: 'http://localhost:3000',
      SMTP_HOST: 'localhost',
      SMTP_PORT: '1025',
      MAIL_FROM: 'Fodr <no-reply@fodr.test>',
      // Nothing listens there: the API starts without reaching its file store.
      AI_PRICE_SEK_PER_MTOK_INPUT: '30',
      AI_PRICE_SEK_PER_MTOK_OUTPUT: '150',
      S3_ENDPOINT: 'http://127.0.0.1:1',
      S3_BUCKET: 'fodr',
      S3_ACCESS_KEY_ID: 'fodr',
      S3_SECRET_ACCESS_KEY: 'fodr-dev-secret',
    })
    const port = await new Promise<number>((resolve, reject) => {
      api.child.stdout.on('data', () => {
        const line = api
          .output()
          .stdout.split('\n')
          .find((l) => l.includes('"listening"'))
        if (line) resolve((JSON.parse(line) as { port: number }).port)
      })
      void api.exited.then(() => reject(new Error(`exited early: ${api.output().stderr}`)))
    })
    const res = await fetch(`http://127.0.0.1:${port}/api/v1/health`)
    expect(res.status).toBe(200)
    api.child.kill('SIGTERM')
    expect(await api.exited).toBe(0)
  })
})
