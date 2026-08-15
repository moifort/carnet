import { make } from 'ts-brand'
import { z } from 'zod'
import {
  type CoffeeParameters as CoffeeParametersType,
  toCoffeeParameters,
} from '~/domain/recipe/content/coffee'
import { type OvenProfile as OvenProfileType, toOvenProfile } from '~/domain/recipe/content/oven'
import { type LooseThermomixSettings, thermomixSteps } from '~/domain/recipe/content/thermomix'
import type { VersionContent as VersionContentType } from '~/domain/recipe/content/types'
import { OVEN_RANGE, RECIPE_MAX } from '~/domain/recipe/limits'
import {
  type AssistedProgram as AssistedProgramType,
  BREW_METHOD_VALUES,
  type BrewMethod as BrewMethodType,
  type CoffeeBeanName as CoffeeBeanNameType,
  type CoffeeCountry as CoffeeCountryType,
  type CoffeeDose as CoffeeDoseType,
  type CoffeeGrinder as CoffeeGrinderType,
  type CoffeeGrind as CoffeeGrindType,
  type CoffeeMachine as CoffeeMachineType,
  type CoffeeMilkAmount as CoffeeMilkAmountType,
  type CoffeeMilkKind as CoffeeMilkKindType,
  type CoffeeProducer as CoffeeProducerType,
  type CoffeeRoast as CoffeeRoastType,
  type CoffeeTemperature as CoffeeTemperatureType,
  type CoffeeTime as CoffeeTimeType,
  type CoffeeWaterKind as CoffeeWaterKindType,
  type CoffeeWater as CoffeeWaterType,
  type CoffeeYield as CoffeeYieldType,
  DISH_CATEGORY_VALUES,
  type DishCategory as DishCategoryType,
  type IngredientName as IngredientNameType,
  type IngredientQuantity as IngredientQuantityType,
  type Ingredient as IngredientType,
  OVEN_PROGRAM_VALUES,
  type OvenCoreTemperature as OvenCoreTemperatureType,
  type OvenDuration as OvenDurationType,
  type OvenProgram as OvenProgramType,
  type OvenTemperature as OvenTemperatureType,
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

export const OvenProgram = (value: unknown) =>
  z.enum(OVEN_PROGRAM_VALUES).parse(value) as OvenProgramType

// The oven dials are whole numbers within a closed range — the one shape the three
// of them share, so no dial can validate differently from its neighbours.
const ovenDial = (range: { min: number; max: number }) => (value: unknown) =>
  z
    .preprocess(
      (n) => (typeof n === 'string' ? Number(n) : n),
      z.number().int().min(range.min).max(range.max),
    )
    .parse(value)

export const AssistedProgram = (value: unknown) => {
  const v = z.string().trim().min(1).max(RECIPE_MAX.assistedProgram).parse(value)
  return make<AssistedProgramType>()(v)
}

export const OvenTemperature = (value: unknown) =>
  make<OvenTemperatureType>()(ovenDial(OVEN_RANGE.temperature)(value))

export const OvenDuration = (value: unknown) =>
  make<OvenDurationType>()(ovenDial(OVEN_RANGE.duration)(value))

export const OvenCoreTemperature = (value: unknown) =>
  make<OvenCoreTemperatureType>()(ovenDial(OVEN_RANGE.core)(value))

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
export const CoffeeDose = (value: unknown) => make<CoffeeDoseType>()(coffeeSetting(value))
export const CoffeeMilkAmount = (value: unknown) =>
  make<CoffeeMilkAmountType>()(coffeeSetting(value))

// The descriptive coffee fields are longer than a setting: a bean spells out its
// roaster, its origin and its lot. `RECIPE_MAX.coffeeLabel` is their single length.
const coffeeLabel = (value: unknown) =>
  z.string().trim().min(1).max(RECIPE_MAX.coffeeLabel).parse(value)

export const CoffeeBeanName = (value: unknown) => make<CoffeeBeanNameType>()(coffeeLabel(value))
export const CoffeeCountry = (value: unknown) => make<CoffeeCountryType>()(coffeeLabel(value))
export const CoffeeProducer = (value: unknown) => make<CoffeeProducerType>()(coffeeLabel(value))
export const CoffeeRoast = (value: unknown) => make<CoffeeRoastType>()(coffeeLabel(value))
export const CoffeeWaterKind = (value: unknown) => make<CoffeeWaterKindType>()(coffeeLabel(value))
export const CoffeeMilkKind = (value: unknown) => make<CoffeeMilkKindType>()(coffeeLabel(value))
export const CoffeeMachine = (value: unknown) => make<CoffeeMachineType>()(coffeeLabel(value))
export const CoffeeGrinder = (value: unknown) => make<CoffeeGrinderType>()(coffeeLabel(value))

// The single date of the coffee model — the boundaries hand it over as an ISO string
// (GraphQL, Gemini) or already as a Date (Firestore).
export const RoastDate = (value: unknown) => z.coerce.date().parse(value)

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

const looseOvenSchema = z.object({
  program: z.unknown(),
  assisted: z.unknown().nullish(),
  temperature: z.unknown(),
  duration: z.unknown().nullish(),
  core: z.unknown().nullish(),
})

const dishContentSchema = z.object({
  kind: z.literal('dish'),
  ingredients: z.array(looseIngredientSchema),
  steps: z.array(z.unknown()),
  oven: looseOvenSchema.nullish(),
})

const thermomixContentSchema = z.object({
  kind: z.literal('thermomix'),
  ingredients: z.array(looseIngredientSchema),
  steps: z.array(z.object({ text: z.unknown(), settings: looseSettingsSchema.nullish() })),
  oven: looseOvenSchema.nullish(),
})

// A coffee has no ingredient list: its dose, its water and its milk are parameters.
const looseCoffeeParametersSchema = z.object({
  beans: z
    .object({
      name: z.string().nullish(),
      country: z.string().nullish(),
      producer: z.string().nullish(),
      roast: z.string().nullish(),
      roastedOn: z.union([z.string(), z.date()]).nullish(),
      dose: z.string().nullish(),
    })
    .nullish(),
  water: z
    .object({
      kind: z.string().nullish(),
      amount: z.string().nullish(),
      temperature: z.string().nullish(),
    })
    .nullish(),
  extraction: z
    .object({
      grind: z.string().nullish(),
      time: z.string().nullish(),
      yield: z.string().nullish(),
    })
    .nullish(),
  milk: z
    .object({
      kind: z.string().nullish(),
      amount: z.string().nullish(),
      temperature: z.string().nullish(),
    })
    .nullish(),
  gear: z.object({ machine: z.string().nullish(), grinder: z.string().nullish() }).nullish(),
})

// A coffee body is its parameters. `steps` is deliberately not declared: a client
// that still sends one has it dropped here rather than rejected — an import must not
// fail over a field the model no longer has.
const coffeeContentSchema = looseCoffeeParametersSchema.extend({
  kind: z.literal('coffee'),
})

const brandIngredient = (i: { name: unknown; quantity: unknown }) => ({
  name: IngredientName(i.name),
  quantity: IngredientQuantity(i.quantity),
})

// Every dial goes through its branded constructor, then `toOvenProfile` drops the
// ones the cook left unset — a raw payload never sneaks in, and no null is stored.
const brandOvenProfile = (raw: z.infer<typeof looseOvenSchema>): OvenProfileType => {
  const program = OvenProgram(raw.program)
  // The pair is an invariant, so it is REFUSED here rather than quietly repaired:
  // `assisted` names one of the oven's own programmes and means nothing without the
  // code that identifies it. Coercing it to a heating function would cook something
  // else without saying so, and dropping the profile would lose the temperature the
  // cook did give us. A caller that sends half a pair has a bug worth hearing about.
  if (program === 'assisted' && raw.assisted == null) {
    throw new Error('An assisted oven programme needs the appliance code that names it')
  }
  return toOvenProfile({
    program,
    assisted: raw.assisted != null ? AssistedProgram(raw.assisted) : undefined,
    temperature: OvenTemperature(raw.temperature),
    duration: raw.duration != null ? OvenDuration(raw.duration) : undefined,
    core: raw.core != null ? OvenCoreTemperature(raw.core) : undefined,
  })
}

// Boundary branding for a profile alone — what an AI analysis passes through, the
// rest of the version's content untouched.
export const OvenProfile = (value: unknown): OvenProfileType =>
  brandOvenProfile(looseOvenSchema.parse(value))

// Boundary branding for an ingredient list alone — what the in-place correction
// (`updateIngredients`) passes through, the steps and the oven untouched.
export const Ingredients = (value: unknown): IngredientType[] =>
  z.array(looseIngredientSchema).parse(value).map(brandIngredient)

const brandLooseSettings = (s: z.infer<typeof looseSettingsSchema>): LooseThermomixSettings => ({
  ...(s.time ? { time: ThermomixTime(s.time) } : {}),
  ...(s.temperature ? { temperature: ThermomixTemperature(s.temperature) } : {}),
  ...(s.speed ? { speed: ThermomixSpeed(s.speed) } : {}),
  ...(s.reverse ? { reverse: s.reverse } : {}),
})

// One step as the boundaries hand it over: its text plus the machine settings only a
// Thermomix version keeps. The single shape `updateSteps` speaks, whichever world the
// version belongs to — the command is what knows its kind and drops what does not
// apply.
export type LooseVersionStep = { text: StepTextType; settings: LooseThermomixSettings }

// Boundary branding for a step list alone — what the in-place correction
// (`updateSteps`) passes through, the ingredients and the oven untouched.
export const VersionSteps = (value: unknown): LooseVersionStep[] =>
  z
    .array(z.object({ text: z.unknown(), settings: looseSettingsSchema.nullish() }))
    .parse(value)
    .map((step) => ({
      text: StepText(step.text),
      settings: brandLooseSettings(step.settings ?? {}),
    }))

// Every scalar goes through its branded constructor, so a raw payload never sneaks
// in, then `toCoffeeParameters` normalizes the blocks (absent keys, no empty milk).
const brandCoffeeParameters = (
  raw: z.infer<typeof looseCoffeeParametersSchema>,
): CoffeeParametersType =>
  toCoffeeParameters({
    beans: {
      ...(raw.beans?.name ? { name: CoffeeBeanName(raw.beans.name) } : {}),
      ...(raw.beans?.country ? { country: CoffeeCountry(raw.beans.country) } : {}),
      ...(raw.beans?.producer ? { producer: CoffeeProducer(raw.beans.producer) } : {}),
      ...(raw.beans?.roast ? { roast: CoffeeRoast(raw.beans.roast) } : {}),
      ...(raw.beans?.roastedOn ? { roastedOn: RoastDate(raw.beans.roastedOn) } : {}),
      ...(raw.beans?.dose ? { dose: CoffeeDose(raw.beans.dose) } : {}),
    },
    water: {
      ...(raw.water?.kind ? { kind: CoffeeWaterKind(raw.water.kind) } : {}),
      ...(raw.water?.amount ? { amount: CoffeeWater(raw.water.amount) } : {}),
      ...(raw.water?.temperature ? { temperature: CoffeeTemperature(raw.water.temperature) } : {}),
    },
    extraction: {
      ...(raw.extraction?.grind ? { grind: CoffeeGrind(raw.extraction.grind) } : {}),
      ...(raw.extraction?.time ? { time: CoffeeTime(raw.extraction.time) } : {}),
      ...(raw.extraction?.yield ? { yield: CoffeeYield(raw.extraction.yield) } : {}),
    },
    milk: {
      ...(raw.milk?.kind ? { kind: CoffeeMilkKind(raw.milk.kind) } : {}),
      ...(raw.milk?.amount ? { amount: CoffeeMilkAmount(raw.milk.amount) } : {}),
      ...(raw.milk?.temperature ? { temperature: CoffeeTemperature(raw.milk.temperature) } : {}),
    },
    gear: {
      ...(raw.gear?.machine ? { machine: CoffeeMachine(raw.gear.machine) } : {}),
      ...(raw.gear?.grinder ? { grinder: CoffeeGrinder(raw.gear.grinder) } : {}),
    },
  })

// Boundary branding for a coffee version's parameters alone — what the in-place
// correction (`updateCoffeeParameters`) passes through, steps untouched.
export const CoffeeParameters = (value: unknown): CoffeeParametersType =>
  brandCoffeeParameters(looseCoffeeParametersSchema.parse(value))

const versionContentSchema = z
  .discriminatedUnion('kind', [dishContentSchema, thermomixContentSchema, coffeeContentSchema])
  .transform((raw): VersionContentType => {
    if (raw.kind === 'coffee') return { kind: 'coffee', ...brandCoffeeParameters(raw) }
    const ingredients = raw.ingredients.map(brandIngredient)
    // The oven profile is the one thing the two cooking bodies share.
    const oven = raw.oven ? { oven: brandOvenProfile(raw.oven) } : {}
    if (raw.kind === 'dish') {
      return { kind: 'dish', ingredients, steps: raw.steps.map((s) => StepText(s)), ...oven }
    }
    const texts = raw.steps.map((s) => StepText(s.text))
    const settings = raw.steps.map((s) => brandLooseSettings(s.settings ?? {}))
    return { kind: 'thermomix', ingredients, steps: thermomixSteps(texts, settings), ...oven }
  })

export const VersionContent = (value: unknown): VersionContentType =>
  versionContentSchema.parse(value)
