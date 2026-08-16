import { MigrationName, MigrationVersion } from '~/system/migration/primitives'
import type { Migration } from '~/system/migration/types'

// The heart moves from the recipe onto a version: it marks the attempt the cook
// would make again, and the recipe's own flag becomes the derived mirror the
// library's favourites lens filters on (`favorited`). The mirror already reads
// `true` on these documents, so nothing is rewritten there — only the versions gain
// what nothing used to carry.
//
// It lands on the ONE version that answers for the recipe, unlike the cautions
// (`migration0006`), which were a truth about every attempt: hearting all of them
// would claim the cook picked each one. The rule is spelled out here rather than
// imported — a migration states what was applied on the day it ran, and must not
// change meaning when the domain rule evolves. Its twin is `versionToOpen`.
export const migration0007: Migration = {
  version: MigrationVersion(7),
  name: MigrationName('favorite-onto-the-version'),
  migrate: async ({ db }) => {
    const [recipes, versions] = await Promise.all([
      db.collection('recipes').where('favorite', '==', true).get(),
      db.collection('recipe-versions').get(),
    ])
    const lineages = new Map<string, StoredVersion[]>()
    for (const doc of versions.docs) {
      const version = doc.data() as StoredVersion
      lineages.set(version.recipeId, [...(lineages.get(version.recipeId) ?? []), version])
    }

    let transformed = 0
    for (const doc of recipes.docs) {
      const lineage = lineages.get(doc.data().id)
      // A recipe without a lineage does not exist; one seen without it keeps its
      // mirror rather than hearting nothing.
      if (!lineage?.length) continue
      const hearted = reference(lineage)
      if (hearted.favorite === true) continue
      await db
        .collection('recipe-versions')
        .doc(`${hearted.recipeId}_${hearted.number}`)
        .set({ ...hearted, favorite: true })
      transformed++
    }
    return { ok: true, transformed }
  },
}

type StoredVersion = { recipeId: string; number: number; rating?: number; favorite?: true }

// The version that answers for the recipe: the best-rated one (a tie going to the
// most recent), or the latest when nothing was ever cooked.
const reference = (lineage: StoredVersion[]): StoredVersion => {
  const rated = lineage.filter(({ rating }) => typeof rating === 'number')
  return rated.length > 0
    ? rated.reduce((best, version) =>
        (version.rating ?? 0) > (best.rating ?? 0) ||
        ((version.rating ?? 0) === (best.rating ?? 0) && version.number > best.number)
          ? version
          : best,
      )
    : lineage.reduce((latest, version) => (version.number > latest.number ? version : latest))
}
