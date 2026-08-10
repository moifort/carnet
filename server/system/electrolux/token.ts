import { config } from '~/system/config'
import { rememberRefreshToken, storedRefreshToken } from '~/system/electrolux/repository'

const REFRESH_URL = 'https://api.developer.electrolux.one/api/v1/token/refresh'
// Electrolux access tokens last hours; an hour, minus a minute of margin, is short
// enough to be safe and long enough to save a round-trip on every cook. A token
// that expires mid-request is a failed cook.
const CACHE_MS = 60 * 60 * 1000 - 60_000

// Cached on the instance, never persisted: it outlives a cook, not a deploy.
let cached: { value: string; expiresAt: number } | undefined

// Forget the cached access token. The client calls this on a 401, so one expired
// token costs a single retry rather than every call until the instance recycles.
export const forgetAccessToken = () => {
  cached = undefined
}

type Pair = { accessToken: string; refreshToken: string }

// Spend one refresh token. `rejected` is Electrolux saying this one is spent or
// unknown — an outcome, not a fault: it is exactly what a token consumed by another
// instance looks like.
const spend = async (apiKey: string, refreshToken: string): Promise<Pair | 'rejected'> => {
  const response = await fetch(REFRESH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
    body: JSON.stringify({ refreshToken }),
  })
  if (response.status === 400 || response.status === 401) return 'rejected'
  if (!response.ok) throw new Error(`Electrolux refused the token refresh: ${response.status}`)
  return (await response.json()) as Pair
}

export const accessToken = async (): Promise<string | 'not-configured'> => {
  const settings = config().electrolux
  if (!settings) return 'not-configured'
  if (cached && cached.expiresAt > Date.now()) return cached.value

  // Electrolux rotates the refresh token on every use, so the configured secret is
  // only a SEED and the live token is the stored one — hence the stored one first.
  //
  // The seed is tried second, and that second try is what makes a dead chain
  // RECOVERABLE. Rotation is consume-then-persist: a write that fails, or two
  // instances spending the same token, burns it without a successor being stored,
  // and the chain is over. Without this fallback the stored document would keep
  // priority forever and re-provisioning the secret would change nothing — the only
  // cure would be deleting a Firestore document by hand, which is not a cure anyone
  // finds at the moment they need it. With it: rotate the secret, redeploy, and the
  // next call heals itself.
  const candidates = [await storedRefreshToken(), settings.refreshToken].filter(
    (token, index, all): token is string => !!token && all.indexOf(token) === index,
  )

  for (const candidate of candidates) {
    const pair = await spend(settings.apiKey, candidate)
    if (pair === 'rejected') continue
    await rememberRefreshToken(pair.refreshToken)
    cached = { value: pair.accessToken, expiresAt: Date.now() + CACHE_MS }
    return pair.accessToken
  }

  throw new Error('Electrolux rejected every refresh token: the chain needs a new pair')
}
