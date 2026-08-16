import type { VersionContent } from '~/domain/recipe/content/types'
import { VersionNumber as toVersionNumber } from '~/domain/recipe/primitives'
import {
  BREW_METHOD_VALUES,
  type BrewMethod,
  DISH_CATEGORY_VALUES,
  type DishCategory,
  type Rating,
  type Recipe,
  type RecipeVersion,
  type VersionNumber,
} from '~/domain/recipe/types'

// A version that has been cooked and rated (a `rating` is present) — the subset
// bestRating ranks over.
type RatedVersion = RecipeVersion & { rating: Rating }
const isRated = (version: RecipeVersion): version is RatedVersion => version.rating !== undefined

// The library's category sort follows the course order (starter → main → dessert →
// soup → sauce → baking), not the alphabetical order of the enum values. We
// denormalize that business rank (0..5) onto each recipe document so Firestore can
// order by it with a stable cursor — sorting client-side would break pagination.
export const categoryRank = (category: DishCategory): number =>
  DISH_CATEGORY_VALUES.indexOf(category)

// The coffee tab's method sort follows the brewing order (espresso → milk drinks →
// stovetop → pour-over → immersion), not the alphabetical order of the enum values.
// Denormalized onto the recipe document exactly like `categoryRank`, for the same
// reason: sorting client-side would break pagination.
export const methodRank = (method: BrewMethod): number => BREW_METHOD_VALUES.indexOf(method)

// A brew method belongs to a coffee and to nothing else: a dish or a Thermomix
// recipe that carried one — or a coffee that carried none — would be a recipe the
// coffee tab cannot rank. The aggregate-level twin of the `content.kind ===
// recipe.type` invariant, and the reason `Recipe.method` can stay optional.
export const methodMatchesType = (recipe: Pick<Recipe, 'type' | 'method'>): boolean =>
  recipe.type === 'coffee' ? recipe.method !== undefined : recipe.method === undefined

// Components survive an iteration. The model regenerates the WHOLE ingredient list and
// knows nothing of the pasta dough the cook linked, so the version it produces would
// silently drop it: the cook would say yes to a change of seasoning and find the link
// gone. Carried forward by the CODE, never by the model — the same guard the oven
// profile gets in `proposal/use-case.ts`, placed here instead because a component must
// survive ANY birth of version n+1, not just an AI proposal, and `addVersion` is the
// only door to one.
// Matched on the ingredient name: a regenerated list leaves no other handle. A renamed
// line therefore loses its link, and the cook puts it back in one tap — a lost link
// costs nothing, a wrong one costs a recipe. A line that arrives with its own link
// keeps it: the incoming version is the one being written.
export const carriedComponents = (
  content: VersionContent,
  base: VersionContent | undefined,
): VersionContent => {
  if (content.kind === 'coffee' || base === undefined || base.kind === 'coffee') return content
  const components = new Map(
    base.ingredients.flatMap(({ name, component }) =>
      component ? [[name as string, component]] : [],
    ),
  )
  if (components.size === 0) return content
  return {
    ...content,
    ingredients: content.ingredients.map((i) => {
      const component = i.component ?? components.get(i.name as string)
      return component ? { ...i, component } : i
    }),
  }
}

export const nextVersionNumber = (lastVersionNumber: VersionNumber) =>
  toVersionNumber(lastVersionNumber + 1)

// The recipe's best attempt across its cooked versions, or nothing when none was
// ever tried. Highest rating wins; a tie breaks toward the most recent version
// (highest number), so the freshest high score is the reference. Returns the version
// itself so callers keep both the rating and its lineage position.
export const bestRating = (versions: RecipeVersion[]): RecipeVersion | undefined =>
  versions
    .filter(isRated)
    .reduce<RatedVersion | undefined>(
      (best, version) =>
        best === undefined ||
        version.rating > best.rating ||
        (version.rating === best.rating && version.number > best.number)
          ? version
          : best,
      undefined,
    )

// How many versions are waiting to be cooked — the very list the recipe sheet's
// flask CTA opens. Only an improvement puts a version there, and cooking it takes it
// off, so the count is what the recipe still owes the kitchen, never what it went
// through.
export const toTestCount = (versions: RecipeVersion[]): number =>
  versions.filter(({ toTest }) => toTest === true).length

// Which version the recipe sheet opens on when entered from the home: the best-rated
// one, falling back to the latest version when nothing was ever cooked (a brand-new,
// untried recipe). A version that still owes a cook is never opened — the sheet shows
// what is known to work, and the versions waiting to be tried are reached through the
// flask CTA. Assumes a non-empty lineage (a recipe always owns at least its v1).
export const versionToOpen = (versions: RecipeVersion[]): RecipeVersion =>
  bestRating(versions) ?? versions.reduce((a, b) => (b.number > a.number ? b : a))

// When the recipe was last worked on: the date of the version it opens on — the
// reference version, the one the cook would make again. It is what the library
// files and sorts a recipe by, so the notebook is ordered by cooking, not by
// housekeeping: renaming a recipe, refiling it or hearting it touches the document
// without touching the kitchen, and none of them moves this date. The consequence
// is deliberate: a fresh attempt rated below the reference leaves the recipe where
// it was, because the version that answers for the recipe has not changed.
// Denormalized onto the recipe document (`Recipe.updatedAt`) so Firestore can order
// and page on it — like `categoryRank`, a derived value the write side stamps.
export const lastWorkedOn = (versions: RecipeVersion[]): Date => versionToOpen(versions).updatedAt
