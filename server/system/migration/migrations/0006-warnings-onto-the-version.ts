import { MigrationName, MigrationVersion } from '~/system/migration/primitives'
import type { Migration } from '~/system/migration/types'

// The cook's cautions move from the recipe onto its versions, where everything that
// describes the plate already lives. They were pinned as a truth about the whole
// recipe, so they land on EVERY version of it rather than on the one that answers
// for it: putting them on that one alone would make the banner vanish the day the
// cook opens another version, which is exactly what a caution must never do. The
// aggregate's field is dropped once its versions carry it, and a recipe that never
// pinned one costs a single write.
export const migration0006: Migration = {
  version: MigrationVersion(6),
  name: MigrationName('warnings-onto-the-version'),
  migrate: async ({ db }) => {
    const [recipes, versions] = await Promise.all([
      db.collection('recipes').get(),
      db.collection('recipe-versions').get(),
    ])
    // Grouped in memory rather than queried per recipe, like `migration0004`, and
    // keyed on the stored `id` field — what a version's `recipeId` points at.
    const lineages = new Map<string, typeof versions.docs>()
    for (const doc of versions.docs) {
      const { recipeId } = doc.data()
      lineages.set(recipeId, [...(lineages.get(recipeId) ?? []), doc])
    }

    let transformed = 0
    for (const doc of recipes.docs) {
      const { warnings, ...recipe } = doc.data()
      if (warnings === undefined) continue
      if (warnings.length > 0) {
        for (const version of lineages.get(recipe.id) ?? []) {
          await version.ref.set({ ...version.data(), warnings })
        }
      }
      await doc.ref.set(recipe)
      transformed++
    }
    return { ok: true, transformed }
  },
}
