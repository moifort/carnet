import { bestRating, toTestCount, versionToOpen } from '~/domain/recipe/business-rules'
import {
  type CoffeeBeans,
  type CoffeeContent,
  type CoffeeExtraction,
  type CoffeeGear,
  type CoffeeMilk,
  type CoffeeWaterSpec,
  restDays,
} from '~/domain/recipe/content/coffee'
import type { DishContent } from '~/domain/recipe/content/dish'
import type { ThermomixContent, ThermomixStep } from '~/domain/recipe/content/thermomix'
import type { VersionContent } from '~/domain/recipe/content/types'
import type { RecipeLibraryPage } from '~/domain/recipe/query'
import type { CoffeeVocabulary } from '~/domain/recipe/vocabulary'
import { builder } from '~/domain/shared/graphql/builder'
import type {
  Ingredient,
  Recipe,
  RecipeVersion,
  ThermomixSettings,
  VersionNumber,
} from '../../types'
import { BrewMethodEnum, DishCategoryEnum, RecipeTypeEnum, VersionOriginKindEnum } from './enums'

export const IngredientType = builder.objectRef<Ingredient>('Ingredient').implement({
  description:
    'One line of the ingredient list: what it is and how much of it. The list keeps its ' +
    'order, e.g. `"Flour — 250 g"`, then `"Butter — 100 g"`, then `"Eggs — 3"`.',
  fields: (t) => ({
    name: t.expose('name', {
      type: 'IngredientName',
      description: 'What the ingredient is, e.g. `"Flour"` or `"Fine salt"`',
    }),
    quantity: t.expose('quantity', {
      type: 'IngredientQuantity',
      description: 'How much of it, unit included, e.g. `"250 g"`, `"2 tbsp"`, `"1 pinch"`',
    }),
  }),
})

export const ThermomixSettingsType = builder
  .objectRef<ThermomixSettings>('ThermomixSettings')
  .implement({
    description:
      'The Thermomix machine settings that go with one step (only for Thermomix recipes). Every field ' +
      'is optional — a step can set just a speed, or a full time + temperature + speed combo, ' +
      'e.g. `"10 min / 100°C / speed 2"`.',
    fields: (t) => ({
      time: t.field({
        type: 'ThermomixTime',
        nullable: true,
        description: 'How long the step runs, e.g. `"10 min"` or `"30 s"` (`null` if not set)',
        resolve: (s) => s.time ?? null,
      }),
      temperature: t.field({
        type: 'ThermomixTemperature',
        nullable: true,
        description: 'The cooking temperature, e.g. `"100°C"` or `"Varoma"` (`null` if not set)',
        resolve: (s) => s.temperature ?? null,
      }),
      speed: t.field({
        type: 'ThermomixSpeed',
        nullable: true,
        description: 'The blade speed, e.g. `"2"`, `"kneading"`, `"turbo"` (`null` if not set)',
        resolve: (s) => s.speed ?? null,
      }),
      reverse: t.boolean({
        nullable: true,
        description:
          'Whether the blades spin in reverse (gentle mixing) — `true`/`false`, `null` if not set',
        resolve: (s) => s.reverse ?? null,
      }),
    }),
  })

export const DishContentType = builder.objectRef<DishContent>('DishContent').implement({
  description:
    'The body of a cooked-dish version: its ingredient list and its plain-text method (no ' +
    'per-step machine settings).',
  fields: (t) => ({
    ingredients: t.field({
      type: [IngredientType],
      description:
        'The full ingredient list, in order, e.g. `"Flour — 250 g"` then `"Eggs — 3"` (empty ' +
        'list when it has none)',
      resolve: (c) => c.ingredients,
    }),
    steps: t.expose('steps', {
      type: ['StepText'],
      description:
        'The method, one short instruction per step, in order, e.g. `"Fold in the egg whites"`',
    }),
  }),
})

export const ThermomixStepType = builder.objectRef<ThermomixStep>('ThermomixStep').implement({
  description:
    'One Thermomix step: its instruction plus the machine settings that go with it. A plain ' +
    'step (no machine settings) carries an empty settings object.',
  fields: (t) => ({
    text: t.expose('text', {
      type: 'StepText',
      description: 'The step instruction, e.g. `"Mix the onions"`',
    }),
    settings: t.field({
      type: ThermomixSettingsType,
      description:
        'The Thermomix settings for this step, e.g. `"10 min / 100°C / speed 2"` (every field ' +
        'left out = a plain step)',
      resolve: (s) => s.settings,
    }),
  }),
})

export const ThermomixContentType = builder
  .objectRef<ThermomixContent>('ThermomixContent')
  .implement({
    description:
      'The body of a Thermomix version: its ingredient list and its steps, each carrying its ' +
      'own Thermomix settings.',
    fields: (t) => ({
      ingredients: t.field({
        type: [IngredientType],
        description: 'The full ingredient list, in order (empty list when it has none)',
        resolve: (c) => c.ingredients,
      }),
      steps: t.field({
        type: [ThermomixStepType],
        description: 'The method, each step carrying its own Thermomix settings',
        resolve: (c) => c.steps,
      }),
    }),
  })

export const CoffeeBeansType = builder.objectRef<CoffeeBeans>('CoffeeBeans').implement({
  description:
    'The coffee itself: what is in the bag and how much of it went in. Every field is optional — ' +
    'a cook who only knows the dose still logs the dose.',
  fields: (t) => ({
    name: t.field({
      type: 'CoffeeBeanName',
      nullable: true,
      description: 'Roaster and lot, e.g. `"Belleville — Guji"` (`null` if not set)',
      resolve: (b) => b.name ?? null,
    }),
    country: t.field({
      type: 'CoffeeCountry',
      nullable: true,
      description: 'Where it grew, e.g. `"Éthiopie"` (`null` if not set)',
      resolve: (b) => b.country ?? null,
    }),
    producer: t.field({
      type: 'CoffeeProducer',
      nullable: true,
      description: 'Farm, washing station or co-op, e.g. `"Coop. Hambela"` (`null` if not set)',
      resolve: (b) => b.producer ?? null,
    }),
    roastedOn: t.field({
      type: 'DateTime',
      nullable: true,
      description:
        'When the beans were roasted, e.g. `"2026-06-12T00:00:00.000Z"`. See the version’s ' +
        '`restDays` for how long they rested before this cup. `null` if not set.',
      resolve: (b) => b.roastedOn ?? null,
    }),
    dose: t.field({
      type: 'CoffeeDose',
      nullable: true,
      description: 'The ground coffee that goes in, e.g. `"18 g"` (`null` if not set)',
      resolve: (b) => b.dose ?? null,
    }),
  }),
})

export const CoffeeWaterSpecType = builder.objectRef<CoffeeWaterSpec>('CoffeeWaterSpec').implement({
  description:
    'The water, which is half the cup: what it is, how much of it, how hot. Every field is ' +
    'optional.',
  fields: (t) => ({
    kind: t.field({
      type: 'CoffeeWaterKind',
      nullable: true,
      description:
        'What the water is, e.g. `"Robinet (dureté 3/5)"` or `"Volvic"` (`null` if not set)',
      resolve: (w) => w.kind ?? null,
    }),
    amount: t.field({
      type: 'CoffeeWater',
      nullable: true,
      description: 'The TOTAL water, e.g. `"300 g"` (`null` if not set)',
      resolve: (w) => w.amount ?? null,
    }),
    temperature: t.field({
      type: 'CoffeeTemperature',
      nullable: true,
      description: 'The water temperature, e.g. `"93°C"` (`null` if not set)',
      resolve: (w) => w.temperature ?? null,
    }),
  }),
})

export const CoffeeExtractionType = builder
  .objectRef<CoffeeExtraction>('CoffeeExtraction')
  .implement({
    description: 'The three dials the cook turns between two attempts. Every field is optional.',
    fields: (t) => ({
      grind: t.field({
        type: 'CoffeeGrind',
        nullable: true,
        description: 'How fine it is ground, e.g. `"Niveau 12"` (`null` if not set)',
        resolve: (e) => e.grind ?? null,
      }),
      time: t.field({
        type: 'CoffeeTime',
        nullable: true,
        description: 'The total brew time, e.g. `"28 s"` (`null` if not set)',
        resolve: (e) => e.time ?? null,
      }),
      yield: t.field({
        type: 'CoffeeYield',
        nullable: true,
        description: 'What lands in the cup, e.g. `"36 g"` (`null` if not set)',
        resolve: (e) => e.yield ?? null,
      }),
    }),
  })

export const CoffeeMilkType = builder.objectRef<CoffeeMilk>('CoffeeMilk').implement({
  description:
    'The milk of a milk drink. The whole block is `null` on a drink that has none — an ' +
    'espresso, a V60.',
  fields: (t) => ({
    kind: t.field({
      type: 'CoffeeMilkKind',
      nullable: true,
      description: 'What the milk is, e.g. `"Avoine Oatly"` (`null` if not set)',
      resolve: (m) => m.kind ?? null,
    }),
    amount: t.field({
      type: 'CoffeeMilkAmount',
      nullable: true,
      description: 'How much of it, e.g. `"150 ml"` (`null` if not set)',
      resolve: (m) => m.amount ?? null,
    }),
    temperature: t.field({
      type: 'CoffeeTemperature',
      nullable: true,
      description: 'The steaming temperature, e.g. `"65°C"` (`null` if not set)',
      resolve: (m) => m.temperature ?? null,
    }),
  }),
})

export const CoffeeGearType = builder.objectRef<CoffeeGear>('CoffeeGear').implement({
  description:
    'What brews it and what grinds it. Versioned along with the rest: a version stays ' +
    'reproducible on its own, and swapping grinders shows up in the lineage.',
  fields: (t) => ({
    machine: t.field({
      type: 'CoffeeMachine',
      nullable: true,
      description:
        'Brand and model, e.g. `"Rancilio Silvia"` or `"Hario V60 02"` (`null` if not set)',
      resolve: (g) => g.machine ?? null,
    }),
    grinder: t.field({
      type: 'CoffeeGrinder',
      nullable: true,
      description: 'Brand and model, e.g. `"Niche Zero"` (`null` if not set)',
      resolve: (g) => g.grinder ?? null,
    }),
  }),
})

export const CoffeeContentType = builder.objectRef<CoffeeContent>('CoffeeContent').implement({
  description:
    'The body of a coffee version: the parameters it is set by plus, optionally, its brewing ' +
    'steps. There is no ingredient list — the dose, the water and the milk ARE parameters. How ' +
    'the coffee is brewed is not here either — that is the recipe’s `method`, fixed across the ' +
    'whole lineage.',
  fields: (t) => ({
    beans: t.field({
      type: CoffeeBeansType,
      description: 'The coffee itself and its dose',
      resolve: (c) => c.beans,
    }),
    water: t.field({
      type: CoffeeWaterSpecType,
      description: 'The water: what it is, how much, how hot',
      resolve: (c) => c.water,
    }),
    extraction: t.field({
      type: CoffeeExtractionType,
      description: 'The dials: grind, brew time, what lands in the cup',
      resolve: (c) => c.extraction,
    }),
    milk: t.field({
      type: CoffeeMilkType,
      nullable: true,
      description: 'The milk, or `null` on a drink that has none — an espresso, a V60',
      resolve: (c) => c.milk ?? null,
    }),
    gear: t.field({
      type: CoffeeGearType,
      description: 'What brews it and what grinds it',
      resolve: (c) => c.gear,
    }),
  }),
})

export const VersionContentUnion = builder.unionType('VersionContent', {
  description:
    'The body of a version, which depends on the recipe type: a `DishContent` for a cooked ' +
    'dish, a `ThermomixContent` for a Thermomix recipe, a `CoffeeContent` for a coffee.',
  types: [DishContentType, ThermomixContentType, CoffeeContentType],
  resolveType: (content: VersionContent) =>
    content.kind === 'dish'
      ? 'DishContent'
      : content.kind === 'coffee'
        ? 'CoffeeContent'
        : 'ThermomixContent',
})

// A version is also an attempt: immutable content/lineage, plus its outcome fields
// (rating/remarks/executedAt) written once when executed. `tried` derives from
// `executedAt`.
export const VersionType = builder.objectRef<RecipeVersion>('Version').implement({
  description:
    'One version of a recipe — and, at the same time, one attempt (a real cook in the ' +
    'kitchen). Two sides to it: the CONTENT (its ingredients and steps, frozen the moment the ' +
    'version is created) and the OUTCOME (its rating and remarks, filled in once you have ' +
    'actually cooked it). Versions form a chain: `v1 → v2 → v3` … Each new version builds on ' +
    'the one before, so you can see what changed and whether it made the dish better.',
  fields: (t) => ({
    recipeId: t.expose('recipeId', {
      type: 'RecipeId',
      description: 'Which recipe this version belongs to, e.g. the id of `"Grandma’s lasagna"`',
    }),
    number: t.expose('number', {
      type: 'VersionNumber',
      description:
        'Its rank in the chain — `1` is the original import, `2` the first tweak, and so on',
    }),
    createdAt: t.expose('createdAt', {
      type: 'DateTime',
      description:
        'When this version was created (not when it was cooked — see executedAt), e.g. ' +
        '`"2026-07-18T14:30:00.000Z"`',
    }),
    updatedAt: t.expose('updatedAt', {
      type: 'DateTime',
      description:
        'When this version was last edited — its attempt re-recorded, its tips or its coffee ' +
        'parameters corrected. Same as createdAt until something is changed on it, e.g. ' +
        '`"2026-07-20T09:05:00.000Z"`',
    }),
    originKind: t.field({
      type: VersionOriginKindEnum,
      description: 'Where this version came from: the import, an AI suggestion, or written by hand',
      resolve: (v) => v.origin.kind,
    }),
    originDetail: t.string({
      nullable: true,
      description:
        'A short label about its origin, e.g. `"Marmiton"` (the site it was imported from), or ' +
        '`null` if none',
      resolve: (v) => v.origin.detail ?? null,
    }),
    change: t.exposeString('change', {
      nullable: true,
      description:
        'A short summary of what this version changes versus the previous one, e.g. `"Baked at ' +
        '180°C instead of 200°C"`. A dish or Thermomix recipe may change several things at once. ' +
        '`null` on the original `v1`, which changes nothing.',
    }),
    basedOn: t.field({
      type: 'VersionNumber',
      nullable: true,
      description:
        'The version this one iterates on — the attempt it was built from, e.g. `2` for a `v3` ' +
        'proposed after cooking `v2`. `null` on the original `v1`, which builds on nothing.',
      resolve: (v) => v.basedOn ?? null,
    }),
    why: t.string({
      nullable: true,
      description:
        'The reason behind that change, e.g. `"The top was burning at 200°C"`. `null` when not ' +
        'given.',
      resolve: (v) => v.why ?? null,
    }),
    content: t.field({
      type: VersionContentUnion,
      description:
        'This version’s body — its ingredients and steps. A `DishContent` for a cooked dish ' +
        '(plain-text steps), a `ThermomixContent` for a Thermomix recipe (each step carrying its ' +
        'machine settings), a `CoffeeContent` for a coffee (each step carrying its extraction ' +
        'settings).',
      resolve: (v) => v.content,
    }),
    restDays: t.int({
      nullable: true,
      description:
        'How many full days the beans rested between the roast and this version, e.g. `14`. ' +
        'Counted to the version’s creation, so it is frozen and stays comparable from one ' +
        'attempt to the next. `null` on anything that is not a coffee, on a coffee with no ' +
        'roast date, and on one whose roast date is in the future.',
      resolve: (v) => restDays(v) ?? null,
    }),
    tips: t.field({
      type: ['Tip'],
      description:
        'This version’s cooking tips — serving, storage or technique advice, e.g. `"Serve over ' +
        'rice"`. Empty list when it has none. Unlike the content, they are rewritable in place ' +
        '(see updateTips) — refining the advice never creates a version.',
      resolve: (v) => v.tips,
    }),
    executedAt: t.field({
      type: 'DateTime',
      nullable: true,
      description:
        'The day you actually cooked this version, e.g. `"2026-07-18T14:30:00.000Z"`. `null` ' +
        'means it is still a planned attempt (a to-do you have lined up but not tried yet).',
      resolve: (v) => v.executedAt ?? null,
    }),
    tried: t.boolean({
      description:
        'The quick yes/no of the field above: `true` once you have cooked and rated it, `false` ' +
        'while it is still waiting to be tried',
      resolve: (v) => v.executedAt !== undefined,
    }),
    toTest: t.boolean({
      description:
        'Whether this version is on your to-cook list, e.g. `true` for the version you just got ' +
        'out of requestImprovement. Only an improvement puts a version there; cooking it (a ' +
        'rating, a photo, remarks) takes it off.',
      resolve: (v) => v.toTest === true,
    }),
    rating: t.field({
      type: 'Rating',
      nullable: true,
      description:
        'Your rating of this attempt, from `1` (bad) to `5` (excellent). `null` until you have ' +
        'cooked it. The recipe’s best rating across its versions drives what it displays (see ' +
        'bestRating).',
      resolve: (v) => v.rating ?? null,
    }),
    remarks: t.field({
      type: 'Remarks',
      nullable: true,
      description:
        'Your free notes on how it turned out, e.g. `"Still a touch too sweet, but the texture ' +
        'is spot on"`. `null` until you have cooked it.',
      resolve: (v) => v.remarks ?? null,
    }),
    photoUrl: t.string({
      nullable: true,
      description:
        'A link to the photo of the result, e.g. `"https://…/lasagna.jpg"` (always `null` for ' +
        'now — photos aren’t stored yet)',
      resolve: () => null,
    }),
  }),
})

export const RecipeType = builder.objectRef<Recipe>('Recipe')

RecipeType.implement({
  description:
    'A dish you are perfecting over time. A recipe is the whole experiment, not a single ' +
    'recipe card: it holds a chain of versions (v1, v2, v3 …), each one an attempt in the ' +
    'kitchen. Its state is derived from that chain — its best rating (bestRating) and the version ' +
    'to open from the home (versionToOpen). Think `"Grandma’s lasagna"` and every attempt you ' +
    'have made to nail it.',
  fields: (t) => ({
    id: t.expose('id', {
      type: 'RecipeId',
      description: 'Its unique identifier, e.g. `"9f1c…-a3b2"`',
    }),
    type: t.expose('type', {
      type: RecipeTypeEnum,
      description:
        'Whether it is a cooked dish (`DISH`), a Thermomix recipe (`THERMOMIX`) or a coffee ' +
        '(`COFFEE`)',
    }),
    category: t.expose('category', {
      type: DishCategoryEnum,
      description:
        'Which course it is, e.g. `DESSERT` for a tarte tatin. Set once at import and shared by ' +
        'every version; used to group the library. A coffee is always a `DRINK` — its own axis ' +
        'is `method`.',
    }),
    method: t.field({
      type: BrewMethodEnum,
      nullable: true,
      description:
        'How it is brewed, e.g. `V60`. Set once at import and shared by every version; used to ' +
        'group the coffee tab. `null` on anything that is not a `COFFEE`.',
      resolve: (r) => r.method ?? null,
    }),
    title: t.expose('title', {
      type: 'RecipeTitle',
      description: 'Its name, e.g. `"Grandma’s lasagna"`',
    }),
    createdAt: t.expose('createdAt', {
      type: 'DateTime',
      description: 'When the recipe was first imported, e.g. `"2026-07-18T14:30:00.000Z"`',
    }),
    updatedAt: t.expose('updatedAt', {
      type: 'DateTime',
      description:
        'When you last worked on it — the date of the version it opens on (the best-rated ' +
        'one), e.g. `"2026-07-18T14:30:00.000Z"`. Renaming it or hearting it does not count ' +
        'as working on it. Drives library sort.',
    }),
    favorite: t.boolean({
      description:
        'Whether you marked it as a favourite, e.g. `true` for the risotto you keep coming back ' +
        'to. Drives the library’s favourites lens (see the `favorite` argument on `recipes`).',
      resolve: (recipe) => recipe.favorite === true,
    }),
    warnings: t.field({
      type: ['Warning'],
      description:
        'The cautions you pinned on this recipe, shown as a banner atop its sheet before ' +
        'anything else, e.g. `"The whisk must go in from the very start"`. Recipe-level — a ' +
        'caution outlives every version. Empty list when it has none. Rewritable in place ' +
        '(see updateWarnings).',
      resolve: (recipe) => recipe.warnings,
    }),
    // Satellite: a real count of the remaining versions, not the highest number — a
    // deleted version leaves a numbering hole the aggregate's allocator never refills.
    // Resolved through the batched loader (shares the scan with bestRating — no extra
    // reads).
    versionCount: t.field({
      type: 'VersionNumber',
      description:
        'How many versions this recipe holds, e.g. `3` after `v1 → v2 → v3`. Deleting a ' +
        'version lowers it, but never renumbers the survivors.',
      resolve: async (r, _a, { loaders }) => {
        const versions = (await loaders.versionsByRecipe.load(r.id)) ?? []
        return versions.length as VersionNumber
      },
    }),
    // Satellite: derived from the same batched loader as versionCount/bestRating —
    // no extra reads.
    toTestCount: t.int({
      description:
        'How many of its versions are waiting to be cooked, e.g. `1` after accepting one ' +
        'improvement. `0` when the recipe owes no cook (see the `toTest` field on Version).',
      resolve: async (r, _a, { loaders }) => {
        const versions = (await loaders.versionsByRecipe.load(r.id)) ?? []
        return toTestCount(versions)
      },
    }),
    // Satellite: the lineage itself, through the same batched loader as everything
    // derived from it. A per-recipe query here would be one read per parent on a page
    // — and even on a single recipe sheet it duplicated the scan that versionToOpen
    // already pays for.
    versions: t.field({
      type: [VersionType],
      description: 'The whole history, oldest first, e.g. `v1 → v2 → v3`',
      resolve: async (r, _a, { loaders }) => (await loaders.versionsByRecipe.load(r.id)) ?? [],
    }),
    // Satellite: the version the recipe sheet opens on, derived from the full lineage via
    // the batched loader (shares the scan with bestRating — no extra reads).
    versionToOpen: t.field({
      type: VersionType,
      description:
        'The version to show first when you open this recipe: your best-rated one (the most ' +
        'recent wins a tie), or — if you have never cooked any — the latest version. A version ' +
        'still waiting to be cooked never opens. Never `null`; a recipe always has at least its ' +
        '`v1`.',
      resolve: async (r, _a, { loaders }) => {
        const versions = (await loaders.versionsByRecipe.load(r.id)) ?? []
        return versionToOpen(versions)
      },
    }),
    // Satellite: the recipe's best attempt rating across its cooked versions, from
    // the batched loader that groups the full lineage by recipe (no extra reads).
    bestRating: t.field({
      type: 'Rating',
      nullable: true,
      description:
        'The best rating this recipe ever got, across all the attempts you have cooked, e.g. ' +
        '`5` (`1`–`5`). `null` if you have never tried any version yet.',
      resolve: async (r, _a, { loaders }) => {
        const versions = (await loaders.versionsByRecipe.load(r.id)) ?? []
        return bestRating(versions)?.rating ?? null
      },
    }),
  }),
})

// A page of the recipe library. `totalCount` is the size of THIS page — the full
// library count is never computed (an infinite-scroll list, not a total).
export const RecipesType = builder.objectRef<RecipeLibraryPage>('Recipes').implement({
  description:
    'One slice of your recipe library — a single "page" of results, the way an app loads a few ' +
    'at a time as you scroll rather than everything at once.',
  fields: (t) => ({
    items: t.field({
      type: [RecipeType],
      description: 'The recipes on this page, e.g. `"Grandma’s lasagna"` then `"Tarte tatin"`',
      resolve: ({ items }) => items,
    }),
    hasMore: t.exposeBoolean('hasMore', {
      description:
        'Are there more recipes to load after this page? (`true` = keep scrolling, `false` = ' +
        'you have reached the end)',
    }),
    totalCount: t.exposeInt('totalCount', {
      description:
        'How many recipes are on THIS page, e.g. `20` — not the size of the whole library, ' +
        'which is never counted (the list is meant to be scrolled, not totalled)',
    }),
  }),
})

export const CoffeeVocabularyType = builder
  .objectRef<CoffeeVocabulary>('CoffeeVocabulary')
  .implement({
    description:
      'The free-text values you have already used on your coffees, per field, most recent ' +
      'first — what each field of the coffee form suggests as you type. Suggestions only: any ' +
      'new value is accepted, and using one is what adds it here. Empty lists on a cook who has ' +
      'never saved a coffee.',
    fields: (t) => ({
      beanNames: t.field({
        type: ['CoffeeBeanName'],
        description: 'Coffees you have logged, e.g. `["Belleville — Guji"]`',
        resolve: (v) => v.beanNames,
      }),
      countries: t.field({
        type: ['CoffeeCountry'],
        description: 'Origins you have logged, e.g. `["Éthiopie"]`',
        resolve: (v) => v.countries,
      }),
      producers: t.field({
        type: ['CoffeeProducer'],
        description: 'Producers you have logged, e.g. `["Coop. Hambela"]`',
        resolve: (v) => v.producers,
      }),
      waterKinds: t.field({
        type: ['CoffeeWaterKind'],
        description: 'Waters you have used, e.g. `["Robinet (dureté 3/5)"]`',
        resolve: (v) => v.waterKinds,
      }),
      milkKinds: t.field({
        type: ['CoffeeMilkKind'],
        description: 'Milks you have used, e.g. `["Avoine Oatly"]`',
        resolve: (v) => v.milkKinds,
      }),
      machines: t.field({
        type: ['CoffeeMachine'],
        description: 'Machines you brew on, e.g. `["Rancilio Silvia"]`',
        resolve: (v) => v.machines,
      }),
      grinders: t.field({
        type: ['CoffeeGrinder'],
        description: 'Grinders you use, e.g. `["Niche Zero"]`',
        resolve: (v) => v.grinders,
      }),
    }),
  })
