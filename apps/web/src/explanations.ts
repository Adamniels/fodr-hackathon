// The latest AI explanation per horse, kept in memory for the session with a fingerprint of the plan payload it
// explains: the same plan shows the kept text without a new call, a changed plan gets a new explanation. Not kept
// across a reload since #29 (no stored data in the browser); #32 stores explanations per saved plan on the server.
const explanations = new Map<string, { fingerprint: string; text: string }>()

export function loadExplanation(hastId: string, planFingerprint: string): string | null {
  const kept = explanations.get(hastId)
  return kept?.fingerprint === planFingerprint ? kept.text : null
}

export function saveExplanation(hastId: string, planFingerprint: string, text: string): void {
  explanations.set(hastId, { fingerprint: planFingerprint, text })
}

/** A short, stable fingerprint of a text (FNV-1a). */
export function fingerprint(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return `${(h >>> 0).toString(36)}-${text.length}`
}
