import { make } from 'ts-brand'
import { z } from 'zod'
import { coffeeSteps, type LooseCoffeeSettings } from '~/domain/recipe/content/coffee'
import { type LooseThermomixSettings, thermomixSteps } from '~/domain/recipe/content/thermomix'
import type { VersionContent as VersionContentType } from '~/domain/recipe/content/types'
import { RECIPE_MAX } from '~/domain/recipe/limits'
import {
  BREW_METHOD_VALUES,
  type BrewMethod as BrewMethodType,
  type CoffeeGrind as CoffeeGrindType,
  type CoffeeTemperature as CoffeeTemperatureType,
  type CoffeeTime as CoffeeTimeType,
  type CoffeeWater as CoffeeWaterType,
  type CoffeeYield as CoffeeYieldType,
  DISH_CATEGORY_VALUES,
  type DishCategory as DishCategoryType,
  type IngredientName as IngredientNameType,
  type IngredientQuantity as IngredientQuantityType,
  type Rating as RatingType,
  RECIPE_TYPE_VALUES,
  type RecipeId as RecipeIdType,
  type RecipeTitle as RecipeTitleType,
  type RecipeType as RecipeTypeType,
  type Remarks as RemarksType,
  type StepText as StepTextType,
  type ThermomixSpeed as ThermomixSpeedType,
  type ThermomixTemperature as ThermomixTemperatureType,
  type ThermomixTime as ThermomixTimeType,
  type Tip as TipType,
  type VersionNumber as VersionNumberType,
  type VersionOriginKind as VersionOriginKindType,
  type Warning as WarningType,
} from '~/domain/recipe/types'

export const RecipeId = (value: unknown) => {
  const v = z.string().uuid().parse(value)
  return make<RecipeIdType>()(v)
}

export const randomRecipeId = () => RecipeId(crypto.randomUUID())

export const RecipeType = (value: unknown) =>
  z.enum(RECIPE_TYPE_VALUES).parse(value) as RecipeTypeType

export const DishCategory = (value: unknown) =>
  z.enum(DISH_CATEGORY_VALUES).parse(value) as DishCategoryType

export const BrewMethod = (value: unknown) =>
  z.enum(BREW_METHOD_VALUES).parse(value) as BrewMethodType

export const RecipeTitle = (value: unknown) => {
  const v = z.string().trim().min(1).max(RECIPE_MAX.title).parse(value)
  return make<RecipeTitleType>()(v)
}

export const VersionNumber = (value: unknown) => {
  const v = z
    .preprocess((n) => (typeof n === 'string' ? Number(n) : n), z.number().int().min(1))
    .parse(value)
  return make<VersionNumberType>()(v)
}

export const IngredientName = (value: unknown) => {
  // 120, not 60: AI imports legitimately produce descriptive names
  // ("Pommes de terre farineuses, épluchées et coupées en rondelles (0,5 cm)").
  const v = z.string().trim().min(1).max(RECIPE_MAX.ingredientName).parse(value)
  return make<IngredientNameType>()(v)
}

export const IngredientQuantity = (value: unknown) => {
  const v = z.string().trim().min(1).max(RECIPE_MAX.ingredientQuantity).parse(value)
  return make<IngredientQuantityType>()(v)
}

export const StepText = (value: unknown) => {
  const v = z.string().trim().min(1).max(RECIPE_MAX.stepText).parse(value)
  return make<StepTextType>()(v)
}

export const Tip = (value: unknown) => {
  const v = z.string().trim().min(1).max(RECIPE_MAX.tip).parse(value)
  return make<TipType>()(v)
}

export const Warning = (value: unknown) => {
  const v = z.string().trim().min(1).max(RECIPE_MAX.warning).parse(value)
  return make<WarningType>()(v)
}

export const ThermomixTime = (value: unknown) => {
  const v = z.string().trim().min(1).max(RECIPE_MAX.thermomix).parse(value)
  return make<ThermomixTimeType>()(v)
}

export const ThermomixTemperature = (value: unknown) => {
  const v = z.string().trim().min(1).max(RECIPE_MAX.thermomix).parse(value)
  return make<ThermomixTemperatureType>()(v)
}

export const ThermomixSpeed = (value: unknown) => {
  const v = z.string().trim().min(1).max(RECIPE_MAX.thermomix).parse(value)
  return make<ThermomixSpeedType>()(v)
}

// The extraction settings are display strings, never numbers: `RECIPE_MAX.coffee`
// is the single length every one of them answers to.
const coffeeSetting = (value: unknown) =>
  z.string().trim().min(1).max(RECIPE_MAX.coffee).parse(value)

export const CoffeeGrind = (value: unknown) => make<CoffeeGrindType>()(coffeeSetting(value))
export const CoffeeWater = (value: unknown) => make<CoffeeWaterType>()(coffeeSetting(value))
export const CoffeeTemperature = (value: unknown) =>
  make<CoffeeTemperatureType>()(coffeeSetting(value))
export const CoffeeTime = (value: unknown) => make<CoffeeTimeType>()(coffeeSetting(value))
export const CoffeeYield = (value: unknown) => make<CoffeeYieldType>()(coffeeSetting(value))

export const VersionOriginKind = (value: unknown) =>
  z.enum(['import', 'ai-proposal', 'manual']).parse(value) as VersionOriginKindType

export const Rating = (value: unknown) => {
  const v = z
    .preprocess((n) => (typeof n === 'string' ? Number(n) : n), z.number().int().min(1).max(5))
    .parse(value)
  return make<RatingType>()(v)
}

export const Remarks = (value: unknown) => {
  const v = z.string().max(2000).parse(value)
  return make<RemarksType>()(v)
}

// Boundary branding for a whole version body — the single constructor both the
// GraphQL client payload and the (untrusted) AI proposal pass through. Discriminated
// on `kind`: a dish carries plain-text steps, a Thermomix recipe nested steps whose
// loose settings are normalized and paired via `thermomixSteps`, a coffee the same
// through `coffeeSteps`. Every scalar is re-validated by its branded constructor,
// so a raw payload can never sneak past.
const looseIngredientSchema = z.object({ name: z.unknown(), quantity: z.unknown() })

const looseSettingsSchema = z.object({
  time: z.string().nullish(),
  temperature: z.string().nullish(),
  speed: z.string().nullish(),
  reverse: z.boolean().nullish(),
})

const looseCoffeeSettingsSchema = z.object({
  grind: z.string().nullish(),
  water: z.string().nullish(),
  temperature: z.string().nullish(),
  time: z.string().nullish(),
  yield: z.string().nullish(),
})

const dishContentSchema = z.object({
  kind: z.literal('dish'),
  ingredients: z.array(looseIngredientSchema),
  steps: z.array(z.unknown()),
})

const thermomixContentSchema = z.object({
  kind: z.literal('thermomix'),
  ingredients: z.array(looseIngredientSchema),
  steps: z.array(z.object({ text: z.unknown(), settings: looseSettingsSchema.nullish() })),
})

const coffeeContentSchema = z.object({
  kind: z.literal('coffee'),
  ingredients: z.array(looseIngredientSchema),
  steps: z.array(z.object({ text: z.unknown(), settings: looseCoffeeSettingsSchema.nullish() })),
})

const brandIngredient = (i: { name: unknown; quantity: unknown }) => ({
  name: IngredientName(i.name),
  quantity: IngredientQuantity(i.quantity),
})

const brandLooseSettings = (s: z.infer<typeof looseSettingsSchema>): LooseThermomixSettings => ({
  ...(s.time ? { time: ThermomixTime(s.time) } : {}),
  ...(s.temperature ? { temperature: ThermomixTemperature(s.temperature) } : {}),
  ...(s.speed ? { speed: ThermomixSpeed(s.speed) } : {}),
  ...(s.reverse ? { reverse: s.reverse } : {}),
})

const brandLooseCoffeeSettings = (
  s: z.infer<typeof looseCoffeeSettingsSchema>,
): LooseCoffeeSettings => ({
  ...(s.grind ? { grind: CoffeeGrind(s.grind) } : {}),
  ...(s.water ? { water: CoffeeWater(s.water) } : {}),
  ...(s.temperature ? { temperature: CoffeeTemperature(s.temperature) } : {}),
  ...(s.time ? { time: CoffeeTime(s.time) } : {}),
  ...(s.yield ? { yield: CoffeeYield(s.yield) } : {}),
})

const versionContentSchema = z
  .discriminatedUnion('kind', [dishContentSchema, thermomixContentSchema, coffeeContentSchema])
  .transform((raw): VersionContentType => {
    const ingredients = raw.ingredients.map(brandIngredient)
    if (raw.kind === 'dish') {
      return { kind: 'dish', ingredients, steps: raw.steps.map((s) => StepText(s)) }
    }
    const texts = raw.steps.map((s) => StepText(s.text))
    if (raw.kind === 'coffee') {
      const settings = raw.steps.map((s) => brandLooseCoffeeSettings(s.settings ?? {}))
      return { kind: 'coffee', ingredients, steps: coffeeSteps(texts, settings) }
    }
    const settings = raw.steps.map((s) => brandLooseSettings(s.settings ?? {}))
    return { kind: 'thermomix', ingredients, steps: thermomixSteps(texts, settings) }
  })

export const VersionContent = (value: unknown): VersionContentType =>
  versionContentSchema.parse(value)
