import type { Brand } from 'ts-brand'
import type { UserId } from '~/domain/shared/types'

// The culinary experiment domains. Drives colour/icon in the app. `dish` is a
// cooked dish, `thermomix` a Thermomix recipe, `coffee` a brewed coffee.
export const RECIPE_TYPE_VALUES = ['dish', 'thermomix', 'coffee'] as const
export type RecipeType = (typeof RECIPE_TYPE_VALUES)[number]

// How a coffee is brewed — the axis the coffee tab reads on, what the dish
// category is to cooking. Detected by the AI at import and held on the aggregate:
// changing the brew method makes it another coffee, not another version of this
// one. The array order IS the business rank — see `methodRank`.
export const BREW_METHOD_VALUES = [
  'espresso',
  'americano',
  'flat-white',
  'cappuccino',
  'latte',
  'moka', // stovetop pot — Bialetti
  'v60',
  'chemex',
  'drip', // filter machine — Moccamaster
  'aeropress',
  'french-press',
  'cold-brew',
  'other',
] as const
export type BrewMethod = (typeof BREW_METHOD_VALUES)[number]

// The course a dish belongs to. Detected by the AI at import and drives sorting
// in the library (starter → main → dessert → soup → sauce → baking → drink). The
// array order IS the business rank — see `categoryRank`.
export const DISH_CATEGORY_VALUES = [
  'starter',
  'main',
  'dessert',
  'soup',
  'sauce',
  'baking',
  'drink',
] as const
export type DishCategory = (typeof DISH_CATEGORY_VALUES)[number]

// How the paginated library is ordered. `updatedAt` honours the requested
// direction; `category` and `method` always follow their fixed business rank (see
// `categoryRank` / `methodRank`) with `updatedAt` desc as the secondary key.
export type RecipeSort = 'updatedAt' | 'category' | 'method'
export type SortOrder = 'asc' | 'desc'

export type RecipeId = Brand<string, 'RecipeId'>
export type RecipeTitle = Brand<string, 'RecipeTitle'>
export type VersionNumber = Brand<number, 'VersionNumber'>
export type Rating = Brand<number, 'Rating'> // integer 1..5
export type Remarks = Brand<string, 'Remarks'>
export type IngredientName = Brand<string, 'IngredientName'>
export type IngredientQuantity = Brand<string, 'IngredientQuantity'>
export type StepText = Brand<string, 'StepText'>
export type Tip = Brand<string, 'Tip'>
export type Warning = Brand<string, 'Warning'>
export type ThermomixTime = Brand<string, 'ThermomixTime'>
export type ThermomixTemperature = Brand<string, 'ThermomixTemperature'>
export type ThermomixSpeed = Brand<string, 'ThermomixSpeed'>
export type CoffeeGrind = Brand<string, 'CoffeeGrind'>
export type CoffeeWater = Brand<string, 'CoffeeWater'>
export type CoffeeTemperature = Brand<string, 'CoffeeTemperature'>
export type CoffeeTime = Brand<string, 'CoffeeTime'>
export type CoffeeYield = Brand<string, 'CoffeeYield'>
export type CoffeeBeanName = Brand<string, 'CoffeeBeanName'>
export type CoffeeCountry = Brand<string, 'CoffeeCountry'>
export type CoffeeProducer = Brand<string, 'CoffeeProducer'>
export type CoffeeDose = Brand<string, 'CoffeeDose'>
export type CoffeeWaterKind = Brand<string, 'CoffeeWaterKind'>
export type CoffeeMilkKind = Brand<string, 'CoffeeMilkKind'>
export type CoffeeMilkAmount = Brand<string, 'CoffeeMilkAmount'>
export type CoffeeMachine = Brand<string, 'CoffeeMachine'>
export type CoffeeGrinder = Brand<string, 'CoffeeGrinder'>

// A recipe component with its measured quantity ("Gin" → "50 ml", "Beurre" →
// "170 g"). The shopping-list view of the recipe. Ordered list, never a map.
export type Ingredient = { name: IngredientName; quantity: IngredientQuantity }

// Thermomix settings for one step, display-oriented strings (no computation is
// ever done on them — "Varoma" and "pétrin" are valid values, not numbers).
// Every field absent (`{}`) means "this step carries no Thermomix setting" — the
// single representation of a plain step inside a `ThermomixStep`.
export type ThermomixSettings = {
  time?: ThermomixTime // "3 min", "30 s", "1 h 10 min"
  temperature?: ThermomixTemperature // "100°C", "Varoma"
  speed?: ThermomixSpeed // "5", "3,5", "pétrin", "mijotage", "turbo"
  reverse?: boolean // reverse rotation
}

// The extraction settings for one brewing step, display-oriented strings (no
// computation is ever done on them — "fine", "Niveau 12" and "Varoma-less" are
// valid values, not numbers). Every field absent (`{}`) means "this step carries
// no extraction setting" — the single representation of a plain step inside a
// `CoffeeStep`, exactly as for a Thermomix one.
export type CoffeeSettings = {
  grind?: CoffeeGrind // "fine", "moyenne", "Niveau 12"
  water?: CoffeeWater // water poured at this step: "50 g", "300 ml"
  temperature?: CoffeeTemperature // "93°C"
  time?: CoffeeTime // "28 s", "4 min"
  yield?: CoffeeYield // what lands in the cup: "36 g", "250 ml"
}

export type VersionOriginKind = 'import' | 'ai-proposal' | 'manual'
export type VersionOrigin = { kind: VersionOriginKind; detail?: string }

// The lineage entry lives in its own module (the type-agnostic versioning
// envelope), re-exported here so callers keep a single recipe-domain import.
export type { RecipeVersion } from '~/domain/recipe/version'

// The aggregate root. A light pointer document: the heavy version data lives in
// the satellite `recipe-versions` collection keyed `${recipeId}_${number}`. The
// recipe carries no reference/pending pointers: the best rating and the version
// to open are derived from the lineage (see `bestRating`/`versionToOpen`).
export type Recipe = {
  id: RecipeId
  userId: UserId
  type: RecipeType
  // Aggregate-level identity: the dish category is fixed at import and never
  // changes across versions (unlike the versioned recipe content). A coffee is a
  // `drink` — its own axis is `method`.
  category: DishCategory
  // How the coffee is brewed. Aggregate-level identity like `category`, and present
  // if and only if `type === 'coffee'` — the invariant `RecipeCommand.create` and
  // `update` enforce, returning `'method-mismatch'`. Absent, never `null`.
  method?: BrewMethod
  title: RecipeTitle
  // Marked as a favourite by the cook. Aggregate-level like `category`, and absent
  // rather than false when it is not one — the library's favourites lens filters on
  // its presence.
  favorite?: true
  // The cook's recipe-level cautions ("Le fouet doit être mis dès le début") — the
  // banner atop the recipe sheet, so a critical gesture is read before cooking
  // starts. Aggregate-level: a caution outlives every iteration, unlike the
  // versioned `tips`. Rewritable in place (`updateWarnings`). `[]` = none.
  warnings: Warning[]
  // Highest version number ever allocated — a monotonic allocator, never decremented
  // when a version is deleted, so a number is never reused by a later iteration.
  lastVersionNumber: VersionNumber
  createdAt: Date
  // When the recipe was last worked on — NOT when the document was last written.
  // It carries `lastWorkedOn(versions)`, the date of the version the recipe opens
  // on, denormalized here so Firestore can order and page the library on it. Every
  // command that rewrites the lineage restamps it; the ones that only touch the
  // aggregate (`update`, `updateWarnings`) deliberately leave it alone.
  updatedAt: Date
}
