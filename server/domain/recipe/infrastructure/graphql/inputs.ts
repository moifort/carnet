import type { VersionContent } from '~/domain/recipe/content/types'
import { VersionContent as brandVersionContent } from '~/domain/recipe/primitives'
import { builder } from '~/domain/shared/graphql/builder'
import { domainError } from '~/domain/shared/graphql/errors'
import { BrewMethodEnum, DishCategoryEnum, OvenProgramEnum, RecipeTypeEnum } from './enums'

export const IngredientInput = builder.inputType('IngredientInput', {
  description:
    'One ingredient line to save, e.g. name `"Flour"` + quantity `"250 g"`. Order is kept.',
  fields: (t) => ({
    name: t.field({
      type: 'IngredientName',
      required: true,
      description: 'What it is, e.g. `"Flour"`',
    }),
    quantity: t.field({
      type: 'IngredientQuantity',
      required: true,
      description: 'How much, unit included, e.g. `"250 g"`',
    }),
  }),
})

export const ThermomixSettingsInput = builder.inputType('ThermomixSettingsInput', {
  description:
    'The Thermomix settings to attach to one step, e.g. `"10 min / 100°C / speed 2"`. Every ' +
    'field is optional.',
  fields: (t) => ({
    time: t.field({ type: 'ThermomixTime', description: 'Duration, e.g. `"10 min"`' }),
    temperature: t.field({
      type: 'ThermomixTemperature',
      description: 'Temperature, e.g. `"100°C"`',
    }),
    speed: t.field({ type: 'ThermomixSpeed', description: 'Blade speed, e.g. `"2"` or `"turbo"`' }),
    reverse: t.boolean({
      required: false,
      description: 'Reverse (gentle mixing) on or off, e.g. `true`',
    }),
  }),
})

export const ThermomixStepInput = builder.inputType('ThermomixStepInput', {
  description:
    'One Thermomix step to save: its instruction plus the machine settings that go with it. ' +
    'Send `settings: {}` for a plain step (no machine settings).',
  fields: (t) => ({
    text: t.field({
      type: 'StepText',
      required: true,
      description: 'The step instruction, e.g. `"Mix the onions"`',
    }),
    settings: t.field({
      type: ThermomixSettingsInput,
      required: true,
      description:
        'Its Thermomix settings, e.g. `"10 min / 100°C / speed 2"` (send `{}` for a plain step)',
    }),
  }),
})

export const CoffeeBeansInput = builder.inputType('CoffeeBeansInput', {
  description: 'The coffee itself and its dose. Every field is optional.',
  fields: (t) => ({
    name: t.field({ type: 'CoffeeBeanName', description: 'e.g. `"Belleville — Guji"`' }),
    country: t.field({ type: 'CoffeeCountry', description: 'e.g. `"Éthiopie"`' }),
    producer: t.field({ type: 'CoffeeProducer', description: 'e.g. `"Coop. Hambela"`' }),
    roastedOn: t.field({ type: 'DateTime', description: 'When the beans were roasted' }),
    dose: t.field({ type: 'CoffeeDose', description: 'e.g. `"18 g"`' }),
  }),
})

export const CoffeeWaterSpecInput = builder.inputType('CoffeeWaterSpecInput', {
  description: 'The water: what it is, how much, how hot. Every field is optional.',
  fields: (t) => ({
    kind: t.field({ type: 'CoffeeWaterKind', description: 'e.g. `"Robinet (dureté 3/5)"`' }),
    amount: t.field({ type: 'CoffeeWater', description: 'The TOTAL water, e.g. `"300 g"`' }),
    temperature: t.field({ type: 'CoffeeTemperature', description: 'e.g. `"93°C"`' }),
  }),
})

export const CoffeeExtractionInput = builder.inputType('CoffeeExtractionInput', {
  description: 'The dials: grind, brew time, what lands in the cup. Every field is optional.',
  fields: (t) => ({
    grind: t.field({ type: 'CoffeeGrind', description: 'e.g. `"Niveau 12"`' }),
    time: t.field({ type: 'CoffeeTime', description: 'The total brew time, e.g. `"28 s"`' }),
    yield: t.field({ type: 'CoffeeYield', description: 'e.g. `"36 g"`' }),
  }),
})

export const CoffeeMilkInput = builder.inputType('CoffeeMilkInput', {
  description: 'The milk. Leave the whole block out on a drink that has none — an espresso, a V60.',
  fields: (t) => ({
    kind: t.field({ type: 'CoffeeMilkKind', description: 'e.g. `"Avoine Oatly"`' }),
    amount: t.field({ type: 'CoffeeMilkAmount', description: 'e.g. `"150 ml"`' }),
    temperature: t.field({ type: 'CoffeeTemperature', description: 'e.g. `"65°C"`' }),
  }),
})

export const CoffeeGearInput = builder.inputType('CoffeeGearInput', {
  description: 'What brews it and what grinds it. Every field is optional.',
  fields: (t) => ({
    machine: t.field({ type: 'CoffeeMachine', description: 'e.g. `"Rancilio Silvia"`' }),
    grinder: t.field({ type: 'CoffeeGrinder', description: 'e.g. `"Niche Zero"`' }),
  }),
})

export const CoffeeParametersInput = builder.inputType('CoffeeParametersInput', {
  description:
    'What a coffee version is set by. Every block is optional; leaving one out means nothing is ' +
    'known about it yet, and leaving `milk` out means the drink has none.',
  fields: (t) => ({
    beans: t.field({ type: CoffeeBeansInput, required: false, description: 'The coffee itself' }),
    water: t.field({ type: CoffeeWaterSpecInput, required: false, description: 'The water' }),
    extraction: t.field({
      type: CoffeeExtractionInput,
      required: false,
      description: 'The extraction dials',
    }),
    milk: t.field({ type: CoffeeMilkInput, required: false, description: 'The milk, if any' }),
    gear: t.field({ type: CoffeeGearInput, required: false, description: 'Machine and grinder' }),
  }),
})

export const CoffeeContentInput = builder.inputType('CoffeeContentInput', {
  description:
    'The body of a coffee version: the parameters it is set by. A coffee has neither an ' +
    'ingredient list nor steps — the dose, the water and the milk ARE parameters, and what a ' +
    'coffee is, is its dials.',
  fields: (t) => ({
    beans: t.field({ type: CoffeeBeansInput, required: false, description: 'The coffee itself' }),
    water: t.field({ type: CoffeeWaterSpecInput, required: false, description: 'The water' }),
    extraction: t.field({
      type: CoffeeExtractionInput,
      required: false,
      description: 'The extraction dials',
    }),
    milk: t.field({ type: CoffeeMilkInput, required: false, description: 'The milk, if any' }),
    gear: t.field({ type: CoffeeGearInput, required: false, description: 'Machine and grinder' }),
  }),
})

export const OvenProfileInput = builder.inputType('OvenProfileInput', {
  description:
    'The oven settings to save on this version. Send it only when the dish actually bakes, and ' +
    'omit it entirely otherwise — there is no "no oven" value. `duration` and `core` are each ' +
    'optional: a timed cook has a duration, a probe cook has a core target, a dish can have both.',
  fields: (t) => ({
    program: t.field({
      type: OvenProgramEnum,
      required: true,
      description: 'The heating function, e.g. `CONVECTION`',
    }),
    assisted: t.field({
      type: 'AssistedProgram',
      description:
        'The oven’s own programme code — required when `program` is `ASSISTED`, rejected ' +
        'otherwise. Copy it off `oven.settings`, never type it.',
    }),
    temperature: t.field({
      type: 'OvenTemperature',
      required: true,
      description: 'What the dial is set to, e.g. `180`',
    }),
    duration: t.field({ type: 'OvenDuration', description: 'How long it bakes, e.g. `25`' }),
    core: t.field({
      type: 'OvenCoreTemperature',
      description: 'The probe target at the heart of the food, e.g. `63`',
    }),
  }),
})

export const DishContentInput = builder.inputType('DishContentInput', {
  description: 'The body of a cooked-dish version: its ingredient list and plain-text steps.',
  fields: (t) => ({
    ingredients: t.field({
      type: [IngredientInput],
      required: true,
      description:
        'The ingredient list, in order, e.g. `"Flour — 250 g"` then `"Eggs — 3"` (send `[]` ' +
        'when the recipe has nothing measurable)',
    }),
    steps: t.field({
      type: ['StepText'],
      required: true,
      description:
        'The method, one instruction per step, in order, e.g. `"Fold in the egg whites"`',
    }),
    oven: t.field({
      type: OvenProfileInput,
      description:
        'The oven settings this version bakes at, e.g. `CONVECTION` at `180` for `25` min. ' +
        'Omit it when the dish never goes in the oven.',
    }),
  }),
})

export const ThermomixContentInput = builder.inputType('ThermomixContentInput', {
  description:
    'The body of a Thermomix version: its ingredient list and its steps, each carrying its own ' +
    'Thermomix settings.',
  fields: (t) => ({
    ingredients: t.field({
      type: [IngredientInput],
      required: true,
      description: 'The ingredient list, in order (send `[]` when the recipe has none)',
    }),
    steps: t.field({
      type: [ThermomixStepInput],
      required: true,
      description: 'The method, each step carrying its own Thermomix settings',
    }),
    oven: t.field({
      type: OvenProfileInput,
      description:
        'The oven settings this version bakes at — a dough kneaded on the machine still ' +
        'finishes in the oven. Omit it when it never does.',
    }),
  }),
})

// @oneOf: exactly one of `dish`/`thermomix`/`coffee` must be set, mirroring the
// recipe type — the server rejects the version otherwise (`content-type-mismatch`).
export const VersionContentInput = builder.inputType('VersionContentInput', {
  description:
    'The body of a version, tagged by recipe type: provide EXACTLY ONE of `dish` (a cooked ' +
    'dish), `thermomix` (a Thermomix recipe) or `coffee` (a brewed coffee).',
  isOneOf: true,
  fields: (t) => ({
    dish: t.field({ type: DishContentInput, required: false, description: 'A cooked-dish body' }),
    thermomix: t.field({
      type: ThermomixContentInput,
      required: false,
      description: 'A Thermomix body',
    }),
    coffee: t.field({
      type: CoffeeContentInput,
      required: false,
      description: 'A coffee body',
    }),
  }),
})

// Brand a `@oneOf` content input into the domain's discriminated `VersionContent`.
// The GraphQL layer guarantees exactly one arm is set; the fallback guards the type.
// The raw arms (branded scalars plus the client's `null`s on absent settings) are
// re-validated and paired by the `VersionContent` constructor.
type ContentArm = { ingredients: unknown[]; steps: unknown[]; oven?: unknown }
// The coffee arm carries parameter blocks and nothing else — no ingredient list,
// no steps.
type CoffeeArm = Record<string, unknown>
export const versionContentInput = (input: {
  dish?: ContentArm | null
  thermomix?: ContentArm | null
  coffee?: CoffeeArm | null
}): VersionContent => {
  if (input.dish) return brandVersionContent({ kind: 'dish', ...input.dish })
  if (input.thermomix) return brandVersionContent({ kind: 'thermomix', ...input.thermomix })
  if (input.coffee) return brandVersionContent({ kind: 'coffee', ...input.coffee })
  return domainError('invalid-content')
}

export const CreateRecipeInput = builder.inputType('CreateRecipeInput', {
  description:
    'Everything needed to save a brand-new recipe (its `v1`), once you have reviewed the import ' +
    'preview and confirmed it, e.g. `"Grandma’s lasagna"` with its content',
  fields: (t) => ({
    type: t.field({
      type: RecipeTypeEnum,
      required: true,
      description: 'Cooked dish (`DISH`), Thermomix recipe (`THERMOMIX`) or coffee (`COFFEE`)',
    }),
    category: t.field({
      type: DishCategoryEnum,
      required: true,
      description:
        'Its course, e.g. `MAIN` for lasagna, as detected during import. Ignored on a `COFFEE`, ' +
        'which is always filed as a `DRINK`.',
    }),
    method: t.field({
      type: BrewMethodEnum,
      description:
        'How it is brewed, e.g. `V60`, as detected during import. REQUIRED on a `COFFEE` and ' +
        'rejected on anything else.',
    }),
    title: t.field({
      type: 'RecipeTitle',
      required: true,
      description: 'The recipe’s name, e.g. `"Grandma’s lasagna"`',
    }),
    sourceLabel: t.string({ description: 'Where it came from, e.g. `"Marmiton"` or `"Mum"`' }),
    content: t.field({
      type: VersionContentInput,
      required: true,
      description:
        'The recipe body — provide exactly one of `dish`, `thermomix` or `coffee`, matching `type`',
    }),
    tips: t.field({
      type: ['Tip'],
      required: true,
      defaultValue: [],
      description:
        'The cooking tips found in the source, e.g. `"Serve over rice"` (send `[]` when it has none)',
    }),
  }),
})

export const UpdateRecipeInput = builder.inputType('UpdateRecipeInput', {
  description:
    'What you can retouch on a recipe: its name, its course or its brew method, and whether it ' +
    'is a favourite. Send only what you want to change — anything you leave out stays as it was. ' +
    'Its type is fixed for good.',
  fields: (t) => ({
    title: t.field({
      type: 'RecipeTitle',
      description: 'The new name, e.g. `"Nonna’s lasagna"` (leave out to keep the current one)',
    }),
    category: t.field({
      type: DishCategoryEnum,
      description:
        'The new course, e.g. `DRINK` for a recipe the import filed as `MAIN` (leave out to keep ' +
        'the current one). Ignored on a `COFFEE` — refiling one means changing its `method`.',
    }),
    method: t.field({
      type: BrewMethodEnum,
      description:
        'The new brew method, e.g. `CHEMEX` for a coffee the import filed as `V60` (leave out to ' +
        'keep the current one). Rejected on a recipe that is not a `COFFEE`.',
    }),
    favorite: t.boolean({
      description:
        '`true` marks it as a favourite, `false` un-marks it, e.g. `true` for the risotto you ' +
        'keep coming back to (leave out to keep it as it is)',
    }),
  }),
})

export const RecordAttemptInput = builder.inputType('RecordAttemptInput', {
  description:
    'The result of cooking one version: which version you tried, how you rate it, and your ' +
    'remarks, e.g. `v2` rated `4`. Recorded once — a version’s outcome cannot be edited ' +
    'afterwards.',
  fields: (t) => ({
    recipeId: t.field({
      type: 'RecipeId',
      required: true,
      description: 'Which recipe you cooked, e.g. the id of `"Grandma’s lasagna"`',
    }),
    versionNumber: t.field({
      type: 'VersionNumber',
      required: true,
      description: 'Which version of it you tried, e.g. `2`',
    }),
    rating: t.field({
      type: 'Rating',
      required: true,
      description: 'Your rating, `1` to `5`, e.g. `4`',
    }),
    // Optional: a bare rating ends the flow. Remarks are what asks for a next
    // version, and those go through requestProposal/acceptProposal instead — they
    // are recorded on the version they give birth to, not on this one.
    remarks: t.field({
      type: 'Remarks',
      description: 'Your remarks on how it turned out, e.g. `"Still a touch too sweet"` (optional)',
    }),
    // Placeholder: accepted but not yet persisted — recordAttempt never stores a
    // photoPath and photoUrl resolves null until GCS photo storage is
    // provisioned. Kept on the contract so the app can send it without a schema change.
    photo: t.string({
      description: 'Base64 JPEG of the result, e.g. `"/9j/4AAQSkZJRg…"` (optional; not yet stored)',
    }),
  }),
})
