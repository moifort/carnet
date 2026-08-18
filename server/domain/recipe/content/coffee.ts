import type {
  CoffeeBeanName,
  CoffeeCountry,
  CoffeeDose,
  CoffeeGrind,
  CoffeeGrinder,
  CoffeeMachine,
  CoffeeMilkAmount,
  CoffeeMilkKind,
  CoffeeProducer,
  CoffeeProfile,
  CoffeeTemperature,
  CoffeeTime,
  CoffeeWater,
  CoffeeWaterKind,
  CoffeeYield,
} from '~/domain/recipe/types'
import type { RecipeVersion } from '~/domain/recipe/version'

// The bag in the cupboard: what the coffee IS, as read off it. Every field is
// optional — a cook who only knows the dose still logs the dose. `roastedOn` is the
// one true date of the whole model: it is the only field anything is derived from
// (see `restDays`), everything else is a display string.
export type CoffeeBeans = {
  name?: CoffeeBeanName // "Belleville — Guji"
  country?: CoffeeCountry // "Éthiopie"
  producer?: CoffeeProducer // "Coop. Hambela"
  roastedOn?: Date
  dose?: CoffeeDose // "18 g"
}

// The water, which is half the cup: what it is (free text — a tap has a hardness, a
// bottle has a brand, a mix has a recipe), how much of it, how hot.
export type CoffeeWaterSpec = {
  kind?: CoffeeWaterKind // "Robinet (dureté 3/5)", "Volvic + minéralisation Lotus"
  amount?: CoffeeWater // "300 g"
  temperature?: CoffeeTemperature // "93°C"
}

// The three dials the cook actually turns between two attempts.
export type CoffeeExtraction = {
  grind?: CoffeeGrind // "fine", "Niveau 12"
  time?: CoffeeTime // "28 s"
  yield?: CoffeeYield // what lands in the cup: "36 g"
}

// Present only on a milk drink — its absence IS the information (an espresso has no
// milk), never an unfilled field.
export type CoffeeMilk = {
  kind?: CoffeeMilkKind // "Entier", "Avoine Oatly"
  amount?: CoffeeMilkAmount // "150 ml"
  temperature?: CoffeeTemperature // "65°C"
}

// What brews it. Versioned rather than aggregate-level: a version stays reproducible
// on its own, and swapping grinders shows up in the lineage.
export type CoffeeGear = {
  machine?: CoffeeMachine // "Rancilio Silvia", "Hario V60 02", "Moccamaster KBG"
  grinder?: CoffeeGrinder // "Niche Zero"
  // The profile the machine runs, by the name it is saved under — "Sera Modern Arc",
  // "Dark roast". The name IS the setting: the pre-infusion, the pressure curve and
  // the temperature it holds live in the machine, and copying them here would
  // duplicate a truth the appliance owns. What the cup needs written down is which
  // profile was pressed.
  profile?: CoffeeProfile
}

// Everything a coffee version is set by, minus its gestures. Named apart from the
// content because it is the exact unit the cook corrects in place
// (`updateCoffeeParameters`) — that edit never touches the steps.
export type CoffeeParameters = {
  beans: CoffeeBeans
  water: CoffeeWaterSpec
  extraction: CoffeeExtraction
  milk?: CoffeeMilk
  gear: CoffeeGear
}

// A coffee recipe's content: its parameters, and nothing else. A coffee has no
// gestures — it is a set of dials, and what a pour-over adds to an espresso is a
// water amount and a time, both parameters already. There is no ingredient list
// either: the dose, the water and the milk ARE parameters — one place for a
// quantity, not two. The brew method is NOT here: it is aggregate-level identity
// (`Recipe.method`), fixed across the whole lineage.
export type CoffeeContent = CoffeeParameters & { kind: 'coffee' }

// The four total blocks empty, and no milk. The single spelling of "nothing filled in
// yet" — what the migration writes and what a fresh manual coffee starts from.
export const emptyCoffeeParameters: CoffeeParameters = {
  beans: {},
  water: {},
  extraction: {},
  gear: {},
}

// The parameters as they arrive from a GraphQL input or an AI proposal: every block
// and every field may be present, absent or `null` (those boundaries speak `null`,
// the domain does not).
export type LooseCoffeeParameters = {
  beans?: Partial<CoffeeBeans> | null
  water?: Partial<CoffeeWaterSpec> | null
  extraction?: Partial<CoffeeExtraction> | null
  milk?: Partial<CoffeeMilk> | null
  gear?: Partial<CoffeeGear> | null
}

// Drop every key whose value is absent or null — the single rule the five blocks
// share, so no block can normalize differently from its neighbours.
const filled = <T extends object>(block: Partial<T> | null | undefined): T =>
  Object.fromEntries(
    Object.entries(block ?? {}).filter(([, value]) => value !== undefined && value !== null),
  ) as T

// Normalize loose parameters into clean ones — the role `toCoffeeSettings` plays for
// a step. A milk with nothing in it becomes no milk at all: absence is how the domain
// says "this drink has none".
export const toCoffeeParameters = (loose: LooseCoffeeParameters): CoffeeParameters => {
  const milk = filled<CoffeeMilk>(loose.milk)
  return {
    beans: filled<CoffeeBeans>(loose.beans),
    water: filled<CoffeeWaterSpec>(loose.water),
    extraction: filled<CoffeeExtraction>(loose.extraction),
    ...(Object.keys(milk).length > 0 ? { milk } : {}),
    gear: filled<CoffeeGear>(loose.gear),
  }
}

const MS_PER_DAY = 86_400_000

// How long the beans rested between the roast and the cup — the coffee variable
// nobody writes down and everybody tastes. Counted to the version's creation, so it
// is frozen by construction and stays comparable from one attempt to the next; never
// stored, hence always right after the roast date is corrected. Absent on anything
// that is not a coffee, without a roast date, or with one in the future (a typo must
// not read as a negative rest).
export const restDays = (version: RecipeVersion): number | undefined => {
  if (version.content.kind !== 'coffee') return undefined
  const { roastedOn } = version.content.beans
  if (!roastedOn) return undefined
  const days = Math.floor((version.createdAt.getTime() - roastedOn.getTime()) / MS_PER_DAY)
  return days < 0 ? undefined : days
}
