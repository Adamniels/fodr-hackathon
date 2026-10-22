import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Hastprofil } from '@fodr/domain/types'
import { AutoSaver, newHorseProfile, type SaveState } from './horses'

const horse = (id: string, namn: string): Hastprofil => ({ ...newHorseProfile(), id, namn })

/** A save function whose calls are held until the test settles them. */
function heldSaves() {
  const calls: { horse: Hastprofil; keepalive: boolean; resolve: () => void; reject: (e: Error) => void }[] = []
  const save = (h: Hastprofil, keepalive: boolean) =>
    new Promise<void>((resolve, reject) => calls.push({ horse: h, keepalive, resolve, reject }))
  return { calls, save }
}

describe('AutoSaver', () => {
  let states: Record<string, SaveState>
  const onState = (id: string, state: SaveState) => (states[id] = state)

  beforeEach(() => {
    vi.useFakeTimers()
    states = {}
  })
  afterEach(() => vi.useRealTimers())

  it('sends only the latest edit once the typing pauses', async () => {
    const { calls, save } = heldSaves()
    const saver = new AutoSaver(save, onState, 600)
    saver.schedule(horse('a', 'S'))
    await vi.advanceTimersByTimeAsync(300)
    saver.schedule(horse('a', 'Si'))
    await vi.advanceTimersByTimeAsync(599)
    expect(calls).toHaveLength(0)
    expect(states.a).toBe('saving')

    await vi.advanceTimersByTimeAsync(1)
    expect(calls.map((c) => c.horse.namn)).toEqual(['Si'])
    calls[0].resolve()
    await vi.advanceTimersByTimeAsync(0)
    expect(states.a).toBe('saved')
  })

  it('never has two saves of one horse in flight, so an older one cannot land last', async () => {
    const { calls, save } = heldSaves()
    const saver = new AutoSaver(save, onState, 600)
    saver.schedule(horse('a', 'Six'))
    await vi.advanceTimersByTimeAsync(600)
    saver.schedule(horse('a', 'Sixten'))
    await vi.advanceTimersByTimeAsync(600)
    expect(calls).toHaveLength(1)

    calls[0].resolve()
    await vi.advanceTimersByTimeAsync(0)
    expect(calls.map((c) => c.horse.namn)).toEqual(['Six', 'Sixten'])
    expect(states.a).toBe('saving')
    calls[1].resolve()
    await vi.advanceTimersByTimeAsync(0)
    expect(states.a).toBe('saved')
  })

  it('saves different horses independently', async () => {
    const { calls, save } = heldSaves()
    const saver = new AutoSaver(save, onState, 600)
    saver.schedule(horse('a', 'Sixten'))
    saver.schedule(horse('b', 'Pysen'))
    await vi.advanceTimersByTimeAsync(600)
    expect(calls.map((c) => c.horse.id).sort()).toEqual(['a', 'b'])
  })

  it('keeps a failed edit for a retry and does not fail over a newer one', async () => {
    const { calls, save } = heldSaves()
    const saver = new AutoSaver(save, onState, 600)
    saver.schedule(horse('a', 'Six'))
    await vi.advanceTimersByTimeAsync(600)
    calls[0].reject(new Error('500'))
    await vi.advanceTimersByTimeAsync(0)
    expect(states.a).toBe('failed')

    saver.retry('a')
    await vi.advanceTimersByTimeAsync(0)
    expect(calls.map((c) => c.horse.namn)).toEqual(['Six', 'Six'])
    calls[1].resolve()
    await vi.advanceTimersByTimeAsync(0)
    expect(states.a).toBe('saved')

    // A failure while a newer edit waits: the newer edit holds the failed one's changes too, so it is sent instead.
    saver.schedule(horse('a', 'Sixt'))
    await vi.advanceTimersByTimeAsync(600)
    saver.schedule(horse('a', 'Sixten'))
    calls[2].reject(new Error('500'))
    await vi.advanceTimersByTimeAsync(0)
    expect(states.a).toBe('saving')
    await vi.advanceTimersByTimeAsync(600)
    expect(calls.map((c) => c.horse.namn).slice(2)).toEqual(['Sixt', 'Sixten'])
  })

  it('flush sends waiting edits at once and resolves when every save has settled', async () => {
    const { calls, save } = heldSaves()
    const saver = new AutoSaver(save, onState, 600)
    saver.schedule(horse('a', 'Sixten'))
    let flushed = false
    void saver.flush().then(() => (flushed = true))
    await vi.advanceTimersByTimeAsync(0)
    expect(calls).toHaveLength(1)
    expect(flushed).toBe(false)
    calls[0].resolve()
    await vi.advanceTimersByTimeAsync(0)
    expect(flushed).toBe(true)
  })

  it('sends waiting edits with keepalive when the page is left, and reports how it went', async () => {
    const { calls, save } = heldSaves()
    const saver = new AutoSaver(save, onState, 600)
    saver.schedule(horse('a', 'Sixten'))
    saver.flushOnExit()
    await vi.advanceTimersByTimeAsync(0)
    expect(calls.map((c) => [c.horse.namn, c.keepalive])).toEqual([['Sixten', true]])
    calls[0].resolve()
    await vi.advanceTimersByTimeAsync(0)
    expect(states.a).toBe('saved')
  })

  it("leaving the page sends a horse's waiting edit only after its save on the way", async () => {
    const { calls, save } = heldSaves()
    const saver = new AutoSaver(save, onState, 600)
    saver.schedule(horse('a', 'Six'))
    await vi.advanceTimersByTimeAsync(600)
    saver.schedule(horse('a', 'Sixten'))
    saver.flushOnExit()
    await vi.advanceTimersByTimeAsync(0)
    expect(calls.map((c) => c.horse.namn)).toEqual(['Six'])
    calls[0].resolve()
    await vi.advanceTimersByTimeAsync(0)
    expect(calls.map((c) => [c.horse.namn, c.keepalive])).toEqual([
      ['Six', false],
      ['Sixten', true],
    ])
  })

  it('flush sends a failed edit once more', async () => {
    const { calls, save } = heldSaves()
    const saver = new AutoSaver(save, onState, 600)
    saver.schedule(horse('a', 'Sixten'))
    await vi.advanceTimersByTimeAsync(600)
    calls[0].reject(new Error('500'))
    await vi.advanceTimersByTimeAsync(0)
    void saver.flush()
    await vi.advanceTimersByTimeAsync(0)
    expect(calls.map((c) => c.horse.namn)).toEqual(['Sixten', 'Sixten'])
  })

  it('tells an edit the server refuses from one that may pass later, and never sends it again by itself', async () => {
    const { calls, save } = heldSaves()
    const saver = new AutoSaver(save, onState, 600, (e) => e instanceof Error && e.message === '400')
    saver.schedule(horse('a', 'Sixten'))
    await vi.advanceTimersByTimeAsync(600)
    calls[0].reject(new Error('400'))
    await vi.advanceTimersByTimeAsync(0)
    expect(states.a).toBe('refused')
    void saver.flush()
    await vi.advanceTimersByTimeAsync(0)
    expect(calls).toHaveLength(1)
  })

  it('is busy while an edit waits, travels or has failed', async () => {
    const { calls, save } = heldSaves()
    const saver = new AutoSaver(save, onState, 600)
    expect(saver.busy()).toBe(false)
    saver.schedule(horse('a', 'Sixten'))
    expect(saver.busy()).toBe(true)
    await vi.advanceTimersByTimeAsync(600)
    expect(saver.busy()).toBe(true)
    calls[0].reject(new Error('500'))
    await vi.advanceTimersByTimeAsync(0)
    expect(saver.busy()).toBe(true)
    saver.retry('a')
    calls[1].resolve()
    await vi.advanceTimersByTimeAsync(0)
    expect(saver.busy()).toBe(false)
  })

  it('drops the waiting and failed edits of a deleted horse', async () => {
    const { calls, save } = heldSaves()
    const saver = new AutoSaver(save, onState, 600)
    saver.schedule(horse('a', 'Sixten'))
    saver.discard('a')
    await vi.advanceTimersByTimeAsync(600)
    saver.retry('a')
    await vi.advanceTimersByTimeAsync(0)
    expect(calls).toHaveLength(0)
  })
})
