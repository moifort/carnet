import type {
  CoffeeGrind,
  CoffeeSettings,
  CoffeeTemperature,
  CoffeeTime,
  CoffeeWater,
  CoffeeYield,
  Ingredient,
  StepText,
} from '~/domain/recipe/types'

// One brewing step: its instruction text plus the extraction settings that go with
// it. The settings are total — an empty object `{}` is the single spelling of a
// plain (non-extraction) step, never a hole in the list.
export type CoffeeStep = { text: StepText; settings: CoffeeSettings }

// A coffee recipe's content: the ordered ingredient list (the dose, the water, the
// milk) plus the steps, each carrying its own extraction settings. `kind` mirrors
// the recipe type. The brew method is NOT here: it is aggregate-level identity
// (`Recipe.method`), fixed across the whole lineage.
export type CoffeeContent = {
  kind: 'coffee'
  ingredients: Ingredient[]
  steps: CoffeeStep[]
}

// One step's extraction settings as they arrive from a GraphQL input or a branded
// AI proposal: each field may be present or absent (the boundaries strip the
// `null`s their clients speak). An entry with no field at all stands for a plain
// (non-extraction) step.
export type LooseCoffeeSettings = {
  grind?: CoffeeGrind
  water?: CoffeeWater
  temperature?: CoffeeTemperature
  time?: CoffeeTime
  yield?: CoffeeYield
}

const carriesNoSetting = (s: CoffeeSettings) =>
  s.grind === undefined &&
  s.water === undefined &&
  s.temperature === undefined &&
  s.time === undefined &&
  s.yield === undefined

// Normalize loose per-step settings into clean CoffeeSettings, dropping absent
// keys. The single home for this rule so the GraphQL and AI-proposal paths can
// never diverge.
export const toCoffeeSettings = (entries: LooseCoffeeSettings[]): CoffeeSettings[] =>
  entries.map((entry) => ({
    ...(entry.grind ? { grind: entry.grind } : {}),
    ...(entry.water ? { water: entry.water } : {}),
    ...(entry.temperature ? { temperature: entry.temperature } : {}),
    ...(entry.time ? { time: entry.time } : {}),
    ...(entry.yield ? { yield: entry.yield } : {}),
  }))

// Pair step texts with their extraction settings into nested steps. The settings
// are wholly ignored — every step turns plain (`{}`) — when they do not mirror the
// steps one-to-one or when no entry actually carries a setting, so a coffee version
// never stores misaligned or all-empty extraction settings.
export const coffeeSteps = (texts: StepText[], settings: LooseCoffeeSettings[]): CoffeeStep[] => {
  const normalized = toCoffeeSettings(settings)
  const aligned =
    normalized.length === texts.length && normalized.some((s) => !carriesNoSetting(s))
      ? normalized
      : texts.map((): CoffeeSettings => ({}))
  return texts.map((text, i) => ({ text, settings: aligned[i] }))
}
