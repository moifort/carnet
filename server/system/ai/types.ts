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

// What the notebook cooks, as opposed to what it brews. The two are imported by
// two different flows and never share a prompt: the compromise between an
// ingredient list and a set of dials is what made the single one lie.
export type CookingRecipeType = Extract<RecipeType, 'dish' | 'thermomix'>

// Thermomix settings for one step as extracted by Gemini. Plain strings — the
// domain layer validates them into branded types when the user confirms. Every
// field absent (`{}`) means the step carries no Thermomix setting.
export type ImportThermomixSettings = {
  time?: string
  temperature?: string
  speed?: string
  reverse?: boolean
}

// The coffee parameters as extracted by Gemini. Plain strings — the domain layer
// validates them into branded types when the cook confirms. The blocks are total:
// an empty object is "the source says nothing about it", and an absent `milk` is a
// drink that has none.
export type ImportCoffeeParameters = {
  beans: { name?: string; country?: string; producer?: string; roastedOn?: string; dose?: string }
  water: { kind?: string; amount?: string; temperature?: string }
  extraction: { grind?: string; time?: string; yield?: string }
  milk?: { kind?: string; amount?: string; temperature?: string }
  gear: { machine?: string; grinder?: string }
}

// One extracted step: its text plus the Thermomix settings that go with it (`{}` on
// a step that sets nothing, which is every step of a dish). Cooking only — a coffee
// has no steps at all, it is wholly described by its parameters.
export type ImportStep = { text: string; thermomix: ImportThermomixSettings }

// A cooked recipe extracted by Gemini. Plain strings — the domain layer validates
// them into branded types when the cook confirms the import.
export type CookingImportAnalysis = {
  type: CookingRecipeType
  category: DishCategory
  title: string
  sourceLabel?: string
  ingredients: { name: string; quantity: string }[]
  steps: ImportStep[]
  // Cooking tips found in the source (serving, storage, technique) — `[]` when
  // the source carries none.
  tips: string[]
}

// A coffee extracted by Gemini: how it is brewed and the dials it is set by. No
// ingredient list, no steps — a coffee has neither.
export type CoffeeImportAnalysis = {
  method: BrewMethod
  title: string
  sourceLabel?: string
  parameters: ImportCoffeeParameters
  tips: string[]
}

// The analysis cache, keyed by a hash of the source AND of the flow that read it:
// the same photo read as a coffee or as a dish are two different analyses.
export type CachedImport<T> = {
  importHash: ImportHash
  result: T
  cachedAt: Date
}

// What asks for the next version, whichever world it belongs to: the attempts run
// against the current one, or the improvement the cook described outright.
type ProposalRequest = {
  attempts: { rating: number; remarks: string }[]
  // What the cook asked to improve, in their own words. Present instead of the
  // attempts when the proposal comes from the improvement flow.
  improvement?: string
  // The tips of the version iterated on — the proposal returns the complete
  // updated list of the next version (advice found in the remarks lands here).
  currentTips: string[]
}

// Context handed to the cooking proposal model: the full current version, plus what
// asks for the next one.
export type CookingProposalContext = ProposalRequest & {
  type: CookingRecipeType
  category: DishCategory
  currentIngredients: { name: string; quantity: string }[]
  // Each step carries its own settings (an empty object is a step that sets nothing).
  currentSteps: ImportStep[]
}

// Context handed to the coffee proposal model: the dials the extraction starts
// from, and the method it must stay within — a V60 recipe never becomes an espresso.
export type CoffeeProposalContext = ProposalRequest & {
  method: BrewMethod
  currentParameters: ImportCoffeeParameters
}

// Raw next-version proposal produced by Gemini for a cooked recipe — a full
// ingredient/step list plus a short change summary. Plain strings, validated into
// branded types on accept.
export type CookingProposal = {
  changeSummary: string
  rationale: string
  ingredients: { name: string; quantity: string }[]
  steps: ImportStep[]
  // The complete tips list of the next version (current tips carried over,
  // advice found in the remarks folded in).
  tips: string[]
}

// The next version's dials — the whole set, exactly one of them moved. A parameter
// the current version leaves empty comes back empty: the model proposes the field,
// never its value.
export type CoffeeProposal = {
  changeSummary: string
  rationale: string
  parameters: ImportCoffeeParameters
  tips: string[]
}

// Context handed to the tips model: the current version (for grounding the
// rewording) plus the raw advice the cook typed. The answer is the complete
// merged tips list of that same version — no new version is at stake.
export type TipsContext = {
  currentIngredients: { name: string; quantity: string }[]
  currentSteps: ImportStep[]
  // The dials, on a coffee — what it carries instead of ingredients and steps.
  currentParameters?: ImportCoffeeParameters
  currentTips: string[]
  // The tips to add, in the cook's own words.
  requested: string
}
