import { beforeEach, describe, expect, mock, test } from 'bun:test'
import { graphql } from 'graphql'
import type { UserId } from '~/domain/shared/types'
import { fakeFirebase, resetFakeFirestore } from '~/test/fake-firestore'

mock.module('~/system/firebase', fakeFirebase)

const OWNER = 'owner' as UserId
const SOMEONE_ELSE = 'someone-else' as UserId

// Every field of the real `config()`: `mock.module` replaces a module wholesale for
// the whole test process, so a partial fake would blank the others everywhere.
mock.module('~/system/config', () => ({
  config: () => ({
    apiToken: undefined,
    adminToken: undefined,
    googleApiKey: 'test-gemini-key',
    premiumUserIds: [],
    appleAppId: undefined,
    appleEnvironment: undefined,
    electrolux: { apiKey: 'key', refreshToken: 'seed', ownerId: OWNER },
  }),
}))

// The appliance is a script the test writes — no HTTP, and no test ever lights a
// real heating element.
const appliance = {
  found: true,
  state: { reachable: true, remoteControlEnabled: true, busy: false } as Record<string, unknown>,
  outcome: 'started' as string,
}

mock.module('~/system/electrolux', () => ({
  findOven: async () => (appliance.found ? { id: 'oven-1' } : 'no-oven'),
  applianceState: async () => appliance.state,
  startCooking: async () => appliance.outcome,
}))

const { schema } = await import('~/domain/shared/graphql/schema')
const { recipeSatelliteLoaders } = await import('~/domain/shared/graphql/loaders')

let fake: ReturnType<typeof resetFakeFirestore>

const execute = (source: string, userId: UserId = OWNER) =>
  graphql({
    schema,
    source,
    contextValue: { userId, event: undefined as never, loaders: recipeSatelliteLoaders(userId) },
  })

const QUICHE = '11111111-1111-4111-8111-111111111111'

const seedQuiche = (oven?: Record<string, unknown>) => {
  fake.seed('recipes', QUICHE, {
    id: QUICHE,
    userId: OWNER,
    type: 'dish',
    category: 'main',
    title: 'Quiche fine',
    warnings: [],
    lastVersionNumber: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  })
  fake.seed('recipe-versions', `${QUICHE}_1`, {
    recipeId: QUICHE,
    number: 1,
    content: { kind: 'dish', ingredients: [], steps: ['Enfourner'], ...(oven ? { oven } : {}) },
    tips: [],
    origin: { kind: 'import' },
    createdAt: new Date(),
  })
}

const startOven = `
  mutation {
    startOven(recipeId: "${QUICHE}", version: 1) {
      reachable
      remoteControlEnabled
      settings { program temperature }
      running { remaining }
    }
  }
`

beforeEach(() => {
  fake = resetFakeFirestore()
  appliance.found = true
  appliance.state = { reachable: true, remoteControlEnabled: true, busy: false }
  appliance.outcome = 'started'
  seedQuiche({ program: 'convection', temperature: 180, duration: 30 })
})

describe('Query.oven', () => {
  test('is null for an account that owns no oven — no feature, no error', async () => {
    const result = await execute('{ oven { reachable } }', SOMEONE_ELSE)

    expect(result.errors).toBeUndefined()
    expect(result.data?.oven).toBeNull()
  })

  test('reports what the appliance is doing for its owner', async () => {
    appliance.state = {
      reachable: true,
      remoteControlEnabled: true,
      busy: true,
      program: 'convection',
      temperature: 180,
      remaining: 12,
    }

    const result = await execute(
      '{ oven { reachable settings { program temperature } running { remaining } } }',
    )

    expect(result.errors).toBeUndefined()
    expect(result.data?.oven).toMatchObject({
      reachable: true,
      settings: { program: 'CONVECTION', temperature: 180 },
      running: { remaining: 12 },
    })
  })
})

describe('Mutation.startOven', () => {
  test('starts the cooking and answers the oven’s fresh state', async () => {
    appliance.state = {
      reachable: true,
      remoteControlEnabled: true,
      busy: true,
      program: 'convection',
      temperature: 180,
      remaining: 30,
    }

    const result = await execute(startOven)

    expect(result.errors).toBeUndefined()
    expect(result.data?.startOven).toMatchObject({
      settings: { program: 'CONVECTION', temperature: 180 },
      running: { remaining: 30 },
    })
  })

  test('answers REMOTE_CONTROL_DISABLED when the oven is not listening', async () => {
    appliance.outcome = 'remote-control-disabled'

    const result = await execute(startOven)

    expect(result.errors?.[0]?.extensions?.code).toBe('REMOTE_CONTROL_DISABLED')
  })

  test('answers OVEN_BUSY rather than queueing a second cooking', async () => {
    appliance.outcome = 'oven-busy'

    const result = await execute(startOven)

    expect(result.errors?.[0]?.extensions?.code).toBe('OVEN_BUSY')
  })

  test('answers OVEN_OFFLINE when the appliance does not answer', async () => {
    appliance.found = false

    const result = await execute(startOven)

    expect(result.errors?.[0]?.extensions?.code).toBe('OVEN_OFFLINE')
  })

  test('answers NO_OVEN_PROFILE for a version that never bakes', async () => {
    fake = resetFakeFirestore()
    seedQuiche()

    const result = await execute(startOven)

    expect(result.errors?.[0]?.extensions?.code).toBe('NO_OVEN_PROFILE')
  })

  test('answers PROGRAM_UNSUPPORTED when this oven has no such heating function', async () => {
    appliance.outcome = 'program-unsupported'

    const result = await execute(startOven)

    expect(result.errors?.[0]?.extensions?.code).toBe('PROGRAM_UNSUPPORTED')
  })

  test('answers OVEN_UNAVAILABLE for an account that owns no oven', async () => {
    const result = await execute(startOven, SOMEONE_ELSE)

    expect(result.errors?.[0]?.extensions?.code).toBe('OVEN_UNAVAILABLE')
  })
})
