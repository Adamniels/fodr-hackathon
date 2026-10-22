// The beta terms and privacy notice (#42): the version a user accepts at sign-up and is asked to accept again when it
// changes. Publish a new version by changing the date here when the texts in apps/web/src/i18n/sv.json (legal.*)
// change in a way users must agree to.
//   POST /api/v1/me/terms (AcceptTermsSchema): the signed-in user accepts the current version.
import { z } from 'zod'

export const TERMS_VERSION = '2026-10-22'

/**
 * When the privacy notice last changed. It is information, not something a user agrees to (ADR 0009), so changing it
 * does not ask anyone to accept again: only the terms' version does.
 */
export const PRIVACY_UPDATED = '2026-10-22'

export const AcceptTermsSchema = z.object({ version: z.literal(TERMS_VERSION) })
