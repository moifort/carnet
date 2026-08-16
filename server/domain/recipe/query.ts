import * as repository from '~/domain/recipe/infrastructure/repository'
import type {
  BrewMethod,
  DishCategory,
  Recipe,
  RecipeId,
  RecipeSort,
  RecipeType,
  SortOrder,
  VersionNumber,
} from '~/domain/recipe/types'
import type { UserId } from '~/domain/shared/types'

// One page of the recipe library plus the pagination signals. `totalCount` is the
// size of this page (the full count is never computed — see the GraphQL type).
export type RecipeLibraryPage = { items: Recipe[]; hasMore: boolean; totalCount: number }

export type RecipeLibraryCriteria = {
  // Which types the page is about — the cooking notebook asks for
  // `[dish, thermomix]`, the coffee tab for `[coffee]`. Absent = every type.
  types?: RecipeType[]
  category?: DishCategory
  method?: BrewMethod
  // Facet: keep only the favourites. The favourites lens mixes every type, so it is
  // never combined with `types` in practice.
  favorite?: true
  sort: RecipeSort
  order: SortOrder
  limit: number
  after?: RecipeId
}

// The library page never returns more than this many recipes at once, whatever a
// client requests — an infinite-scroll page, not a full dump.
const MAX_LIMIT = 50
const clampLimit = (limit: number) => Math.max(1, Math.min(MAX_LIMIT, Math.trunc(limit)))

export namespace RecipeQuery {
  export const all = async (userId: UserId) => repository.findAllByUser(userId)

  // A page of the user's recipe library, filtered by type and sorted per the view.
  export const library = async (
    userId: UserId,
    criteria: RecipeLibraryCriteria,
  ): Promise<RecipeLibraryPage> => {
    // A category or method filter pins the order to updatedAt desc: ranking recipes
    // within a single course (or a single brew method) is meaningless, and coercing
    // here keeps the composite-index surface bounded (no per-facet × sort index
    // explosion).
    const effective: RecipeLibraryCriteria =
      criteria.category || criteria.method
        ? { ...criteria, sort: 'updatedAt', order: 'desc' }
        : criteria
    const { recipes, hasMore } = await repository.findPage(userId, {
      ...effective,
      limit: clampLimit(effective.limit),
    })
    return { items: recipes, hasMore, totalCount: recipes.length }
  }

  export const byId = async (userId: UserId, id: RecipeId) => {
    const recipe = await repository.findBy(userId, id)
    if (!recipe) return 'not-found' as const
    return recipe
  }

  export const byIds = async (userId: UserId, ids: RecipeId[]) =>
    repository.findManyByIds(userId, ids)

  // The recipes made of this one — the composition link read backwards, what the
  // poolish's sheet answers when it asks who uses it. One query per sheet opened,
  // never one per row.
  export const usedBy = async (userId: UserId, id: RecipeId) => repository.findUsersOf(userId, id)

  export const allVersions = async (userId: UserId) => repository.findAllVersionsByUser(userId)

  // The lineages of the recipes being read, for the satellite loader to group. Takes
  // the ids the page actually holds, so the read scales with the page and not with
  // the library.
  export const versionsOfMany = async (recipeIds: RecipeId[]) =>
    repository.findVersionsOfMany(recipeIds)

  export const versionBy = async (recipeId: RecipeId, number: VersionNumber) => {
    const version = await repository.findVersion(recipeId, number)
    if (!version) return 'not-found' as const
    return version
  }

  // What each free-text coffee field suggests. One keyed document read, whatever the
  // size of the library — never a scan over the versions to collect distinct values.
  export const coffeeVocabulary = async (userId: UserId) => repository.findVocabulary(userId)
}
