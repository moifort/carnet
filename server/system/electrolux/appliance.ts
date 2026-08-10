import * as Sentry from '@sentry/node'
import type { OvenProfile } from '~/domain/recipe/content/oven'
import { config } from '~/system/config'
import { electroluxProgram, ovenProgram } from '~/system/electrolux/program'
import { accessToken, forgetAccessToken } from '~/system/electrolux/token'
import type { ApplianceRefusal, ApplianceState, OvenAppliance } from '~/system/electrolux/types'

const BASE = 'https://api.developer.electrolux.one/api/v1'

// What the platform calls an oven. `SO` (steam oven) is what the real appliance
// answered, NOT the `OV` the documentation's examples suggest — filtering on `OV`
// alone finds no oven in a kitchen that has one. `DAM_` is the prefix the newer
// data model puts in front of every type.
const OVEN_TYPES = new Set(['OV', 'SO', 'DAM_OV', 'DAM_SO'])

// The cavity every cooking property hangs off. The state is NOT flat: temperature,
// programme and timers all live under this key, while `remoteControl` sits at the
// top with the rest of the appliance-wide settings.
const CAVITY = 'upperOven'

// The appliance spells "unset" as INT32_MIN in its time fields.
const UNSET = -2147483648

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

  // Getting a token reads Firestore and calls Electrolux; either can fail. Both
  // failures mean the same thing to a cook — the oven cannot be reached — and
  // NEITHER may reach the recipe sheet as an error: an oven that is down must
  // never be an app that is down.
  const token = await accessToken().catch(() => 'not-configured' as const)
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
  const oven = appliances.find((a) => OVEN_TYPES.has(a.applianceType))
  return oven ? { id: oven.applianceId } : 'no-oven'
}

const minutesFrom = (seconds: unknown): number | undefined =>
  typeof seconds === 'number' && seconds !== UNSET && seconds > 0
    ? Math.round(seconds / 60)
    : undefined

export const applianceState = async (applianceId: string): Promise<ApplianceState> => {
  const response = await call(`/appliances/${applianceId}/state`)
  if (response === 'unavailable' || !response.ok) return UNREACHABLE

  const body = (await response.json()) as { properties?: { reported?: Record<string, unknown> } }
  const reported = body.properties?.reported ?? {}
  const cavity = (reported[CAVITY] ?? {}) as Record<string, unknown>
  const selected = typeof cavity.program === 'string' ? ovenProgram(cavity.program) : undefined

  const busy = cavity.applianceState === 'RUNNING' || cavity.applianceState === 'DELAYED_START'

  return {
    reachable: true,
    // The appliance answers ENABLED, NOT_SAFETY_RELEVANT_ENABLED, TEMPORARY_LOCKED
    // or DISABLED. Only the first lets a cooking start: lighting a heating element
    // IS safety relevant, and the other three all mean "not from here".
    remoteControlEnabled: reported.remoteControl === 'ENABLED',
    busy,
    ...(selected ? { program: selected.program } : {}),
    ...(selected?.assisted ? { assisted: selected.assisted } : {}),
    ...(typeof cavity.targetTemperatureC === 'number'
      ? { temperature: cavity.targetTemperatureC }
      : {}),
    // `targetDuration` is the timer as SET, whoever set it — the appliance fills it
    // for a cooking dialled in on its own panel too. Never `timeToEnd`, which is
    // what is LEFT of it: copying a countdown would write a shrinking number into
    // the recipe, and on an idle oven it carries a leftover from the cooking before.
    ...(minutesFrom(cavity.targetDuration) !== undefined
      ? { duration: minutesFrom(cavity.targetDuration) }
      : {}),
    // Reported only once a probe is actually plugged in.
    ...(typeof cavity.targetFoodProbeTemperatureC === 'number'
      ? { core: cavity.targetFoodProbeTemperatureC }
      : {}),
    ...(minutesFrom(cavity.timeToEnd) !== undefined
      ? { remaining: minutesFrom(cavity.timeToEnd) }
      : {}),
  }
}

// The domain profile becomes an appliance command here and nowhere else. Nested
// under the cavity, because that is how the appliance is composed — a flat command
// is silently not a command at all.
const commandFor = (profile: OvenProfile, program: string) => ({
  [CAVITY]: {
    program,
    targetTemperatureC: profile.temperature,
    // The appliance counts seconds, in steps of 60; the notebook counts minutes.
    ...(profile.duration ? { targetDuration: profile.duration * 60 } : {}),
    ...(profile.core ? { targetFoodProbeTemperatureC: profile.core } : {}),
    executeCommand: 'START',
  },
})

export const startCooking = async (
  applianceId: string,
  profile: OvenProfile,
): Promise<'started' | ApplianceRefusal> => {
  // Refused here rather than by the appliance, so the cook is told their oven has
  // no such function instead of reading a validation error about a code they never
  // typed.
  const program = electroluxProgram(profile)
  if (!program) return 'program-unsupported'

  // Asked before commanding, so the cook is told WHY rather than shown a bare
  // failure — "the oven is not listening" is the answer they can act on.
  const state = await applianceState(applianceId)
  if (!state.reachable) return 'oven-offline'
  if (!state.remoteControlEnabled) return 'remote-control-disabled'
  if (state.busy) return 'oven-busy'

  const response = await call(`/appliances/${applianceId}/command`, {
    method: 'PUT',
    body: JSON.stringify(commandFor(profile, program)),
  })
  if (response === 'unavailable') return 'oven-offline'
  if (response.ok) return 'started'

  // The appliance says WHY it refuses, in the body, and this integration used to
  // drop it — which is how a 406 reaches the cook as "remote control is off"
  // without anyone ever having read one. Reported verbatim, with the programme that
  // drew it: the token rides in the headers, the body carries the complaint alone.
  // A refusal is not a fault the hook would catch, so it is captured by hand.
  const complaint = await response.text().catch(() => '')
  Sentry.captureMessage(
    `Electrolux refused the command (${program}): ${response.status} ${complaint}`,
    'warning',
  )
  // The documented validation failure: disconnected, or remote control off. The
  // oven can be switched off between the two calls above, so this is reachable.
  if (response.status === 406) return 'remote-control-disabled'
  return 'oven-offline'
}
