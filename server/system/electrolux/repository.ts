import { db } from '~/system/firebase'

// The one document the oven integration persists. A standalone system doc, like the
// AI's analysis cache: it belongs to no domain and outlives no aggregate.
const SYSTEM_COLLECTION = 'system'
const TOKEN_DOC = 'electrolux'

const tokenRef = () => db().collection(SYSTEM_COLLECTION).doc(TOKEN_DOC)

export const storedRefreshToken = async (): Promise<string | undefined> => {
  const snapshot = await tokenRef().get()
  const stored = snapshot.data()?.refreshToken
  return typeof stored === 'string' && stored.length > 0 ? stored : undefined
}

export const rememberRefreshToken = async (refreshToken: string): Promise<void> => {
  await tokenRef().set({ refreshToken }, { merge: true })
}
