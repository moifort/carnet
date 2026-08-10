// Ask the connected oven what it declares it can do. A dev tool, run by hand when
// the appliance refuses something and no documentation says why: the capabilities
// are the only authoritative list of the values a command may carry.
//
// READ-ONLY — it never sends a command, it only reads. Usage:
//   bun scripts/oven-capabilities.ts
//
// It refreshes the access token exactly the way the server does (spend the stored
// token, persist the rotated one), because Electrolux rotates on every use and a
// token spent without its successor being stored would break the chain.
import { getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const BASE = 'https://api.developer.electrolux.one/api/v1'
const CAVITY = 'upperOven'
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

const stored = (await tokenDoc.get()).data()?.refreshToken as string | undefined
const pair = (stored ? await spend(stored) : undefined) ?? (await spend(seed))
if (!pair) throw new Error('every refresh token was refused: the chain needs a new pair')
await tokenDoc.set({ refreshToken: pair.refreshToken }, { merge: true })

const get = async (path: string) => {
  const response = await fetch(`${BASE}${path}`, {
    headers: { 'x-api-key': apiKey, Authorization: `Bearer ${pair.accessToken}` },
  })
  if (!response.ok) throw new Error(`GET ${path} answered ${response.status}`)
  return await response.json()
}

const appliances = (await get('/appliances')) as { applianceId: string; applianceType: string }[]
const oven = appliances.find((a) => ['OV', 'SO', 'DAM_OV', 'DAM_SO'].includes(a.applianceType))
if (!oven) throw new Error('no oven in this account')

const info = (await get(`/appliances/${oven.applianceId}/info`)) as {
  capabilities?: Record<string, Record<string, unknown>>
}
const cavity = info.capabilities?.[CAVITY] ?? {}

process.stdout.write(`--- writable properties of ${CAVITY} ---\n`)
for (const [name, capability] of Object.entries(cavity)) {
  const access = (capability as { access?: string }).access
  if (access?.includes('write')) process.stdout.write(`${name} (${access})\n`)
}

process.stdout.write('\n--- the program capability, verbatim ---\n')
process.stdout.write(`${JSON.stringify(cavity.program, null, 2)}\n`)

process.stdout.write('\n--- every capability key, writable or not ---\n')
process.stdout.write(`${Object.keys(cavity).join(', ')}\n`)

const state = (await get(`/appliances/${oven.applianceId}/state`)) as {
  properties?: { reported?: Record<string, unknown> }
}
const reported = state.properties?.reported ?? {}
process.stdout.write('\n--- what the oven is doing right now ---\n')
process.stdout.write(`remoteControl: ${String(reported.remoteControl)}\n`)
process.stdout.write(`${JSON.stringify(reported[CAVITY], null, 2)}\n`)

process.stdout.write('\n--- the favorite capability, verbatim ---\n')
process.stdout.write(`${JSON.stringify(cavity.favorite, null, 2)}\n`)
