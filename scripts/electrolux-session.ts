// One authenticated conversation with the Electrolux API, for the dev tools that
// interrogate the oven by hand. Shared by them so a diagnostic costs ONE token
// refresh: Electrolux rotates the refresh token on every use, and the server is
// spending the same chain in production — every extra refresh is one more chance
// to make a real cook fail.
//
// Not used by the server, which has its own (`server/system/electrolux/`): this
// one runs outside Nitro, where `useRuntimeConfig()` does not exist.
import { getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const BASE = 'https://api.developer.electrolux.one/api/v1'
export const CAVITY = 'upperOven'
const OVEN_TYPES = ['OV', 'SO', 'DAM_OV', 'DAM_SO']

export const openSession = async () => {
  const apiKey = process.env.NITRO_ELECTROLUX_API_KEY
  const seed = process.env.NITRO_ELECTROLUX_REFRESH_TOKEN
  if (!apiKey || !seed) throw new Error('the oven credentials are missing from .env')

  if (getApps().length === 0) initializeApp({ projectId: 'shuhari-polyforms' })
  const tokenDoc = getFirestore().collection('system').doc('electrolux')

  const spend = async (refreshToken: string) => {
    const response = await fetch(`${BASE}/token/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({ refreshToken }),
    })
    if (!response.ok) return undefined
    return (await response.json()) as { accessToken: string; refreshToken: string }
  }

  // The stored token first, the seed second — the server's own order. A stored
  // token spent by the server between our read and our POST is the ordinary race,
  // and it is why this is retried once rather than given up on.
  const stored = (await tokenDoc.get()).data()?.refreshToken as string | undefined
  const pair =
    (stored ? await spend(stored) : undefined) ??
    (await spend(seed)) ??
    (await (async () => {
      const retry = (await tokenDoc.get()).data()?.refreshToken as string | undefined
      return retry && retry !== stored ? await spend(retry) : undefined
    })())
  if (!pair) throw new Error('every refresh token was refused: the chain needs a new pair')
  await tokenDoc.set({ refreshToken: pair.refreshToken }, { merge: true })

  const headers = { 'x-api-key': apiKey, Authorization: `Bearer ${pair.accessToken}` }

  const get = async (path: string) => {
    const response = await fetch(`${BASE}${path}`, { headers })
    if (!response.ok) throw new Error(`GET ${path} answered ${response.status}`)
    return await response.json()
  }

  const appliances = (await get('/appliances')) as {
    applianceId: string
    applianceType: string
  }[]
  const oven = appliances.find((a) => OVEN_TYPES.includes(a.applianceType))
  if (!oven) throw new Error('no oven in this account')

  return {
    ovenId: oven.applianceId,
    get,
    // Answers with the status and the body whatever happens: a refusal is the
    // result being looked for here, not an error to throw away.
    command: async (body: unknown) => {
      const response = await fetch(`${BASE}/appliances/${oven.applianceId}/command`, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      return { status: response.status, body: await response.text().catch(() => '') }
    },
  }
}
