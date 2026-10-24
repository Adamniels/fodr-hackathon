// Autosave for forms that change a record on every keystroke (horses #25, analysis corrections #26): the page shows
// each edit at once, and the server gets the latest one when the typing pauses.

/**
 * Where a record's edits are: on their way to the server, saved, failed and kept for a retry, refused by the server
 * as invalid, which a retry cannot change, or refused because the server's copy changed since the page read it
 * (#140), which the user decides.
 */
export type SaveState = 'saving' | 'saved' | 'failed' | 'refused' | 'conflict'

/** How a save that did not reach the server ended. */
type Failure = Exclude<SaveState, 'saving' | 'saved'>

/**
 * Saves each record's latest edit, by its id, once the edits pause for `delayMs`. One save per record is in flight at a
 * time, and the next one sends the newest edit, so an older edit can never reach the server after a newer one. A failed
 * edit is kept for retry() unless a newer edit, which holds its changes too, is waiting. `refused` tells a failure no retry can
 * fix (the server called the edit invalid) from one that may pass later. `conflicted` tells a save the server refused
 * because its copy changed since the page read it (#140): the edit is kept, with any newer one, and never sent again
 * until the user decides, by retry() (save it over the server's copy) or drop() (take the server's copy).
 */
export class AutoSaver<T extends { id: string }> {
  private readonly waiting = new Map<string, T>()
  private readonly failed = new Map<string, { record: T; failure: Failure }>()
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>()
  private readonly inFlight = new Map<string, Promise<void>>()
  // Set by a flush with keepalive (logging out, #169): every save from then on outlives the page, also an edit that
  // waits behind a save on its way.
  private keepalive = false

  private readonly save: (record: T, keepalive: boolean) => Promise<void>
  private readonly onState: (id: string, state: SaveState) => void
  private readonly delayMs: number
  private readonly refused: (error: unknown) => boolean
  private readonly conflicted: (error: unknown) => boolean

  constructor(
    save: (record: T, keepalive: boolean) => Promise<void>,
    onState: (id: string, state: SaveState) => void,
    delayMs = 600,
    refused: (error: unknown) => boolean = () => false,
    conflicted: (error: unknown) => boolean = () => false,
  ) {
    this.save = save
    this.onState = onState
    this.delayMs = delayMs
    this.refused = refused
    this.conflicted = conflicted
  }

  /**
   * Whether an edit is waiting, on its way, or failed, of any record or of the one named: the server may not hold what
   * the page shows.
   */
  busy(id?: string): boolean {
    if (id !== undefined) return this.waiting.has(id) || this.inFlight.has(id) || this.failed.has(id)
    return this.waiting.size > 0 || this.inFlight.size > 0 || this.failed.size > 0
  }

  schedule(record: T): void {
    // In conflict, the newest edit waits with it for the user's decision, never sent on the copy the server refused.
    if (this.failed.get(record.id)?.failure === 'conflict') {
      this.failed.set(record.id, { record, failure: 'conflict' })
      return
    }
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

  /** The page took the server's copy instead of the edit (#140): the edit is given up, and the record is as saved. */
  drop(id: string): void {
    this.discard(id)
    this.onState(id, 'saved')
  }

  /**
   * Sends every waiting edit now, and once more every failed one that a retry could fix; resolves when every save has
   * settled, failed or not. With `keepalive` (the page may be left before then, as when logging out), the saves outlive
   * the page.
   */
  async flush(keepalive = false): Promise<void> {
    if (keepalive) this.keepalive = true
    for (const [id, failed] of this.failed) if (failed.failure === 'failed') this.retry(id)
    for (const id of [...this.waiting.keys()]) this.send(id)
    await Promise.all(this.inFlight.values())
  }

  /**
   * The page is being left: sends every waiting edit with keepalive, without waiting for an answer. A record with a save
   * on its way sends after it, through the same loop as any save, so the order holds if the page lives that long and a
   * page shown again from the back/forward cache never has two saves of a record on their way (#140 review). The
   * answers still set the state. Saves stay keepalive from then on, as after a flush with keepalive.
   */
  flushOnExit(): void {
    this.keepalive = true
    for (const id of [...this.waiting.keys()]) this.send(id)
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
          this.fail(id, record, e)
        }
      }
      this.settle(id)
    }
    this.inFlight.set(id, run())
  }

  /**
   * Keeps a failed edit, unless a newer one is waiting, which holds its changes too and is sent instead. A conflict takes
   * the newer edit with it, since it would be refused the same way.
   */
  private fail(id: string, record: T, e: unknown): void {
    if (this.conflicted(e)) {
      const newest = this.waiting.get(id) ?? record
      this.waiting.delete(id)
      clearTimeout(this.timers.get(id))
      this.timers.delete(id)
      this.failed.set(id, { record: newest, failure: 'conflict' })
    } else if (!this.waiting.has(id)) {
      this.failed.set(id, { record, failure: this.refused(e) ? 'refused' : 'failed' })
    }
  }

  private settle(id: string): void {
    this.inFlight.delete(id)
    // A newer edit came in meanwhile: its own timer sends it.
    if (this.waiting.has(id)) return
    this.onState(id, this.failed.get(id)?.failure ?? 'saved')
  }
}
