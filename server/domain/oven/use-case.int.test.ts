import { beforeEach, describe, expect, mock, test } from 'bun:test'
import type { RecipeId, VersionNumber } from '~/domain/recipe/types'
import type { UserId } from '~/domain/shared/types'
import { fakeFirebase, resetFakeFirestore } from '~/test/fake-firestore'

mock.module('~/system/firebase', fakeFirebase)

const OWNER = 'owner' as UserId
const SOMEONE_ELSE = 'someone-else' as UserId

// Every field of the real `config()`, not just the oven's: `mock.module` replaces a
// module wholesale for the whole test process.
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

// The appliance is a script the test writes: the domain must never care how the
// Electrolux API spells anything.
const appliance = {
  found: true,
  state: { reachable: true, remoteControlEnabled: true, busy: false } as Record<string, unknown>,
  outcome: 'started' as string,
  commanded: [] as unknown[],
}

mock.module('~/system/electrolux', () => ({
  findOven: async () => (appliance.found ? { id: 'oven-1' } : 'no-oven'),
  applianceState: async () => appliance.state,
  startCooking: async (_id: string, profile: unknown) => {
    appliance.commanded.push(profile)
    return appliance.outcome
  },
}))

const { OvenUseCase } = await import('~/domain/oven/use-case')

const QUICHE = '11111111-1111-4111-8111-111111111111' as RecipeId
const SALAD = '22222222-2222-4222-8222-222222222222' as RecipeId
const V1 = 1 as VersionNumber

let fake: ReturnType<typeof resetFakeFirestore>

const seedRecipe = (id: RecipeId, content: Record<string, unknown>) => {
  fake.seed('recipes', id, {
    id,
    userId: OWNER,
    type: 'dish',
    category: 'main',
    title: 'Quiche fine',
    warnings: [],
    lastVersionNumber: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  })
  fake.seed('recipe-versions', `${id}_1`, {
    recipeId: id,
    number: 1,
    content,
    tips: [],
    origin: { kind: 'import' },
    createdAt: new Date(),
  })
}

beforeEach(() => {
  fake = resetFakeFirestore()
  appliance.found = true
  appliance.state = { reachable: true, remoteControlEnabled: true, busy: false }
  appliance.outcome = 'started'
  appliance.commanded = []

  seedRecipe(QUICHE, {
    kind: 'dish',
    ingredients: [],
    steps: ['Enfourner'],
    oven: { program: 'convection', temperature: 180, duration: 30 },
  })
  seedRecipe(SALAD, { kind: 'dish', ingredients: [], steps: ['Mélanger'] })
})

describe('OvenUseCase.start', () => {
  test('refuses a cook for an account that is not the oven’s owner', async () => {
    expect(await OvenUseCase.start(SOMEONE_ELSE, QUICHE, V1)).toBe('oven-unavailable')
  })

  test('refuses a version that carries no oven profile', async () => {
    expect(await OvenUseCase.start(OWNER, SALAD, V1)).toBe('no-oven-profile')
  })

  test('sends the version’s own profile, never one the caller made up', async () => {
    await OvenUseCase.start(OWNER, QUICHE, V1)

    expect(appliance.commanded).toEqual([{ program: 'convection', temperature: 180, duration: 30 }])
  })

  test('relays the appliance’s refusal when remote operation is off', async () => {
    appliance.outcome = 'remote-control-disabled'

    expect(await OvenUseCase.start(OWNER, QUICHE, V1)).toBe('remote-control-disabled')
  })

  test('relays a busy oven rather than queueing a second cook', async () => {
    appliance.outcome = 'oven-busy'

    expect(await OvenUseCase.start(OWNER, QUICHE, V1)).toBe('oven-busy')
  })

  test('a heating function this oven does not have is refused by name', async () => {
    appliance.outcome = 'program-unsupported'

    expect(await OvenUseCase.start(OWNER, QUICHE, V1)).toBe('program-unsupported')
  })

  test('an unplugged oven is offline, not a crash', async () => {
    appliance.found = false

    expect(await OvenUseCase.start(OWNER, QUICHE, V1)).toBe('oven-offline')
  })

  test('answers the fresh state once the cooking has started', async () => {
    appliance.state = {
      reachable: true,
      remoteControlEnabled: true,
      busy: true,
      program: 'convection',
      temperature: 180,
      remaining: 30,
    }

    const result = await OvenUseCase.start(OWNER, QUICHE, V1)

    expect(result).toMatchObject({
      reachable: true,
      running: { program: 'convection', temperature: 180, remaining: 30 },
    })
  })
})

describe('OvenUseCase.state', () => {
  test('is unavailable for an account that owns no oven', async () => {
    expect(await OvenUseCase.state(SOMEONE_ELSE)).toBe('oven-unavailable')
  })

  test('reports a reachable oven willing to be driven', async () => {
    const state = await OvenUseCase.state(OWNER)

    expect(state).toMatchObject({ reachable: true, remoteControlEnabled: true })
  })

  test('an idle oven reports no cooking under way', async () => {
    const state = await OvenUseCase.state(OWNER)

    expect(state === 'oven-unavailable' ? {} : state).not.toHaveProperty('running')
  })
})
