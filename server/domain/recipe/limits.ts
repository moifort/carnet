/** Max string lengths for the recipe domain's branded values. Single source of
 *  truth: the primitive constructors enforce these, and the AI parse layer clamps
 *  untrusted Gemini output to the same numbers so the two can never drift. */
export const RECIPE_MAX = {
  title: 200,
  changeSummary: 200,
  ingredientName: 120,
  ingredientQuantity: 60,
  stepText: 300,
  tip: 300,
  warning: 300,
  thermomix: 20,
  coffee: 30, // a grind setting spells out a grinder ("Niveau 12, Comandante")
  assistedProgram: 60, // "ASSIST_QUICHEANDTARTETHIN" and its longest cousins
  coffeeLabel: 80, // a bean or a machine spells itself out ("Belleville — Éthiopie Guji Hambela")
} as const

/** Closed ranges for the oven's numeric dials — what `RECIPE_MAX` is to string
 *  lengths. Single source of truth: the branded constructors enforce these, and the
 *  AI parse layer clamps untrusted Gemini output to the same numbers so the two can
 *  never drift. */
export const OVEN_RANGE = {
  temperature: { min: 30, max: 300 },
  duration: { min: 1, max: 720 }, // 12 h — a low-and-slow shoulder, not a typo
  core: { min: 30, max: 100 },
} as const
