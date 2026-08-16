import { make } from 'ts-brand'
import { z } from 'zod'
import { RECIPE_MAX } from '~/domain/recipe/limits'
import { BREW_METHOD_VALUES, DISH_CATEGORY_VALUES } from '~/domain/recipe/types'
import type {
  CoffeeChange,
  CoffeeImportAnalysis,
  CoffeeProposal,
  CookingChange,
  CookingImportAnalysis,
  CookingProposal,
  ImportCoffeeParameters,
  ImportHash as ImportHashType,
  ImportStep,
  ImportThermomixSettings,
} from '~/system/ai/types'

export const ImportHash = (value: unknown) => {
  const v = z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .parse(value)
  return make<ImportHashType>()(v)
}

// Gemini can't be trusted to respect our field sizes, so every string it returns
// is trimmed and truncated to the matching domain limit BEFORE it can reach a
// branded primitive (which would otherwise throw a 400/500 on overflow). We
// truncate rather than reject — the import preview is editable, so a clipped
// value is fixable, a hard error is not.
const clamped = (max: number) => z.string().transform((s) => s.trim().slice(0, max))

// Required string field → clamped, tolerating absent/null by yielding '' (Gemini
// sometimes nulls a required field even when told not to). A blank result is then
// dropped by the array filters instead of throwing and failing the whole parse.
const clampedField = (max: number) =>
  z
    .string()
    .nullish()
    .transform((v) => (v ?? '').trim().slice(0, max))

// Optional string → clamped, or absent when Gemini left it out, nulled it or
// returned it blank.
const optionalClamped = (max: number) =>
  z
    .string()
    .nullish()
    .transform((v) => {
      const t = (v ?? '').trim().slice(0, max)
      return t.length ? t : undefined
    })

// Boundary normalization: Gemini spells "no value" as an explicit JSON `null`
// (the prompt asks it to), the domain spells it "absent" — so a null becomes
// undefined the moment the response is parsed.
const nullAsAbsent = <T>(schema: z.ZodType<T>) => schema.nullish().transform((v) => v ?? undefined)

// Generous caps for fields that reach the domain unvalidated (no branded scalar):
// they can't 400, but an unbounded value would bloat the Firestore document.
const SOURCE_LABEL_MAX = 200
const RATIONALE_MAX = 2000

// Cap array element counts so a runaway response can't produce thousands of rows.
// Generous — real recipes/proposals stay well under this.
const MAX_ITEMS = 100

const ingredientSchema = z.object({
  name: clampedField(RECIPE_MAX.ingredientName),
  quantity: clampedField(RECIPE_MAX.ingredientQuantity),
})

// One step's nested Thermomix settings, normalized to the domain's "absent = no
// key" convention. `reverse: false` carries no information — Gemini sometimes emits
// it instead of nothing on plain steps, and it must not turn them into "Thermomix"
// steps — so it is dropped, leaving a plain step the empty settings object `{}`.
const settingsSchema = z
  .object({
    time: optionalClamped(RECIPE_MAX.thermomix),
    temperature: optionalClamped(RECIPE_MAX.thermomix),
    speed: optionalClamped(RECIPE_MAX.thermomix),
    reverse: nullAsAbsent(z.boolean()),
  })
  .transform(
    ({ time, temperature, speed, reverse }): ImportThermomixSettings => ({
      ...(time ? { time } : {}),
      ...(temperature ? { temperature } : {}),
      ...(speed ? { speed } : {}),
      ...(reverse ? { reverse } : {}),
    }),
  )

// Drop every key Gemini left out or nulled — the rule the five parameter blocks
// share. Deliberately not the domain's `toCoffeeParameters`: this layer knows only
// clamped strings, and the domain re-validates them when the cook confirms.
const pruned = <T extends object>(block: T | undefined): T =>
  Object.fromEntries(
    Object.entries(block ?? {}).filter(([, value]) => value !== undefined && value !== null),
  ) as T

// A coffee's parameters as Gemini returns them. Blocks are total (`{}` when the
// source says nothing), and a milk with nothing in it becomes no milk at all — an
// espresso has none, and that absence is information.
const coffeeParametersSchema = z
  .object({
    beans: nullAsAbsent(
      z.object({
        name: optionalClamped(RECIPE_MAX.coffeeLabel),
        country: optionalClamped(RECIPE_MAX.coffeeLabel),
        producer: optionalClamped(RECIPE_MAX.coffeeLabel),
        roast: optionalClamped(RECIPE_MAX.coffeeLabel),
        roastedOn: optionalClamped(RECIPE_MAX.coffee),
        dose: optionalClamped(RECIPE_MAX.coffee),
      }),
    ),
    water: nullAsAbsent(
      z.object({
        kind: optionalClamped(RECIPE_MAX.coffeeLabel),
        amount: optionalClamped(RECIPE_MAX.coffee),
        temperature: optionalClamped(RECIPE_MAX.coffee),
      }),
    ),
    extraction: nullAsAbsent(
      z.object({
        grind: optionalClamped(RECIPE_MAX.coffee),
        time: optionalClamped(RECIPE_MAX.coffee),
        yield: optionalClamped(RECIPE_MAX.coffee),
      }),
    ),
    milk: nullAsAbsent(
      z.object({
        kind: optionalClamped(RECIPE_MAX.coffeeLabel),
        amount: optionalClamped(RECIPE_MAX.coffee),
        temperature: optionalClamped(RECIPE_MAX.coffee),
      }),
    ),
    gear: nullAsAbsent(
      z.object({
        machine: optionalClamped(RECIPE_MAX.coffeeLabel),
        grinder: optionalClamped(RECIPE_MAX.coffeeLabel),
      }),
    ),
  })
  .partial()
  .transform((raw): ImportCoffeeParameters => {
    const milk = pruned(raw.milk)
    return {
      beans: pruned(raw.beans),
      water: pruned(raw.water),
      extraction: pruned(raw.extraction),
      ...(Object.keys(milk).length > 0 ? { milk } : {}),
      gear: pruned(raw.gear),
    }
  })

// A step comes back as an object carrying the text plus its nested Thermomix
// settings; a bare string (schema-less fallback) is tolerated as a step that sets
// nothing. The settings object is total: `{}` is the empty one, never a hole.
const stepSchema = z.union([
  clamped(RECIPE_MAX.stepText).transform((text): ImportStep => ({ text, thermomix: {} })),
  z
    .object({
      text: clampedField(RECIPE_MAX.stepText),
      thermomix: nullAsAbsent(settingsSchema),
    })
    .transform(({ text, thermomix }): ImportStep => ({ text, thermomix: thermomix ?? {} })),
])

// Drop blank ingredients and cap the count. Shared by import and proposal.
const foldIngredients = (raw: { name: string; quantity: string }[]) =>
  raw.filter(({ name, quantity }) => name && quantity).slice(0, MAX_ITEMS)

// Drop blank steps and cap the count. Shared by import and proposal — each step
// keeps its own settings, so there is no parallel array to align.
const foldSteps = (raw: ImportStep[]): ImportStep[] =>
  raw.filter(({ text }) => text.length > 0).slice(0, MAX_ITEMS)

// Drop blank tips and cap the count. Shared by import, proposal and the
// tips-formatting call.
const tipsSchema = z
  .array(clampedField(RECIPE_MAX.tip))
  .default([])
  .transform((raw) => raw.filter((tip) => tip.length > 0).slice(0, MAX_ITEMS))

// Gemini marks absent fields as explicit null (the prompt instructs it to), so
// every optional field accepts null and normalizes it away — parsing the response
// is the boundary where the AI's nulls become the domain's absent fields. All
// strings are clamped; array items whose required fields came back blank are
// dropped rather than failing the parse.
const CookingImportSchema = z
  .object({
    // The cooking flow never answers a coffee: it was launched from the notebook,
    // and a coffee is imported by its own flow. An unknown value lands on the dish
    // it most likely is rather than routing the recipe to a tab it never came from.
    type: z.enum(['dish', 'thermomix']).catch('dish'),
    // Best-effort detection: an unknown/missing category defaults to 'main'.
    category: z.enum(DISH_CATEGORY_VALUES).catch('main'),
    title: clampedField(RECIPE_MAX.title),
    sourceLabel: optionalClamped(SOURCE_LABEL_MAX),
    ingredients: z.array(ingredientSchema).default([]),
    steps: z.array(stepSchema).default([]),
    tips: tipsSchema.nullish().transform((v) => v ?? []),
  })
  .transform(
    (raw): CookingImportAnalysis => ({
      type: raw.type,
      category: raw.category,
      // Title is required downstream; never let a blank one through.
      title: raw.title || 'Recette importée',
      ...(raw.sourceLabel ? { sourceLabel: raw.sourceLabel } : {}),
      ingredients: foldIngredients(raw.ingredients),
      steps: foldSteps(raw.steps),
      tips: raw.tips,
    }),
  )

const CoffeeImportSchema = z
  .object({
    // An unknown method falls back to 'other' rather than forcing the coffee into
    // a brewing method it was never made with.
    method: z.enum(BREW_METHOD_VALUES).nullish().catch('other'),
    title: clampedField(RECIPE_MAX.title),
    sourceLabel: optionalClamped(SOURCE_LABEL_MAX),
    parameters: z.unknown().optional(),
    tips: tipsSchema.nullish().transform((v) => v ?? []),
  })
  .transform(
    (raw): CoffeeImportAnalysis => ({
      method: raw.method ?? 'other',
      title: raw.title || 'Café importé',
      ...(raw.sourceLabel ? { sourceLabel: raw.sourceLabel } : {}),
      // A coffee Gemini answered without them still gets the four empty blocks, so
      // the preview has fields to fill in rather than holes.
      parameters: coffeeParametersSchema.parse(raw.parameters ?? {}),
      tips: raw.tips,
    }),
  )

const CookingProposalSchema = z
  .object({
    changeSummary: clampedField(RECIPE_MAX.changeSummary),
    rationale: clampedField(RATIONALE_MAX),
    ingredients: z.array(ingredientSchema).default([]),
    steps: z.array(stepSchema).default([]),
    tips: tipsSchema,
  })
  .transform(
    (raw): CookingProposal => ({
      changeSummary: raw.changeSummary,
      rationale: raw.rationale,
      ingredients: foldIngredients(raw.ingredients),
      steps: foldSteps(raw.steps),
      tips: raw.tips,
    }),
  )

const CoffeeProposalSchema = z
  .object({
    changeSummary: clampedField(RECIPE_MAX.changeSummary),
    rationale: clampedField(RATIONALE_MAX),
    parameters: z.unknown().optional(),
    tips: tipsSchema,
  })
  .transform(
    (raw): CoffeeProposal => ({
      changeSummary: raw.changeSummary,
      rationale: raw.rationale,
      parameters: coffeeParametersSchema.parse(raw.parameters ?? {}),
      tips: raw.tips,
    }),
  )

// The transcription of a change the cook already made: the same lists a proposal
// returns, without the rationale nobody asked for and without the tips, which the
// change never touches.
const CookingChangeSchema = z
  .object({
    changeSummary: clampedField(RECIPE_MAX.changeSummary),
    ingredients: z.array(ingredientSchema).default([]),
    steps: z.array(stepSchema).default([]),
  })
  .transform(
    (raw): CookingChange => ({
      changeSummary: raw.changeSummary,
      ingredients: foldIngredients(raw.ingredients),
      steps: foldSteps(raw.steps),
    }),
  )

const CoffeeChangeSchema = z
  .object({
    changeSummary: clampedField(RECIPE_MAX.changeSummary),
    parameters: z.unknown().optional(),
  })
  .transform(
    (raw): CoffeeChange => ({
      changeSummary: raw.changeSummary,
      parameters: coffeeParametersSchema.parse(raw.parameters ?? {}),
    }),
  )

// The model's explicit signal that the source holds nothing to import. Checked
// before the full schema so a `found: false` reply with everything else blank never
// trips the stricter parse.
const RecipeFoundSchema = z.object({ recipeFound: z.boolean().catch(true) })
const CoffeeFoundSchema = z.object({ coffeeFound: z.boolean().catch(true) })

// A cooked recipe is its ingredients or its steps; with neither, there is nothing
// to reproduce and the source held no recipe.
const cookingSaysSomething = (analysis: CookingImportAnalysis) =>
  analysis.ingredients.length > 0 || analysis.steps.length > 0

// A coffee is wholly described by its dials, so a single filled one is enough —
// but none at all is a photo of something that is not a coffee.
const coffeeSaysSomething = (analysis: CoffeeImportAnalysis) =>
  Object.values(analysis.parameters).some((block) => Object.keys(block ?? {}).length > 0)

export const parseCookingImportResponse = (
  text: string,
): CookingImportAnalysis | 'no-recipe-found' => {
  const raw = JSON.parse(text)
  if (!RecipeFoundSchema.parse(raw).recipeFound) return 'no-recipe-found'
  const analysis = CookingImportSchema.parse(raw)
  // An allegedly-found recipe that says nothing at all is equally no recipe.
  return cookingSaysSomething(analysis) ? analysis : 'no-recipe-found'
}

export const parseCoffeeImportResponse = (
  text: string,
): CoffeeImportAnalysis | 'no-recipe-found' => {
  const raw = JSON.parse(text)
  if (!CoffeeFoundSchema.parse(raw).coffeeFound) return 'no-recipe-found'
  const analysis = CoffeeImportSchema.parse(raw)
  return coffeeSaysSomething(analysis) ? analysis : 'no-recipe-found'
}

export const parseCookingProposalResponse = (text: string): CookingProposal =>
  CookingProposalSchema.parse(JSON.parse(text))

export const parseCoffeeProposalResponse = (text: string): CoffeeProposal =>
  CoffeeProposalSchema.parse(JSON.parse(text))

export const parseCookingChangeResponse = (text: string): CookingChange =>
  CookingChangeSchema.parse(JSON.parse(text))

export const parseCoffeeChangeResponse = (text: string): CoffeeChange =>
  CoffeeChangeSchema.parse(JSON.parse(text))

const TipsResponseSchema = z.object({ tips: tipsSchema })

export const parseTipsResponse = (text: string): string[] =>
  TipsResponseSchema.parse(JSON.parse(text)).tips
