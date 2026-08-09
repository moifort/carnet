import type { OvenProfile } from '~/domain/recipe/content/oven'
import type { Ingredient, StepText } from '~/domain/recipe/types'

// A cooked-dish recipe's content: an ordered ingredient list and plain-text steps
// (no per-step machine settings), plus the oven settings it bakes at. `kind` mirrors
// the recipe type.
export type DishContent = {
  kind: 'dish'
  ingredients: Ingredient[]
  steps: StepText[]
  // Absent when the dish never goes in the oven — its absence IS the information,
  // never an empty profile.
  oven?: OvenProfile
}
