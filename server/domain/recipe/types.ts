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
export type CoffeeProfile = Brand<string, 'CoffeeProfile'>

// The oven's heating functions — what the dial selects. Technical English symbols,
// never a manufacturer's code: `system/electrolux/program.ts` is the only place that
// knows how a given model spells them, so a new oven costs one mapping table and
// nothing else anywhere. Unranked, unlike `BREW_METHOD_VALUES`: nothing sorts on a
// heating function.
export const OVEN_PROGRAM_VALUES = [
  'conventional', // top + bottom heat, the default of every recipe book
  'convection', // fan-assisted hot air
  'convection-humid',
  'top-heat',
  'bottom-heat',
  'grill',
  'turbo-grill', // grill + fan
  'pizza', // bottom-biased, for a crisp base
  'air-fry', // high fan, low fat
  'steam',
  'steam-combi', // steam + hot air
  'defrost',
  // The oven's OWN programme — "Quiche et tarte fine" and its kin. Not a heating
  // function but a recipe the appliance runs, varying heat and humidity over time,
  // which is why it cannot be rewritten as one of the above: reproducing it means
  // sending the appliance its own code back. `OvenProfile.assisted` carries that
  // code, and this value is what says to read it.
  'assisted',
] as const
export type OvenProgram = (typeof OVEN_PROGRAM_VALUES)[number]

// The oven's numeric dials. Real numbers, not the display strings a Thermomix
// setting is: these are the only recipe values something is computed on — they
// leave as an appliance command.
export type OvenTemperature = Brand<number, 'OvenTemperature'> // integer °C
export type OvenDuration = Brand<number, 'OvenDuration'> // integer minutes
export type OvenCoreTemperature = Brand<number, 'OvenCoreTemperature'> // integer °C

// One of the oven's own assisted-cooking programmes, as the appliance names it
// ("ASSIST_QUICHEANDTARTETHIN"). Opaque on purpose: the notebook neither parses it
// nor curates the catalogue, it copies the code and hands it back.
export type AssistedProgram = Brand<string, 'AssistedProgram'>

// What goes in, with its measured quantity ("Gin" → "50 ml", "Beurre" → "170 g").
// The shopping-list view of the recipe. Ordered list, never a map.
export type Ingredient = {
  name: IngredientName
  quantity: IngredientQuantity
}

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

// How much of a linked recipe this one takes, as a multiplier of what that recipe
// writes: 0.2 is a fifth of it, 1 is it as written. A real number, not a display
// string — it is one of the very few recipe values something is computed on, like
// the oven's dials. Derived at link time from a target quantity the cook types on
// one of the linked recipe's lines ("my flour is 100 g", where it writes 500 g);
// the factor is what is stored, so the link keeps holding as that recipe changes.
export type ComponentScale = Brand<number, 'ComponentScale'>

// A recipe this one is made of, at the quantity it takes of it — the poolish of a
// bread dough, the pasta dough of a ravioli. It holds the RECIPE, never a version:
// which version answers for it is derived at read time (`versionToOpen`), so the
// poolish keeps improving on its own and the bread follows without a single write.
export type Component = {
  recipe: RecipeId
  scale: ComponentScale
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
  // Whether any version of it is hearted — `favorited(versions)`, denormalized here
  // so Firestore can filter the library's favourites lens on a flat field (like
  // `updatedAt` carrying `lastWorkedOn`, and `categoryRank`). Never written by the
  // cook: `updateFavorite` hearts a VERSION, and every command that rewrites the
  // lineage restamps this. Absent rather than false, so presence is the single
  // spelling the query matches on.
  favorite?: true
  // The recipes this one is made of, with the quantity it takes of each. Aggregate
  // level, deliberately: the cook links from the recipe sheet, the link holds for
  // every version of it, and no iteration has to carry it forward. Ordered by when
  // they were linked, one entry per recipe (`linkComponent` upserts). Absent rather
  // than empty, like every other absence in the domain.
  components?: Component[]
  // The same links, ids alone. Denormalized for one reason: `array-contains` cannot
  // query an array of objects, and this is what makes the link readable the OTHER
  // way round — `usedBy`, the recipes a given one is used by. Derived, never a value
  // of its own: `withComponents` writes the two together and nothing else writes
  // either. Same denormalization as `categoryRank` or `favorite`.
  componentIds?: RecipeId[]
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
