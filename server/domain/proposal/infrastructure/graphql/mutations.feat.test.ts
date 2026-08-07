import { beforeEach, describe, expect, mock, test } from 'bun:test'
import { graphql } from 'graphql'
import type { RecipeId, VersionNumber } from '~/domain/recipe/types'
import type { UserId } from '~/domain/shared/types'
import type { Proposal as AiProposal, ImportSource } from '~/system/ai/types'
import { fakeFirebase, resetFakeFirestore } from '~/test/fake-firestore'

mock.module('~/system/firebase', fakeFirebase)

// The AI is mocked: what it answers is fixed here, so the test is about the
// GraphQL boundary — the freemium gate, the error codes, what gets persisted.
const proposal: AiProposal = {
  changeSummary: 'Bouillon 700 → 650 ml',
  rationale: 'Trop liquide au dernier essai',
  ingredients: [{ name: 'Bouillon', quantity: '650 ml' }],
  steps: [{ text: 'Mijoter 40 min', thermomix: {}, coffee: {} }],
  tips: [],
}
// The source the resolver assembled, captured so the tests can assert how photos,
// text and a URL combine before ever reaching Gemini.
let analysedSource: ImportSource | undefined
mock.module('~/system/ai', () => ({
  Ai: {
    proposeNext: async () => proposal,
    analyzeImport: async (source: ImportSource) => {
      analysedSource = source
      return 'no-recipe-found'
    },
    formatTips: async () => [],
  },
}))

// Premium is a verified App Store transaction; the comped-account list is how a
// test grants it without signing one.
let premiumUserIds: UserId[] = []
mock.module('~/system/config', () => ({ config: () => ({ premiumUserIds }) }))

const { schema } = await import('~/domain/shared/graphql/schema')
const { recipeSatelliteLoaders } = await import('~/domain/shared/graphql/loaders')
const { FREE_LIMITS, monthOf } = await import('~/domain/quota/business-rules')

const userId = 'user-1' as UserId
const recipeId = 'aaaaaaaa-0000-4000-8000-000000000001'

let fake = resetFakeFirestore()
beforeEach(() => {
  fake = resetFakeFirestore()
  premiumUserIds = []
  analysedSource = undefined
  seedRecipeWithV1()
})

const execute = (source: string) =>
  graphql({
    schema,
    source,
    contextValue: { userId, event: undefined as never, loaders: recipeSatelliteLoaders() },
  })

const seedRecipeWithV1 = () => {
  fake.seed('recipes', recipeId, {
    id: recipeId,
    userId,
    type: 'dish',
    category: 'main',
    categoryRank: 1,
    title: 'Blanquette',
    lastVersionNumber: 1,
    createdAt: new Date(1000),
    updatedAt: new Date(1000),
  })
  fake.seed('recipe-versions', `${recipeId}_1`, {
    userId,
    recipeId: recipeId as RecipeId,
    number: 1 as VersionNumber,
    createdAt: new Date(1000),
    origin: { kind: 'import' },
    content: { kind: 'dish', ingredients: [], steps: ['Mijoter 30 min'] },
    tips: [],
  })
}

// Put the monthly iteration meter wherever the test needs it.
const seedIterationsUsed = (iterations: number) => {
  const month = monthOf(new Date())
  fake.seed('ai-quotas', `${userId}_${month}`, { userId, month, imports: 0, iterations })
}

const request = `
  mutation {
    requestProposal(recipeId: "${recipeId}", versionNumber: 1, rating: 3, remarks: "Trop liquide") {
      basedOn
      changeSummary
      rationale
    }
  }
`

describe('requestProposal mutation', () => {
  test('returns the suggestion and persists nothing but the spent iteration', async () => {
    const result = await execute(request)
    expect(result.errors).toBeUndefined()
    expect(result.data?.requestProposal).toMatchObject({
      basedOn: 1,
      changeSummary: 'Bouillon 700 → 650 ml',
      rationale: 'Trop liquide au dernier essai',
    })
    // A proposal is ephemeral: no new version, and the rating stays in the request
    // until the proposal is accepted.
    expect([...fake.snapshot('recipe-versions').keys()]).toEqual([`${recipeId}_1`])
    expect(fake.snapshot('recipe-versions').get(`${recipeId}_1`)).not.toHaveProperty('rating')
    expect(fake.snapshot('ai-quotas').get(`${userId}_${monthOf(new Date())}`)?.iterations).toBe(1)
  })

  test('refuses once the free monthly iterations are used up', async () => {
    seedIterationsUsed(FREE_LIMITS.iteration)
    const result = await execute(request)
    expect(result.errors?.[0]?.extensions?.code).toBe('QUOTA_EXHAUSTED')
    // Refused before the call: nothing is spent on a request that never reached the AI.
    expect(fake.snapshot('ai-quotas').get(`${userId}_${monthOf(new Date())}`)?.iterations).toBe(
      FREE_LIMITS.iteration,
    )
  })

  test('never refuses a premium cook', async () => {
    premiumUserIds = [userId]
    seedIterationsUsed(FREE_LIMITS.iteration * 10)
    const result = await execute(request)
    expect(result.errors).toBeUndefined()
    expect(result.data?.requestProposal).toMatchObject({ basedOn: 1 })
  })

  test('surfaces an unknown version as NOT_FOUND', async () => {
    const result = await execute(`
      mutation {
        requestProposal(recipeId: "${recipeId}", versionNumber: 9, rating: 3, remarks: "Trop liquide") {
          basedOn
        }
      }
    `)
    expect(result.errors?.[0]?.extensions?.code).toBe('NOT_FOUND')
  })
})

describe('quota query', () => {
  test('reports what the free plan has left this month', async () => {
    seedIterationsUsed(2)
    const result = await execute(`
      query { quota { plan iterations { used limit remaining } imports { used limit } } }
    `)
    expect(result.errors).toBeUndefined()
    expect(result.data?.quota).toMatchObject({
      plan: 'FREE',
      iterations: { used: 2, limit: FREE_LIMITS.iteration, remaining: FREE_LIMITS.iteration - 2 },
      imports: { used: 0, limit: FREE_LIMITS.import },
    })
  })

  test('reports an unlimited allowance for a premium cook', async () => {
    premiumUserIds = [userId]
    const result = await execute(`query { quota { plan iterations { limit remaining } } }`)
    expect(result.errors).toBeUndefined()
    expect(result.data?.quota).toMatchObject({
      plan: 'PREMIUM',
      iterations: { limit: null, remaining: null },
    })
  })
})

describe('analyzeImport mutation — what counts as one source', () => {
  // The AI is mocked to answer 'no-recipe-found', which surfaces as this code —
  // proof the source passed validation and reached the analysis.
  const analyzed = async (args: string) => {
    const result = await execute(`mutation { analyzeImport(${args}) { title } }`)
    return result.errors?.[0]?.extensions?.code
  }

  test('reads photos and text as a single source', async () => {
    expect(await analyzed('photos: ["AAAA", "BBBB"], text: "Pour 4, au Chemex"')).toBe(
      'NO_RECIPE_FOUND',
    )
    expect(analysedSource).toEqual({
      kind: 'photos',
      photos: ['AAAA', 'BBBB'],
      text: 'Pour 4, au Chemex',
    })
  })

  test('leaves a photo-only source exactly as it was — no empty text', async () => {
    await analyzed('photos: ["AAAA"]')
    expect(analysedSource).toEqual({ kind: 'photos', photos: ['AAAA'] })
  })

  test('still takes text on its own', async () => {
    await analyzed('photos: [], text: "200 g de spaghetti"')
    expect(analysedSource).toEqual({ kind: 'text', text: '200 g de spaghetti' })
  })

  test('refuses a URL combined with photos or text — a web page is its own source', async () => {
    premiumUserIds = [userId] // past the Premium gate, so the refusal is about the mix
    expect(await analyzed('photos: ["AAAA"], url: "https://example.com"')).toBe('BAD_USER_INPUT')
    expect(await analyzed('photos: [], url: "https://example.com", text: "note"')).toBe(
      'BAD_USER_INPUT',
    )
    expect(analysedSource).toBeUndefined()
  })

  test('refuses an empty request', async () => {
    expect(await analyzed('photos: []')).toBe('BAD_USER_INPUT')
    expect(analysedSource).toBeUndefined()
  })

  test('refuses more photos than the limit allows', async () => {
    const photos = Array.from({ length: 7 }, (_, i) => `"P${i}"`).join(', ')
    expect(await analyzed(`photos: [${photos}], text: "note"`)).toBe('BAD_USER_INPUT')
    expect(analysedSource).toBeUndefined()
  })
})
