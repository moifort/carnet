import { MigrationName, MigrationVersion } from '~/system/migration/primitives'
import type { Migration } from '~/system/migration/types'

// The coffee form now suggests roast profiles the way it suggests machines, so the
// vocabulary carries one list more. Every list is total — the GraphQL field is
// non-nullable and `learnedVocabulary` reads the current one before adding to it —
// so a document stored before this field existed gets an empty list rather than a
// hole. Nothing is derived from the stored coffees: a roast profile nobody wrote
// down is not one to guess, and typing it once is what teaches it.
export const migration0005: Migration = {
  version: MigrationVersion(5),
  name: MigrationName('coffee-roast-vocabulary'),
  migrate: async ({ db }) => {
    const snapshot = await db.collection('coffee-vocabularies').get()
    let transformed = 0
    for (const doc of snapshot.docs) {
      const data = doc.data()
      if (data.roasts !== undefined) continue
      await doc.ref.set({ ...data, roasts: [] })
      transformed++
    }
    return { ok: true, transformed }
  },
}
