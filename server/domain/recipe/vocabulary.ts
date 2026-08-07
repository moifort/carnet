import type { CoffeeParameters } from '~/domain/recipe/content/coffee'
import type {
  CoffeeBeanName,
  CoffeeCountry,
  CoffeeGrinder,
  CoffeeMachine,
  CoffeeMilkKind,
  CoffeeProducer,
  CoffeeWaterKind,
} from '~/domain/recipe/types'
import type { UserId } from '~/domain/shared/types'

// How many values a field remembers. Twenty is a cook's working set — beyond it a
// suggestion list stops being a shortcut and becomes a search.
export const VOCABULARY_MAX = 20

// The free-text values this cook has already used, per field: what every coffee
// field suggests, most recent first. A convenience, never a constraint — typing
// something new is always allowed, and doing so is what teaches it.
export type CoffeeVocabulary = {
  userId: UserId
  beanNames: CoffeeBeanName[]
  countries: CoffeeCountry[]
  producers: CoffeeProducer[]
  waterKinds: CoffeeWaterKind[]
  milkKinds: CoffeeMilkKind[]
  machines: CoffeeMachine[]
  grinders: CoffeeGrinder[]
  updatedAt: Date
}

// What a cook who has never saved a coffee suggests: nothing, in every field. The
// epoch date says "never taught" without needing a separate flag.
export const emptyVocabulary = (userId: UserId): CoffeeVocabulary => ({
  userId,
  beanNames: [],
  countries: [],
  producers: [],
  waterKinds: [],
  milkKinds: [],
  machines: [],
  grinders: [],
  updatedAt: new Date(0),
})

// Most recent first, no duplicate, capped: a value used again rises rather than
// piling up, and the oldest falls off the end.
const remembering = <T extends string>(list: T[], value?: T): T[] =>
  value === undefined ? list : [value, ...list.filter((v) => v !== value)].slice(0, VOCABULARY_MAX)

// What a saved coffee version teaches. Only the free-text fields are vocabulary: a
// dose, a time or a yield is a measurement, and suggesting "28 s" would be noise.
export const learnedVocabulary = (
  current: CoffeeVocabulary,
  parameters: CoffeeParameters,
): CoffeeVocabulary => ({
  ...current,
  beanNames: remembering(current.beanNames, parameters.beans.name),
  countries: remembering(current.countries, parameters.beans.country),
  producers: remembering(current.producers, parameters.beans.producer),
  waterKinds: remembering(current.waterKinds, parameters.water.kind),
  milkKinds: remembering(current.milkKinds, parameters.milk?.kind),
  machines: remembering(current.machines, parameters.gear.machine),
  grinders: remembering(current.grinders, parameters.gear.grinder),
  updatedAt: new Date(),
})
