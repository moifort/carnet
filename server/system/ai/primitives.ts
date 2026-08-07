import { make } from 'ts-brand'
import { z } from 'zod'
import { RECIPE_MAX } from '~/domain/recipe/limits'
import { BREW_METHOD_VALUES, DISH_CATEGORY_VALUES, RECIPE_TYPE_VALUES } from '~/domain/recipe/types'
import type {
  ImportAnalysis,
  ImportCoffeeSettings,
  ImportHash as ImportHashType,
  ImportStep,
  ImportThermomixSettings,
  Proposal,
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

// The same, for a coffee step's extraction settings.
const coffeeSettingsSchema = z
  .object({
    grind: optionalClamped(RECIPE_MAX.coffee),
    water: optionalClamped(RECIPE_MAX.coffee),
    temperature: optionalClamped(RECIPE_MAX.coffee),
    time: optionalClamped(RECIPE_MAX.coffee),
    yield: optionalClamped(RECIPE_MAX.coffee),
  })
  .transform(
    ({ grind, water, temperature, time, yield: cupYield }): ImportCoffeeSettings => ({
      ...(grind ? { grind } : {}),
      ...(water ? { water } : {}),
      ...(temperature ? { temperature } : {}),
      ...(time ? { time } : {}),
      ...(cupYield ? { yield: cupYield } : {}),
    }),
  )

// A step comes back as an object carrying the text plus its nested settings — the
// machine ones on a Thermomix recipe, the extraction ones on a coffee; a bare
// string (schema-less fallback) is tolerated as a step that sets nothing. Both
// settings objects are total: `{}` is the empty one, never a hole in the list.
const stepSchema = z.union([
  clamped(RECIPE_MAX.stepText).transform(
    (text): ImportStep => ({ text, thermomix: {}, coffee: {} }),
  ),
  z
    .object({
      text: clampedField(RECIPE_MAX.stepText),
      thermomix: nullAsAbsent(settingsSchema),
      coffee: nullAsAbsent(coffeeSettingsSchema),
    })
    .transform(
      ({ text, thermomix, coffee }): ImportStep => ({
        text,
        thermomix: thermomix ?? {},
        coffee: coffee ?? {},
      }),
    ),
])

// Drop blank ingredients and cap the count. Shared by import and proposal.
const foldIngredients = (raw: { name: string; quantity: string }[]) =>
  raw.filter((i) => i.name && i.quantity).slice(0, MAX_ITEMS)

// Drop blank steps and cap the count. Shared by import and proposal — each step
// keeps its own settings, so there is no parallel array to align.
const foldSteps = (raw: ImportStep[]): ImportStep[] =>
  raw.filter((s) => s.text.length > 0).slice(0, MAX_ITEMS)

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
export const ImportAnalysisSchema = z
  .object({
    type: z.enum(RECIPE_TYPE_VALUES),
    // Best-effort detection: an unknown/missing category defaults to 'main'.
    category: z.enum(DISH_CATEGORY_VALUES).catch('main'),
    // Only meaningful on a coffee; an unknown value falls back to 'other' rather
    // than forcing the recipe into a brewing method it was never made with.
    method: z.enum(BREW_METHOD_VALUES).nullish().catch('other'),
    title: clampedField(RECIPE_MAX.title),
    sourceLabel: optionalClamped(SOURCE_LABEL_MAX),
    ingredients: z.array(ingredientSchema).default([]),
    steps: z.array(stepSchema).default([]),
    tips: tipsSchema.nullish().transform((v) => v ?? []),
  })
  .transform(
    (raw): ImportAnalysis => ({
      type: raw.type,
      category: raw.category,
      // A method belongs to a coffee and to nothing else — the invariant
      // `RecipeCommand.create` enforces. A coffee whose method Gemini left out
      // still gets one, so the import can always be saved.
      ...(raw.type === 'coffee' ? { method: raw.method ?? 'other' } : {}),
      // Title is required downstream; never let a blank one through.
      title: raw.title || 'Recette importée',
      ...(raw.sourceLabel ? { sourceLabel: raw.sourceLabel } : {}),
      ingredients: foldIngredients(raw.ingredients),
      steps: foldSteps(raw.steps),
      tips: raw.tips,
    }),
  )

export const ProposalSchema = z
  .object({
    changeSummary: clampedField(RECIPE_MAX.changeSummary),
    rationale: clampedField(RATIONALE_MAX),
    ingredients: z.array(ingredientSchema).default([]),
    steps: z.array(stepSchema).default([]),
    tips: tipsSchema,
  })
  .transform(
    (raw): Proposal => ({
      changeSummary: raw.changeSummary,
      rationale: raw.rationale,
      ingredients: foldIngredients(raw.ingredients),
      steps: foldSteps(raw.steps),
      tips: raw.tips,
    }),
  )

// The model's explicit signal that the source holds no recipe. Checked before
// the full schema so a `recipeFound: false` reply with everything else blank
// never trips the stricter parse.
const RecipeFoundSchema = z.object({ recipeFound: z.boolean().catch(true) })

export const parseImportResponse = (text: string): ImportAnalysis | 'no-recipe-found' => {
  const raw = JSON.parse(text)
  if (!RecipeFoundSchema.parse(raw).recipeFound) return 'no-recipe-found'
  const analysis = ImportAnalysisSchema.parse(raw)
  // An allegedly-found recipe with neither ingredients nor steps is equally no
  // recipe — a real one always yields at least one of the two.
  return analysis.ingredients.length === 0 && analysis.steps.length === 0
    ? 'no-recipe-found'
    : analysis
}

export const parseProposalResponse = (text: string): Proposal =>
  ProposalSchema.parse(JSON.parse(text))

const TipsResponseSchema = z.object({ tips: tipsSchema })

export const parseTipsResponse = (text: string): string[] =>
  TipsResponseSchema.parse(JSON.parse(text)).tips
