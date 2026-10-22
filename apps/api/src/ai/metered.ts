// Every call to the model goes through here (#31, spec 6.5, ADR 0015): the user's daily quota is checked and a row
// reserved before the call is sent, and the row then records the tokens, the estimated cost and how the call went.
// A call that never reaches the model (no API key) releases its row, so it neither counts nor costs; a call that
// reached it counts, failed or not, so a failing provider cannot be retried without limit.
import type { Config } from '../config'
import type { Logger } from '../logger'
import type { AiRoute, UsageRepository } from '../repositories/ai-usage'
import { AiProviderError, type AiProvider, type AiReply, type TokenUsage } from './provider'

/** The user has made their daily number of AI calls; nothing was sent. */
export class AiQuotaExceeded extends Error {
  constructor() {
    super('daily AI quota used')
    this.name = 'AiQuotaExceeded'
  }
}

/** The estimated cost of a call in SEK, from the prices per million tokens, to the öre's hundredth (cost_sek). */
export function costSek(
  usage: TokenUsage,
  prices: Pick<Config['ai'], 'priceSekPerMtokInput' | 'priceSekPerMtokOutput'>,
) {
  const sek =
    (usage.inputTokens * prices.priceSekPerMtokInput + usage.outputTokens * prices.priceSekPerMtokOutput) / 1e6
  return Math.round(sek * 1e4) / 1e4
}

const NO_TOKENS: TokenUsage = { inputTokens: 0, outputTokens: 0 }

export interface MeteredAi {
  /** Runs one AI call for the user: rejects with AiQuotaExceeded when today's calls are used, without calling. */
  run<T>(userId: string, route: AiRoute, call: (ai: AiProvider) => Promise<AiReply<T>>): Promise<T>
}

export function createMeteredAi({
  ai,
  usage,
  config,
  logger,
}: {
  ai: AiProvider
  usage: UsageRepository
  config: Config['ai']
  logger: Logger
}): MeteredAi {
  return {
    async run(userId, route, call) {
      const slot = await usage.reserve(userId, route, config.model, config.dailyCallsPerUser)
      if (!slot) throw new AiQuotaExceeded()
      let reply: Awaited<ReturnType<typeof call>>
      try {
        reply = await call(ai)
      } catch (e) {
        if (e instanceof AiProviderError && e.kind === 'missing_key') await usage.release(slot)
        else await record(slot, 'failed', e instanceof AiProviderError ? (e.usage ?? NO_TOKENS) : NO_TOKENS)
        throw e
      }
      await record(slot, 'ok', reply.usage)
      return reply.value
    },
  }

  // A failure to record must not fail the owner's call; the row stays pending and still counts.
  async function record(slot: string, status: 'ok' | 'failed', tokens: TokenUsage) {
    try {
      await usage.complete(slot, { status, ...tokens, costSek: costSek(tokens, config) })
    } catch (err) {
      logger.error({ err }, 'ai usage not recorded')
    }
  }
}
