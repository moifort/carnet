import { DISH_CATEGORY_VALUES } from '~/domain/recipe/types'
import { callGemini, importBody } from '~/system/ai/gemini'
import { parseCookingImportResponse } from '~/system/ai/primitives'
import {
  ingredientsSchemaProperty,
  stepsSchemaProperty,
  tipsSchemaProperty,
} from '~/system/ai/schema'
import type { CookingImportAnalysis, ImportSource } from '~/system/ai/types'

const responseSchema = {
  type: 'object',
  properties: {
    recipeFound: {
      type: 'boolean',
      description: 'true if the source contains a usable recipe, false otherwise',
    },
    type: {
      type: 'string',
      enum: ['dish', 'thermomix'],
      description: 'dish (cooked recipe) or thermomix (recipe made on a Thermomix)',
    },
    category: {
      type: 'string',
      enum: DISH_CATEGORY_VALUES,
      description: 'Dish category: starter, main, dessert, soup, sauce, baking or drink',
    },
    title: {
      type: 'string',
      description: 'Recipe name, in French (concise, ≤200 characters)',
    },
    sourceLabel: {
      type: 'string',
      nullable: true,
      description: 'Recipe source (author, website, book) if identifiable',
    },
    ingredients: ingredientsSchemaProperty,
    steps: stepsSchemaProperty,
    tips: { ...tipsSchemaProperty, nullable: true },
  },
  required: ['recipeFound', 'type', 'category', 'title'],
  propertyOrdering: [
    'recipeFound',
    'type',
    'category',
    'title',
    'sourceLabel',
    'ingredients',
    'steps',
    'tips',
  ],
}

const INSTRUCTIONS = `You are the assistant of a culinary experimentation notebook. From the provided source (photos, web page or recipe text), extract a STRUCTURED and REPRODUCIBLE cooked recipe.

Rules:
- MANDATORY: write every generated value — title, ingredient names and quantities, step text — in French. The reader is a French speaker; never answer in English.
- Determine the type: dish (cooked recipe) or thermomix (recipe made on a Thermomix). Those two are all there is here: a brewed coffee is imported by another flow entirely, so never answer one — read a coffee source as the drink recipe it is, or as no recipe at all.
- Determine the dish category: starter, main, dessert, soup, sauce, baking (pastry, bread, viennoiserie) or drink (cocktail, smoothie, hot or cold beverage). When in doubt, pick main.
- ingredients: the ORDERED list of the recipe's components with their quantity (e.g. Gin → 50 ml, Beurre → 170 g, Fraise → 3 pièces). Include EVERY ingredient visible in the source, each with its quantity and unit. This is the recipe's "shopping list". The NAME stays short: the ingredient alone, never its transient preparation ("Pommes de terre", not "Pommes de terre épluchées et coupées en rondelles" — the preparation belongs in the steps). An intrinsic variety, type or grade stays in the name, in parentheses ("Pommes de terre (Marbella)", "Farine (T45)"). Every QUANTITY starts with a NUMBER, without exception: a source that says "à goût", "un peu" or "quelques" is estimated into a figure that fits this recipe's volume ("Sel" → "8 g", "Thym" → "2 brins (1 g)"), because the cook resizes the recipe by stepping its quantities and an unmeasured line cannot follow. A QUANTITY in an imprecise kitchen unit (spoon, pinch, glass, cup…) carries its estimated gram equivalent in parentheses, specific to that ingredient ("1 c. à café (6 g)" for salt) — quantities already in metric weight/volume and countable pieces stay as-is.
- steps: short steps, imperative mood, in order. Precise settings (oven temperature, duration, ratio…) stay in the step text.
- tips: the cooking tips found in the source — serving suggestions, storage/freezing advice, technique pointers ("Servir avec du riz", "Se congèle bien"). One short sentence per tip. A tip is neither an ingredient nor a step: never duplicate the method here. Empty array when the source carries none.
- For a Thermomix recipe (type thermomix): for every step performed on the Thermomix, fill the nested thermomix object (time, temperature, speed, reverse) exactly as stated in the recipe (time "3 min" / "30 s" / "1 h 10 min"; temperature "100°C" or "Varoma"; speed "0,5" to "10", "pétrin", "mijotage" or "turbo"). ALWAYS return every step as an object: use null for every missing setting, and set thermomix to null (or leave its fields null) when the step is not done on the Thermomix or when the recipe is not of type thermomix — never omit or merge a step because it carries no setting.
- Be concise: every value stays short (ingredient name ≤120, quantity ≤60, step ≤300, title ≤200, Thermomix setting ≤20 characters).
- If the source contains no usable recipe (unreadable image or one without a recipe, off-topic page or text), set recipeFound to false and leave every other field empty or null. Otherwise set recipeFound to true.
- Use null for any missing information.

Reminder: all text values you produce must be written in French.`

export const analyze = async (
  source: ImportSource,
): Promise<CookingImportAnalysis | 'no-recipe-found'> => {
  const text = await callGemini(importBody(INSTRUCTIONS, source, responseSchema))
  if (!text) throw new Error('Gemini did not return a structured recipe')
  return parseCookingImportResponse(text)
}
