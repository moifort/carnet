import { MigrationName, MigrationVersion } from '~/system/migration/primitives'
import type { Migration } from '~/system/migration/types'

// The coffee "profile" was read as the roast on the bag and stored on the beans. It
// is the profile the machine runs — "Sera Modern Arc", "Dark roast" — the saved
// preset that holds the pre-infusion, the pressure and the temperature, so it moves
// onto the gear, beside the machine it belongs to.
//
// Nothing is carried over: the values already typed described a torrefaction, not a
// preset, and promoting them would file a wrong answer under a right question. The
// stored `beans.roast` goes, and the vocabulary's `roasts` goes with it — a
// suggestion list is only worth the values it proposes — leaving `profiles` empty
// for the first profile the cook actually names.
// Already run: the roasts are gone and the profiles are there to be filled.
const roastsAreGone = (vocabulary: { roasts?: unknown; profiles?: unknown }) =>
  vocabulary.roasts === undefined && vocabulary.profiles !== undefined

export const migration0009: Migration = {
  version: MigrationVersion(9),
  name: MigrationName('profile-onto-the-gear'),
  migrate: async ({ db }) => {
    let transformed = 0

    const versions = await db.collection('recipe-versions').get()
    for (const doc of versions.docs) {
      const stored = doc.data()
      if (stored.content?.kind !== 'coffee' || stored.content.beans?.roast === undefined) continue
      const { roast: _dropped, ...beans } = stored.content.beans
      await doc.ref.set({ ...stored, content: { ...stored.content, beans } })
      transformed++
    }

    const vocabularies = await db.collection('coffee-vocabularies').get()
    for (const doc of vocabularies.docs) {
      const { roasts: _forgotten, ...vocabulary } = doc.data()
      if (roastsAreGone(doc.data())) continue
      await doc.ref.set({ ...vocabulary, profiles: [] })
      transformed++
    }

    return { ok: true, transformed }
  },
}
