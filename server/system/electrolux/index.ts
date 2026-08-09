import type { OvenProfile } from '~/domain/recipe/content/oven'
import { config } from '~/system/config'
import { electroluxProgram, ovenProgram } from '~/system/electrolux/program'
import { accessToken, forgetAccessToken } from '~/system/electrolux/token'
import type {
  ApplianceRefusal,
  ApplianceState,
  AssistedEntry,
  OvenAppliance,
} from '~/system/electrolux/types'

const BASE = 'https://api.developer.electrolux.one/api/v1'
const OVEN_CATEGORY = 'OV'

const UNREACHABLE: ApplianceState = { reachable: false, remoteControlEnabled: false, busy: false }

// Every call carries the same three headers; they live here once. A 401 costs one
// retry on a fresh token rather than a dead instance.
const call = async (
  path: string,
  init?: RequestInit,
  retried = false,
): Promise<Response | 'unavailable'> => {
  const settings = config().electrolux
  if (!settings) return 'unavailable'
  const token = await accessToken()
  if (token === 'not-configured') return 'unavailable'

  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': settings.apiKey,
      Authorization: `Bearer ${token}`,
      ...init?.headers,
    },
  })
  if (response.status === 401 && !retried) {
    forgetAccessToken()
    return call(path, init, true)
  }
  return response
}

export const findOven = async (): Promise<OvenAppliance | 'no-oven'> => {
  const response = await call('/appliances')
  if (response === 'unavailable' || !response.ok) return 'no-oven'

  const appliances = (await response.json()) as { applianceId: string; applianceType: string }[]
  const oven = appliances.find((a) => a.applianceType === OVEN_CATEGORY)
  return oven ? { id: oven.applianceId } : 'no-oven'
}

export const applianceState = async (applianceId: string): Promise<ApplianceState> => {
  const response = await call(`/appliances/${applianceId}/state`)
  if (response === 'unavailable' || !response.ok) return UNREACHABLE

  const body = (await response.json()) as { properties?: { reported?: Record<string, unknown> } }
  const reported = body.properties?.reported ?? {}
  const program = reported.program
  return {
    reachable: true,
    // The appliance answers ENABLED, NOT_SAFETY_RELEVANT_ENABLED or DISABLED. Only
    // the first lets a cooking start: lighting a heating element IS safety relevant.
    remoteControlEnabled: reported.remoteControl === 'ENABLED',
    busy: reported.applianceState === 'RUNNING',
    ...(typeof program === 'string' && ovenProgram(program)
      ? { program: ovenProgram(program) }
      : {}),
    ...(typeof reported.targetTemperature === 'number'
      ? { temperature: reported.targetTemperature }
      : {}),
    // The appliance counts seconds, the notebook counts minutes.
    ...(typeof reported.timeToEnd === 'number'
      ? { remaining: Math.round(reported.timeToEnd / 60) }
      : {}),
  }
}

// The domain profile becomes an appliance command here and nowhere else.
const commandFor = (profile: OvenProfile) => ({
  program: electroluxProgram(profile.program),
  targetTemperature: profile.temperature,
  ...(profile.duration ? { targetDuration: profile.duration * 60 } : {}),
  ...(profile.core ? { targetCoreTemperature: profile.core } : {}),
  executeCommand: 'START',
})

export const startCooking = async (
  applianceId: string,
  profile: OvenProfile,
): Promise<'started' | ApplianceRefusal> => {
  // Asked before commanding, so the cook is told WHY rather than shown a bare
  // failure — "the oven is not listening" is the answer they can act on.
  const state = await applianceState(applianceId)
  if (!state.reachable) return 'oven-offline'
  if (!state.remoteControlEnabled) return 'remote-control-disabled'
  if (state.busy) return 'oven-busy'

  const response = await call(`/appliances/${applianceId}/command`, {
    method: 'PUT',
    body: JSON.stringify(commandFor(profile)),
  })
  if (response === 'unavailable') return 'oven-offline'
  // The oven can be switched off between the two calls above; these cover it.
  if (response.status === 403) return 'remote-control-disabled'
  if (response.status === 409) return 'oven-busy'
  if (!response.ok) return 'oven-offline'
  return 'started'
}

// The oven's own dish catalogue, read live and offered as a prefill. An oven that
// exposes none simply offers none — the picker disappears, the feature does not.
export const assistedCatalogue = async (applianceId: string): Promise<AssistedEntry[]> => {
  const response = await call(`/appliances/${applianceId}/capabilities`)
  if (response === 'unavailable' || !response.ok) return []

  const capabilities = (await response.json()) as Record<string, unknown>
  return assistedEntries(capabilities)
}

// UNVERIFIED shape: the assisted-cooking catalogue is the one part of the API this
// module has never seen answered by a real oven. Written defensively — anything
// that does not look like a dish is skipped, so a surprise payload costs the
// prefill picker and nothing else.
const assistedEntries = (capabilities: Record<string, unknown>): AssistedEntry[] => {
  const catalogue = capabilities.assistedCooking
  if (!catalogue || typeof catalogue !== 'object') return []

  return Object.entries(catalogue as Record<string, unknown>).flatMap(([label, raw]) => {
    if (!raw || typeof raw !== 'object') return []
    const dish = raw as Record<string, unknown>
    const program = typeof dish.program === 'string' ? ovenProgram(dish.program) : undefined
    if (!program || typeof dish.targetTemperature !== 'number') return []
    return [
      {
        label,
        program,
        temperature: dish.targetTemperature,
        ...(typeof dish.targetDuration === 'number'
          ? { duration: Math.round(dish.targetDuration / 60) }
          : {}),
      },
    ]
  })
}
