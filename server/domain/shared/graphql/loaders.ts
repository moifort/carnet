import { RecipeQuery } from '~/domain/recipe/query'
import type { Recipe, RecipeId, RecipeVersion } from '~/domain/recipe/types'
import type { UserId } from '~/domain/shared/types'

// Per-request loaders for the satellite fields of RecipeType. One loader set
// lives on each GraphQL context (built per request in routes/graphql.ts), so
// nothing leaks across requests. Each loader memoizes per key and batches every
// key requested in the same resolution tick into a single keyed read — a page of
// recipes selecting a satellite costs one scan, never one read per recipe.

export type Loader<T, A> = { load: (arg: A) => Promise<T | undefined> }

const batchedBy = <T, A>(
  keyOf: (arg: A) => string,
  batch: (args: A[]) => Promise<Map<string, T>>,
): Loader<T, A> => {
  const cache = new Map<string, Promise<T | undefined>>()
  let pending: { arg: A; resolve: (v: T | undefined) => void; reject: (e: unknown) => void }[] = []
  const flush = async () => {
    const calls = pending
    pending = []
    try {
      const results = await batch(calls.map(({ arg }) => arg))
      for (const { arg, resolve } of calls) resolve(results.get(keyOf(arg)))
    } catch (error) {
      for (const { reject } of calls) reject(error)
    }
  }
  return {
    load: (arg) => {
      const key = keyOf(arg)
      const cached = cache.get(key)
      if (cached) return cached
      const loading = new Promise<T | undefined>((resolve, reject) => {
        if (pending.length === 0) Promise.resolve().then(() => process.nextTick(flush))
        pending.push({ arg, resolve, reject })
      })
      cache.set(key, loading)
      return loading
    },
  }
}

export type RecipeSatelliteLoaders = {
  versionsByRecipe: Loader<RecipeVersion[], RecipeId>
  recipesById: Loader<Recipe, RecipeId>
}

export const recipeSatelliteLoaders = (userId: UserId): RecipeSatelliteLoaders => ({
  // The full lineage of each recipe, batched into a single keyed read of exactly the
  // recipes in the batch — backs every field derived from the whole lineage (the best
  // rating, the version to open, the counts) and the lineage itself, which all share
  // this one read. Each lineage comes out oldest first: the read has no order of its
  // own, and `versions` is exposed as the history in order.
  versionsByRecipe: batchedBy(
    (recipeId) => recipeId,
    async (recipeIds) => {
      const versions = await RecipeQuery.versionsOfMany(recipeIds)
      const grouped = new Map<string, RecipeVersion[]>(recipeIds.map((id) => [id, []]))
      for (const version of versions) grouped.get(version.recipeId)?.push(version)
      for (const lineage of grouped.values()) lineage.sort((a, b) => a.number - b.number)
      return grouped
    },
  ),
  // The recipes this one is made of — the bread's poolish, the ravioli's pasta dough.
  // Batched into a single keyed read of exactly the links the sheet holds, and scoped
  // to the cook, so an id that is not theirs (or a recipe they deleted) simply resolves
  // to nothing rather than answering with someone else's page. The lineage each linked
  // recipe needs for its rating goes through `versionsByRecipe`, which batches them all
  // into the same scan: a sheet never pays a scan per linked recipe.
  recipesById: batchedBy(
    (recipeId) => recipeId,
    async (recipeIds) => {
      const recipes = await RecipeQuery.byIds(userId, recipeIds)
      return new Map(recipes.map((recipe) => [recipe.id as string, recipe]))
    },
  ),
})
