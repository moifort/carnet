import { MigrationName, MigrationVersion } from '~/system/migration/primitives'
import type { Migration } from '~/system/migration/types'

// A version now says when it was last worked on, not only when the lineage grew it:
// the app reads `updatedAt` to date a version and to file it under a month. Nothing
// stored knows when an older version was last rewritten — a tips edit left no trace —
// so the backfill states the only truth available: as far as we know, it was last
// modified when it was created.
export const migration0003: Migration = {
  version: MigrationVersion(3),
  name: MigrationName('version-updated-at'),
  migrate: async ({ db }) => {
    const snapshot = await db.collection('recipe-versions').get()
    let transformed = 0
    for (const doc of snapshot.docs) {
      const data = doc.data()
      if (data.updatedAt !== undefined) continue
      await doc.ref.set({ ...data, updatedAt: data.createdAt })
      transformed++
    }
    return { ok: true, transformed }
  },
}
