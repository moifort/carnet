import type { OvenProfile } from '~/domain/recipe/content/oven'
import type {
  Ingredient,
  StepText,
  ThermomixSettings,
  ThermomixSpeed,
  ThermomixTemperature,
  ThermomixTime,
} from '~/domain/recipe/types'

// One Thermomix step: its instruction text plus the machine settings that go with
// it. The settings are total — an empty object `{}` is the single spelling of a
// plain (non-machine) step, never a hole in the list.
export type ThermomixStep = { text: StepText; settings: ThermomixSettings }

// A Thermomix recipe's content: the ordered ingredient list plus the steps, each
// carrying its own Thermomix settings. `kind` mirrors the recipe type.
export type ThermomixContent = {
  kind: 'thermomix'
  ingredients: Ingredient[]
  steps: ThermomixStep[]
  // The oven settings this version bakes at — a dough kneaded on the machine still
  // finishes in the oven. Absent when it never does.
  oven?: OvenProfile
}

// One step's Thermomix settings as they arrive from a GraphQL input or a branded
// AI proposal: each field may be present or absent (the boundaries strip the
// `null`s their clients speak). An entry with no field at all stands for a plain
// (non-Thermomix) step.
export type LooseThermomixSettings = {
  time?: ThermomixTime
  temperature?: ThermomixTemperature
  speed?: ThermomixSpeed
  reverse?: boolean
}

const carriesNoSetting = (s: ThermomixSettings) =>
  s.time === undefined && s.temperature === undefined && s.speed === undefined && !s.reverse

// Normalize loose per-step settings into clean ThermomixSettings, dropping absent
// keys. `reverse` is kept only when true — false carries no information (a step
// whose only "setting" is reverse:false is not a Thermomix step). The single home
// for this rule so the GraphQL and AI-proposal paths can never diverge.
export const toThermomixSettings = (entries: LooseThermomixSettings[]): ThermomixSettings[] =>
  entries.map((entry) => ({
    ...(entry.time ? { time: entry.time } : {}),
    ...(entry.temperature ? { temperature: entry.temperature } : {}),
    ...(entry.speed ? { speed: entry.speed } : {}),
    ...(entry.reverse ? { reverse: entry.reverse } : {}),
  }))

// Pair step texts with their Thermomix settings into nested steps. The settings
// are wholly ignored — every step turns plain (`{}`) — when they do not mirror the
// steps one-to-one or when no entry actually carries a setting, so a Thermomix
// version never stores misaligned or all-empty machine settings.
export const thermomixSteps = (
  texts: StepText[],
  settings: LooseThermomixSettings[],
): ThermomixStep[] => {
  const normalized = toThermomixSettings(settings)
  const aligned =
    normalized.length === texts.length && normalized.some((s) => !carriesNoSetting(s))
      ? normalized
      : texts.map((): ThermomixSettings => ({}))
  return texts.map((text, i) => ({ text, settings: aligned[i] }))
}
