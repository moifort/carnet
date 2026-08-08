import { MigrationName, MigrationVersion } from '~/system/migration/primitives'
import type { Migration } from '~/system/migration/types'

// A recipe's `updatedAt` stopped meaning "when the document was last written" and
// became "when the recipe was last worked on" — the date of the version it opens on
// (`lastWorkedOn`). The library orders and pages on that field, so until every
// stored recipe carries the new meaning the notebook keeps the old order: a recipe
// hearted last week would still sit above one cooked last month.
//
// The rule is spelled out here rather than imported: a migration states what was
// applied on the day it ran, and must not change meaning when the domain rule
// evolves. Its twin lives in `recipe/business-rules.ts` (`bestRating` /
// `versionToOpen` / `lastWorkedOn`).
export const migration0004: Migration = {
  version: MigrationVersion(4),
  name: MigrationName('recipe-dated-by-its-best-version'),
  migrate: async ({ db }) => {
    const [recipes, versions] = await Promise.all([
      db.collection('recipes').get(),
      db.collection('recipe-versions').get(),
    ])
    const lineages = new Map<string, StoredVersion[]>()
    for (const doc of versions.docs) {
      const version = doc.data() as StoredVersion
      const lineage = lineages.get(version.recipeId) ?? []
      lineage.push(version)
      lineages.set(version.recipeId, lineage)
    }

    let transformed = 0
    for (const doc of recipes.docs) {
      const data = doc.data()
      // Keyed on the stored `id` field — the document key spelled inside the
      // document, which is what a version's `recipeId` points at.
      const lineage = lineages.get(data.id)
      // A recipe without a version does not exist; one seen without its lineage is
      // left untouched rather than dated from nothing.
      if (!lineage?.length) continue
      const updatedAt = reference(lineage).updatedAt
      if (millisOf(updatedAt) === millisOf(data.updatedAt)) continue
      await doc.ref.set({ ...data, updatedAt })
      transformed++
    }
    return { ok: true, transformed }
  },
}

type StoredVersion = { recipeId: string; number: number; rating?: number; updatedAt: unknown }

// The version that answers for the recipe: the best-rated one (a tie going to the
// most recent), or the latest when nothing was ever cooked.
const reference = (lineage: StoredVersion[]): StoredVersion => {
  const rated = lineage.filter((version) => typeof version.rating === 'number')
  return rated.length > 0
    ? rated.reduce((best, version) =>
        (version.rating ?? 0) > (best.rating ?? 0) ||
        ((version.rating ?? 0) === (best.rating ?? 0) && version.number > best.number)
          ? version
          : best,
      )
    : lineage.reduce((latest, version) => (version.number > latest.number ? version : latest))
}

// Firestore hands a date back as a `Timestamp`, the fake as a plain `Date` — compare
// on milliseconds so the migration reads the same on both.
const millisOf = (value: unknown): number | undefined => {
  if (value instanceof Date) return value.getTime()
  const timestamp = value as { toMillis?: () => number } | undefined
  return typeof timestamp?.toMillis === 'function' ? timestamp.toMillis() : undefined
}
