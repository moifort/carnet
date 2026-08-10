import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { fakeFirebase, resetFakeFirestore } from '~/test/fake-firestore'

mock.module('~/system/firebase', fakeFirebase)

// The oven is configured through runtime config; this answers what a provisioned
// deployment would. Every field of the real `config()` is present, not just the
// oven's: `mock.module` replaces a module wholesale for the WHOLE test process, so a
// partial fake would silently blank `googleApiKey` for every other file — the same
// trap `fake-firestore.ts` documents.
mock.module('~/system/config', () => ({
  config: () => ({
    apiToken: undefined,
    adminToken: undefined,
    googleApiKey: 'test-gemini-key',
    premiumUserIds: [],
    appleAppId: undefined,
    appleEnvironment: undefined,
    electrolux: { apiKey: 'key', refreshToken: 'seed-refresh', ownerId: 'owner' },
  }),
}))

const { applianceState, findOven, startCooking } = await import('~/system/electrolux')
const { forgetAccessToken } = await import('~/system/electrolux/token')

const realFetch = globalThis.fetch
let fake: ReturnType<typeof resetFakeFirestore>

// One entry per URL fragment, so a test declares only the calls it cares about.
const respondWith = (routes: Record<string, unknown>) => {
  const seen: string[] = []
  globalThis.fetch = mock(async (url: string | URL) => {
    const href = url.toString()
    seen.push(href)
    const match = Object.keys(routes).find((fragment) => href.includes(fragment))
    if (!match) return new Response('not found', { status: 404 })
    const body = routes[match]
    return body instanceof Response ? body.clone() : Response.json(body)
  }) as unknown as typeof fetch
  return seen
}

beforeEach(() => {
  fake = resetFakeFirestore()
  forgetAccessToken()
})

afterEach(() => {
  globalThis.fetch = realFetch
})

const refreshed = { accessToken: 'access-2', refreshToken: 'refresh-2' }

describe('the rotating refresh token', () => {
  test('writes the rotated token back, so the next call still authenticates', async () => {
    respondWith({ '/token/refresh': refreshed, '/appliances': [] })

    await findOven()

    expect(fake.snapshot('system').get('electrolux')?.refreshToken).toBe('refresh-2')
  })

  test('refreshes from the stored token, not from the seed, once one is stored', async () => {
    fake.seed('system', 'electrolux', { refreshToken: 'refresh-stored' })
    const bodies: string[] = []
    globalThis.fetch = mock(async (url: string | URL, init?: RequestInit) => {
      if (url.toString().includes('/token/refresh')) {
        bodies.push(String(init?.body))
        return Response.json(refreshed)
      }
      return Response.json([])
    }) as unknown as typeof fetch

    await findOven()

    expect(bodies[0]).toContain('refresh-stored')
    expect(bodies[0]).not.toContain('seed-refresh')
  })
})

describe('findOven', () => {
  test('picks the oven out of the account’s appliances', async () => {
    respondWith({
      '/token/refresh': refreshed,
      // SO is what the real appliance answers — a steam oven. Filtering on the
      // documentation's OV alone finds nothing in a kitchen that has one.
      '/appliances': [
        { applianceId: 'washer-1', applianceType: 'WM' },
        { applianceId: 'oven-1', applianceType: 'SO' },
      ],
    })

    expect(await findOven()).toEqual({ id: 'oven-1' })
  })

  test('an account with no oven is not an error', async () => {
    respondWith({
      '/token/refresh': refreshed,
      '/appliances': [{ applianceId: 'washer-1', applianceType: 'WM' }],
    })

    expect(await findOven()).toBe('no-oven')
  })
})

describe('applianceState', () => {
  test('reads the oven’s own words into the notebook’s', async () => {
    respondWith({
      '/token/refresh': refreshed,
      // The real shape: remoteControl at the top, everything about the cooking
      // nested under the cavity.
      '/state': {
        properties: {
          reported: {
            remoteControl: 'ENABLED',
            applianceState: 'OFF',
            upperOven: {
              applianceState: 'RUNNING',
              program: 'TRUE_FAN',
              targetTemperatureC: 180,
              timeToEnd: 900,
            },
          },
        },
      },
    })

    expect(await applianceState('oven-1')).toEqual({
      reachable: true,
      remoteControlEnabled: true,
      busy: true,
      program: 'convection',
      temperature: 180,
      // 900 seconds the appliance counts, 15 minutes the cook reads.
      remaining: 15,
    })
  })

  test('an oven that answers nothing is unreachable, not a crash', async () => {
    respondWith({ '/token/refresh': refreshed })

    expect(await applianceState('oven-1')).toEqual({
      reachable: false,
      remoteControlEnabled: false,
      busy: false,
    })
  })
})

describe('startCooking', () => {
  const quiche = { program: 'convection', temperature: 180, duration: 30 } as never

  test('a heating function this oven does not have is refused by name', async () => {
    respondWith({ '/token/refresh': refreshed })

    expect(await startCooking('oven-1', { program: 'pizza', temperature: 250 } as never)).toBe(
      'program-unsupported',
    )
  })

  test('refuses before commanding when remote operation is off', async () => {
    respondWith({
      '/token/refresh': refreshed,
      '/state': { properties: { reported: { remoteControl: 'DISABLED', upperOven: {} } } },
    })

    expect(await startCooking('oven-1', quiche)).toBe('remote-control-disabled')
  })

  test('refuses a cook on an oven already running', async () => {
    respondWith({
      '/token/refresh': refreshed,
      '/state': {
        properties: {
          reported: {
            remoteControl: 'ENABLED',
            upperOven: { applianceState: 'RUNNING' },
          },
        },
      },
    })

    expect(await startCooking('oven-1', quiche)).toBe('oven-busy')
  })

  test('sends the profile as an appliance command, minutes turned into seconds', async () => {
    const sent: string[] = []
    globalThis.fetch = mock(async (url: string | URL, init?: RequestInit) => {
      const href = url.toString()
      if (href.includes('/token/refresh')) return Response.json(refreshed)
      if (href.includes('/state')) {
        return Response.json({
          properties: { reported: { remoteControl: 'ENABLED', upperOven: {} } },
        })
      }
      sent.push(String(init?.body))
      return Response.json({ status: 'ok' })
    }) as unknown as typeof fetch

    expect(await startCooking('oven-1', quiche)).toBe('started')
    // Nested under the cavity: a flat command is silently not a command at all.
    expect(JSON.parse(sent[0])).toEqual({
      upperOven: {
        program: 'TRUE_FAN',
        targetTemperatureC: 180,
        targetDuration: 1800,
        executeCommand: 'START',
      },
    })
  })

  test('a probe cook carries its core target and no duration', async () => {
    const sent: string[] = []
    globalThis.fetch = mock(async (url: string | URL, init?: RequestInit) => {
      const href = url.toString()
      if (href.includes('/token/refresh')) return Response.json(refreshed)
      if (href.includes('/state')) {
        return Response.json({
          properties: { reported: { remoteControl: 'ENABLED', upperOven: {} } },
        })
      }
      sent.push(String(init?.body))
      return Response.json({ status: 'ok' })
    }) as unknown as typeof fetch

    await startCooking('oven-1', { program: 'convection', temperature: 160, core: 63 } as never)

    const command = JSON.parse(sent[0]).upperOven
    expect(command.targetFoodProbeTemperatureC).toBe(63)
    expect('targetDuration' in command).toBe(false)
  })
})
