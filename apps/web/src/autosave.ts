// Autosave for forms that change a record on every keystroke (horses #25, analysis corrections #26): the page shows
// each edit at once, and the server gets the latest one when the typing pauses.

/**
 * Where a record's edits are: on their way to the server, saved, failed and kept for a retry, or refused by the server
 * as invalid, which a retry cannot change.
 */
export type SaveState = 'saving' | 'saved' | 'failed' | 'refused'

/**
 * Saves each record's latest edit, by its id, once the edits pause for `delayMs`. One save per record is in flight at a
 * time, and the next one sends the newest edit, so an older edit can never reach the server after a newer one. A failed
 * edit is kept for retry() unless a newer edit, which holds its changes too, is waiting. `refused` tells a failure no retry can
 * fix (the server called the edit invalid) from one that may pass later.
 */
export class AutoSaver<T extends { id: string }> {
  private readonly waiting = new Map<string, T>()
  private readonly failed = new Map<string, { record: T; refused: boolean }>()
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>()
  private readonly inFlight = new Map<string, Promise<void>>()
  // Set by a flush with keepalive (logging out, #169): every save from then on outlives the page, also an edit that
  // waits behind a save on its way.
  private keepalive = false

  private readonly save: (record: T, keepalive: boolean) => Promise<void>
  private readonly onState: (id: string, state: SaveState) => void
  private readonly delayMs: number
  private readonly refused: (error: unknown) => boolean

  constructor(
    save: (record: T, keepalive: boolean) => Promise<void>,
    onState: (id: string, state: SaveState) => void,
    delayMs = 600,
    refused: (error: unknown) => boolean = () => false,
  ) {
    this.save = save
    this.onState = onState
    this.delayMs = delayMs
    this.refused = refused
  }

  /** Whether any edit is waiting, on its way, or failed: the server may not hold what the page shows. */
  busy(): boolean {
    return this.waiting.size > 0 || this.inFlight.size > 0 || this.failed.size > 0
  }

  schedule(record: T): void {
    this.waiting.set(record.id, record)
    this.failed.delete(record.id)
    clearTimeout(this.timers.get(record.id))
    this.timers.set(
      record.id,
      setTimeout(() => this.send(record.id), this.delayMs),
    )
    this.onState(record.id, 'saving')
  }

  retry(id: string): void {
    const failed = this.failed.get(id)
    if (!failed) return
    this.failed.delete(id)
    this.waiting.set(id, failed.record)
    this.onState(id, 'saving')
    this.send(id)
  }

  /**
   * Sends every waiting edit now, and once more every failed one that a retry could fix; resolves when every save has
   * settled, failed or not. With `keepalive` (the page may be left before then, as when logging out), the saves outlive
   * the page.
   */
  async flush(keepalive = false): Promise<void> {
    if (keepalive) this.keepalive = true
    for (const [id, failed] of this.failed) if (!failed.refused) this.retry(id)
    for (const id of [...this.waiting.keys()]) this.send(id)
    await Promise.all(this.inFlight.values())
  }

  /**
   * The page is being left: sends every waiting edit with keepalive, without waiting for an answer. A record with a save
   * on its way sends after it, so the order holds if the page lives that long. The answers still set the state, for a
   * page that comes back from the back/forward cache.
   */
  flushOnExit(): void {
    for (const [id, record] of this.waiting) {
      clearTimeout(this.timers.get(id))
      this.timers.delete(id)
      this.waiting.delete(id)
      const sent = (this.inFlight.get(id) ?? Promise.resolve()).then(() => this.save(record, true))
      const settled = sent.then(
        () => this.settle(id),
        (e: unknown) => {
          if (!this.waiting.has(id)) this.failed.set(id, { record, refused: this.refused(e) })
          this.settle(id)
        },
      )
      this.inFlight.set(id, settled)
    }
  }

  /** The record is deleted: its waiting and failed edits are dropped. */
  discard(id: string): void {
    clearTimeout(this.timers.get(id))
    this.timers.delete(id)
    this.waiting.delete(id)
    this.failed.delete(id)
  }

  private send(id: string): void {
    clearTimeout(this.timers.get(id))
    this.timers.delete(id)
    // A save in flight sends the newest waiting edit when it is done.
    if (this.inFlight.has(id)) return
    const run = async () => {
      let record: T | undefined
      while ((record = this.waiting.get(id))) {
        this.waiting.delete(id)
        clearTimeout(this.timers.get(id))
        this.timers.delete(id)
        try {
          await this.save(record, this.keepalive)
        } catch (e) {
          if (!this.waiting.has(id)) this.failed.set(id, { record, refused: this.refused(e) })
        }
      }
      this.settle(id)
    }
    this.inFlight.set(id, run())
  }

  private settle(id: string): void {
    this.inFlight.delete(id)
    // A newer edit came in meanwhile: its own timer sends it.
    if (this.waiting.has(id)) return
    const failed = this.failed.get(id)
    this.onState(id, failed ? (failed.refused ? 'refused' : 'failed') : 'saved')
  }
}
