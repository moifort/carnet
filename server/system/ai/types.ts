import type { Brand } from 'ts-brand'
import type { BrewMethod, DishCategory, RecipeType } from '~/domain/recipe/types'

export type ImportHash = Brand<string, 'ImportHash'>

// The ways a recipe can be imported. Photos and text are ONE source when both are
// given — the cook photographs the two pages of a book and types what the page
// leaves out ("pour 4, au Chemex"), and the model reads them together. A URL
// stands alone: reading a web page is a different capability (and a Premium one).
export type ImportSource =
  | { kind: 'photos'; photos: string[]; text?: string } // base64 JPEGs (no data-URL prefix)
  | { kind: 'url'; url: string }
  | { kind: 'text'; text: string }

// Thermomix settings for one step as extracted by Gemini. Plain strings — the
// domain layer validates them into branded types when the user confirms. Every
// field absent (`{}`) means the step carries no Thermomix setting.
export type ImportThermomixSettings = {
  time?: string
  temperature?: string
  speed?: string
  reverse?: boolean
}

// Extraction settings for one step as extracted by Gemini. Plain strings — the
// domain layer validates them into branded types when the user confirms. Every
// field absent (`{}`) means the step carries no extraction setting.
export type ImportCoffeeSettings = {
  grind?: string
  water?: string
  temperature?: string
  time?: string
  yield?: string
}

// One extracted step: its text plus the settings that go with it — the machine
// ones on a Thermomix recipe, the extraction ones on a coffee. The two are named
// after their context rather than both being `settings`, since this one wire
// carries every recipe type. Plain strings, both total: an empty object `{}` is a
// step that sets nothing (and is what every step of a dish carries).
export type ImportStep = {
  text: string
  thermomix: ImportThermomixSettings
  coffee: ImportCoffeeSettings
}

// Raw structured recipe extracted by Gemini. Plain strings — the domain layer
// validates them into branded types when the user confirms the import.
export type ImportAnalysis = {
  type: RecipeType
  category: DishCategory
  // How the coffee is brewed — absent on anything that is not one.
  method?: BrewMethod
  title: string
  sourceLabel?: string
  ingredients: { name: string; quantity: string }[]
  steps: ImportStep[]
  // Cooking tips found in the source (serving, storage, technique) — `[]` when
  // the source carries none.
  tips: string[]
}

export type CachedImport = {
  importHash: ImportHash
  result: ImportAnalysis
  cachedAt: Date
}

// Context handed to the proposal model: the full current version, plus what asks for
// the next one — the attempts run against it, or the improvement the cook wants.
export type ProposalContext = {
  type: RecipeType
  category: DishCategory
  // The brew method the iteration must stay within — a V60 recipe never becomes an
  // espresso one. Absent on anything that is not a coffee.
  method?: BrewMethod
  currentIngredients: { name: string; quantity: string }[]
  // Each step carries its own settings (an empty object is a step that sets nothing).
  currentSteps: ImportStep[]
  // The tips of the version iterated on — the proposal returns the complete
  // updated list of the next version (advice found in the remarks lands here).
  currentTips: string[]
  attempts: {
    rating: number
    remarks: string
  }[]
  // What the cook asked to improve, in their own words. Present instead of the
  // attempts when the proposal comes from the improvement flow.
  improvement?: string
}

// Raw next-version proposal produced by Gemini — a full ingredient/step list
// plus a short change summary. Plain strings, validated into branded types on accept.
export type Proposal = {
  changeSummary: string
  rationale: string
  ingredients: { name: string; quantity: string }[]
  steps: ImportStep[]
  // The complete tips list of the next version (current tips carried over,
  // advice found in the remarks folded in).
  tips: string[]
}

// Context handed to the tips model: the current version (for grounding the
// rewording) plus the raw advice the cook typed. The answer is the complete
// merged tips list of that same version — no new version is at stake.
export type TipsContext = {
  type: RecipeType
  currentIngredients: { name: string; quantity: string }[]
  currentSteps: ImportStep[]
  currentTips: string[]
  // The tips to add, in the cook's own words.
  requested: string
}
