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
  coffeeLabel: 80, // a bean or a machine spells itself out ("Belleville — Éthiopie Guji Hambela")
} as const
