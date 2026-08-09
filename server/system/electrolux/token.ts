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

export const accessToken = async (): Promise<string | 'not-configured'> => {
  const settings = config().electrolux
  if (!settings) return 'not-configured'
  if (cached && cached.expiresAt > Date.now()) return cached.value

  // Electrolux rotates the refresh token on every use, so the configured secret is
  // only a SEED: the current token is the stored one. Without the write-back below,
  // the integration authenticates once and then dies silently a few hours later.
  const refreshToken = (await storedRefreshToken()) ?? settings.refreshToken
  const response = await fetch(REFRESH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': settings.apiKey },
    body: JSON.stringify({ refreshToken }),
  })
  if (!response.ok) throw new Error(`Electrolux refused the token refresh: ${response.status}`)

  const body = (await response.json()) as { accessToken: string; refreshToken: string }
  await rememberRefreshToken(body.refreshToken)
  cached = { value: body.accessToken, expiresAt: Date.now() + CACHE_MS }
  return body.accessToken
}
