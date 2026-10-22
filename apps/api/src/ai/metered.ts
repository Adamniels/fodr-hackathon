// Every call to the model goes through here (#31, spec 6.5, ADR 0015): the user's daily quota is checked and a row
// reserved before the call is sent, and the row then records the tokens, the estimated cost and how the call went.
// A call that never reaches the model (no API key, or a key the provider rejects) releases its row, so it neither
// counts nor costs, and a wrong key cannot use up everyone's quota; a call that may have reached it counts, failed or
// not (a timeout too, which the provider may still bill), so a failing provider cannot be retried without limit.
import type { Config } from '../config'
import type { Logger } from '../logger'
import type { AiRoute, UsageRepository } from '../repositories/ai-usage'
import { AiProviderError, type AiErrorKind, type AiProvider, type AiReply, type TokenUsage } from './provider'

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
/** The failures where no model ran. */
const NEVER_SENT = new Set<AiErrorKind>(['missing_key', 'auth'])

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
      if (!slot) {
        // How often the quota is reached, to tune AI_DAILY_CALLS_PER_USER; who reached it is in ai_usage.
        logger.info({ route }, 'ai quota used')
        throw new AiQuotaExceeded()
      }
      let reply: Awaited<ReturnType<typeof call>>
      try {
        reply = await call(ai)
      } catch (e) {
        if (e instanceof AiProviderError && NEVER_SENT.has(e.kind)) await release(slot)
        else await record(slot, 'failed', e instanceof AiProviderError ? (e.usage ?? NO_TOKENS) : NO_TOKENS)
        throw e
      }
      await record(slot, 'ok', reply.usage)
      return reply.value
    },
  }

  // A failure to record or release must not fail the owner's call or hide its error; the row stays and still counts.
  async function release(slot: string) {
    try {
      await usage.release(slot)
    } catch (err) {
      logger.error({ err }, 'ai usage not released')
    }
  }

  async function record(slot: string, status: 'ok' | 'failed', tokens: TokenUsage) {
    try {
      await usage.complete(slot, { status, ...tokens, costSek: costSek(tokens, config) })
    } catch (err) {
      logger.error({ err }, 'ai usage not recorded')
    }
  }
}
