// The ranges a horse profile and an analysis must lie within before the engine calculates (#13). One source for the
// domain's validation, and later for the contracts at the API (ADR 0007), which reuse these instead of repeating them.

export interface Limit {
  min: number
  max: number
}

export const LIMITS = {
  /** SLU's requirements cover adult horses only (the model's existing rule). ANTAGANDE: the upper bound. */
  alderAr: { min: 3, max: 40 },
  /** ANTAGANDE: from a miniature horse to the heaviest draught breeds; SLU table 33 spans 100 to 800 kg. */
  viktKg: { min: 50, max: 1200 },
  /** SLU table 1: body condition score 1 to 9, whole points. */
  hull: { min: 1, max: 9 },
  /** ANTAGANDE: at most two sessions a day. */
  passPerVecka: { min: 0, max: 14 },
  /** ANTAGANDE: five hours in one session. */
  minuterPerPass: { min: 0, max: 300 },
  timmarUtePerDag: { min: 0, max: 24 },
  /** ANTAGANDE: the coldest and warmest daily means a Swedish stable meets, with margin. */
  lagstaTempC: { min: -50, max: 40 },
  /** ANTAGANDE: above 0, since the plan is built on roughage; 40 kg as fed is far beyond any horse's intake. */
  grovfoderKgPerDag: { min: 0, max: 40 },
  /** ANTAGANDE: 20 kg of one feed a day is beyond any ration. */
  gramPerDag: { min: 0, max: 20000 },
  /** Spec CF4: dry matter 1 to 100 %. */
  tsProcent: { min: 1, max: 100 },
  /** Ash cannot exceed the dry matter it is part of. */
  askaGPerKgTs: { min: 0, max: 1000 },
} as const satisfies Record<string, Limit>
