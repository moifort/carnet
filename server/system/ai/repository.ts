import type { DocumentData } from 'firebase-admin/firestore'
import type { CachedImport, ImportHash } from '~/system/ai/types'
import { db } from '~/system/firebase'
import { genericDataConverter, withoutStoredNulls } from '~/utils/firestore'

// The analysis is stored as-is: the stored shape IS the domain shape. One
// collection for both flows — the flow is part of the hash, so two analyses of the
// same source never share a key.
const cache = <T>() =>
  db().collection('import-cache').withConverter(genericDataConverter<CachedImport<T>>())

export const findBy = async <T extends DocumentData>(
  importHash: ImportHash,
): Promise<CachedImport<T> | undefined> => {
  const stored = (await cache<T>().doc(importHash).get()).data()
  if (!stored) return undefined
  // Storage boundary: an optional field left `null` by an older write comes back
  // as an absent key, the way the domain spells absence.
  return { ...stored, result: withoutStoredNulls(stored.result) }
}

export const save = async <T>(entry: CachedImport<T>): Promise<CachedImport<T>> => {
  await cache<T>().doc(entry.importHash).set(entry)
  return entry
}
