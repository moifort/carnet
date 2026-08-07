import { MigrationName, MigrationVersion } from '~/system/migration/primitives'
import type { Migration } from '~/system/migration/types'

// A coffee version stopped being written like a dish: its ingredient list gave way
// to parameters (beans, water, extraction, gear), which the cook fills in by hand.
// Nothing can be derived from the old lines without guessing — "Eau 300 g" says
// nothing about WHICH water, and a guessed value is one the cook would then brew
// against — so the parameters start empty rather than wrong, and the ingredient
// list goes. The brewing steps are kept exactly as they are: they are still the
// recipe for a V60 or a French press.
export const migration0002: Migration = {
  version: MigrationVersion(2),
  name: MigrationName('coffee-parameters'),
  migrate: async ({ db }) => {
    const snapshot = await db.collection('recipe-versions').get()
    let transformed = 0
    for (const doc of snapshot.docs) {
      const data = doc.data()
      if (data.content?.kind !== 'coffee') continue
      // Already migrated: the parameters are in, the ingredient list is out.
      if (data.content.ingredients === undefined) continue
      const { ingredients: _dropped, ...content } = data.content
      await doc.ref.set({
        ...data,
        content: { ...content, beans: {}, water: {}, extraction: {}, gear: {} },
      })
      transformed++
    }
    return { ok: true, transformed }
  },
}
