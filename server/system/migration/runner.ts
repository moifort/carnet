import { sortBy } from 'lodash-es'
import { db } from '~/system/firebase'
import { MigrationVersion } from '~/system/migration/primitives'
import type { Migration, MigrationMeta } from '~/system/migration/types'

const META_COLLECTION = 'migration-meta'
const META_DOC_ID = 'state'

export const runMigrations = async (migrations: Migration[]) => {
  const firestore = db()
  const metaRef = firestore.collection(META_COLLECTION).doc(META_DOC_ID)

  const snap = await metaRef.get()
  const current = (snap.data() as MigrationMeta | undefined) ?? {
    version: MigrationVersion(0),
    appliedAt: new Date(0),
  }
  const fromVersion = current.version

  const pending = sortBy(
    migrations.filter(({ version }) => version > fromVersion),
    ({ version }) => version,
  )
  if (pending.length === 0) return { outcome: 'up-to-date' as const }

  for (const migration of pending) {
    try {
      const result = await migration.migrate({ db: firestore })
      if (!result.ok)
        return { outcome: 'failed' as const, version: migration.version, error: result.error }
      await metaRef.set({ version: migration.version, appliedAt: new Date() })
      // The runner's only output: visible in Cloud Logging (CI, for its part,
      // reads the HTTP response of POST /admin/migrate).
      console.info(
        `Applied v${migration.version} "${migration.name}" (${result.transformed} transformed)`,
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { outcome: 'failed' as const, version: migration.version, error: message }
    }
  }
  const lastVersion = pending[pending.length - 1].version
  return {
    outcome: 'migrated' as const,
    from: fromVersion,
    to: lastVersion,
    applied: pending.length,
  }
}
