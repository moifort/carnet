import { beforeEach, describe, expect, mock, test } from 'bun:test'
import type { CoffeeContent } from '~/domain/recipe/content/coffee'
import type { DishContent } from '~/domain/recipe/content/dish'
import type { ThermomixContent } from '~/domain/recipe/content/thermomix'
import type {
  CoffeeGrind,
  CoffeeTemperature,
  CoffeeTime,
  CoffeeYield,
  Ingredient,
  IngredientName,
  IngredientQuantity,
  Rating,
  Recipe,
  RecipeId,
  RecipeTitle,
  Remarks,
  StepText,
  ThermomixSpeed,
  ThermomixTemperature,
  ThermomixTime,
  Tip,
  VersionNumber,
} from '~/domain/recipe/types'
import type { UserId } from '~/domain/shared/types'
import type { Proposal as AiProposal, ImportAnalysis } from '~/system/ai/types'
import { fakeFirebase, resetFakeFirestore } from '~/test/fake-firestore'

mock.module('~/system/firebase', fakeFirebase)

// The AI is mocked: each test sets `proposal`/`analysis`/`mergedTips`, and the
// use-case returns it (branded for a proposal or tips, raw for an import analysis).
let proposal: AiProposal
let analysis: ImportAnalysis | 'no-recipe-found'
let mergedTips: string[]
mock.module('~/system/ai', () => ({
  Ai: {
    proposeNext: async () => proposal,
    analyzeImport: async () => analysis,
    formatTips: async () => mergedTips,
  },
}))

// Premium is granted by a verified App Store transaction (see
// `EntitlementQuery.planOf`) or, for comped accounts, by this configured list —
// which is how these tests grant it without signing a transaction.
let premiumUserIds: UserId[] = []
mock.module('~/system/config', () => ({ config: () => ({ premiumUserIds }) }))

const { RecipeCommand } = await import('~/domain/recipe/command')
const { ProposalUseCase } = await import('~/domain/proposal/use-case')
const { FREE_LIMITS } = await import('~/domain/quota/business-rules')

const userId = 'user-1' as UserId
const V1 = 1 as VersionNumber
// The cook that asks for a proposal: it lives in the request until the proposal is
// accepted, never in storage beforehand.
const ATTEMPT = { rating: 3 as Rating, remarks: 'Trop liquide' as Remarks }

// Branded expected values (the fake snapshot is typed to the domain shapes).
const ing = (name: string, quantity: string): Ingredient => ({
  name: name as IngredientName,
  quantity: quantity as IngredientQuantity,
})
const stepList = (...s: string[]) => s.map((x) => x as StepText)
const PROPOSAL_INGREDIENTS = [ing('Veau', '800 g'), ing('Bouillon', '650 ml')]

const dishContent = (): DishContent => ({
  kind: 'dish',
  ingredients: [],
  steps: stepList('Saisir', 'Mijoter'),
})

const recipeInput = (opts: { type?: 'dish' | 'thermomix' | 'coffee' } = {}) => {
  const type = opts.type ?? ('dish' as const)
  const content =
    type === 'thermomix'
      ? ({
          kind: 'thermomix',
          ingredients: [],
          steps: stepList('Saisir', 'Mijoter').map((text) => ({ text, settings: {} })),
        } as ThermomixContent)
      : type === 'coffee'
        ? ({
            kind: 'coffee',
            ingredients: [],
            steps: stepList('Moudre', 'Extraire').map((text) => ({ text, settings: {} })),
          } as CoffeeContent)
        : dishContent()
  return {
    type,
    category: 'main' as const,
    // A brew method belongs to a coffee and to nothing else.
    ...(type === 'coffee' ? { method: 'v60' as const } : {}),
    title: 'Blanquette' as RecipeTitle,
    content,
    tips: [],
  }
}

const baseProposal = (): AiProposal => ({
  changeSummary: 'Bouillon 700 → 650 ml',
  rationale: 'Trop liquide',
  ingredients: [
    { name: 'Veau', quantity: '800 g' },
    { name: 'Bouillon', quantity: '650 ml' },
  ],
  steps: [
    { text: 'Saisir', thermomix: {}, coffee: {} },
    { text: 'Mijoter', thermomix: {}, coffee: {} },
  ],
  tips: ['Servir avec du riz'],
})

const baseAnalysis = (): ImportAnalysis => ({
  type: 'dish',
  category: 'main',
  title: 'Blanquette',
  sourceLabel: 'Grand-mère',
  ingredients: [{ name: 'Veau', quantity: '800 g' }],
  steps: [
    { text: 'Saisir', thermomix: {}, coffee: {} },
    { text: 'Mijoter', thermomix: {}, coffee: {} },
  ],
  tips: ['Servir avec du riz'],
})

let fake = resetFakeFirestore()
beforeEach(() => {
  fake = resetFakeFirestore()
  premiumUserIds = []
  proposal = baseProposal()
  analysis = baseAnalysis()
  mergedTips = ['Servir avec du riz', 'Se congèle bien']
})

describe('ProposalUseCase.fromAttempt', () => {
  test('returns not-found for an unknown recipe', async () => {
    expect(await ProposalUseCase.fromAttempt(userId, 'nope' as RecipeId, V1, ATTEMPT)).toBe(
      'not-found',
    )
  })

  test('returns not-found for an unknown version', async () => {
    const recipe = await RecipeCommand.create(userId, recipeInput())
    if (typeof recipe === 'string') throw new Error('expected a recipe')
    expect(await ProposalUseCase.fromAttempt(userId, recipe.id, 9 as VersionNumber, ATTEMPT)).toBe(
      'not-found',
    )
  })

  test('returns the branded proposal based on the tried version, persisting no version', async () => {
    const recipe = await RecipeCommand.create(userId, recipeInput())
    if (typeof recipe === 'string') throw new Error('expected a recipe')
    const docReadsBefore = fake.docReads
    const queryReadsBefore = fake.queryReads
    const batchesBefore = fake.batches.length
    const result = await ProposalUseCase.fromAttempt(userId, recipe.id, V1, ATTEMPT)
    if (typeof result === 'string') throw new Error('expected a proposal')

    expect(result.basedOn).toBe(V1)
    expect(result.changeSummary).toBe('Bouillon 700 → 650 ml')
    expect(result.rationale).toBe('Trop liquide')
    expect(result.content).toEqual({
      kind: 'dish',
      ingredients: PROPOSAL_INGREDIENTS,
      steps: stepList('Saisir', 'Mijoter'),
    })
    // The proposal carries the complete tips list of the version it would create.
    expect(result.tips).toEqual(['Servir avec du riz' as Tip])

    // Five keyed doc reads: the entitlement (what plan the cook is on), the
    // recipe pointer, the cooked version — the attempt itself comes from the
    // caller, so there is no collection scan and no N+1 — and the quota twice.
    // Twice on purpose: the memoized read is what the limit is checked against
    // before the call, and the record after it re-reads inside its transaction,
    // which is what stops two calls landing together from counting one. The only
    // write is that quota: no version and no recipe is touched until the proposal
    // is accepted.
    expect(fake.docReads - docReadsBefore).toBe(5)
    expect(fake.queryReads - queryReadsBefore).toBe(0)
    expect(fake.batches.length).toBe(batchesBefore)
    expect(fake.snapshot('recipe-versions').get(`${recipe.id}_1`)?.rating).toBeUndefined()
  })

  test('pairs the steps with settings for a thermomix recipe, plain steps for a dish', async () => {
    proposal = {
      ...baseProposal(),
      steps: [
        {
          text: 'Saisir',
          thermomix: { time: '5 min', temperature: '120°C', speed: '1' },
          coffee: {},
        },
        { text: 'Mijoter', thermomix: {}, coffee: {} },
      ],
    }
    const thermomix = await RecipeCommand.create(userId, recipeInput({ type: 'thermomix' }))
    if (typeof thermomix === 'string') throw new Error('expected a recipe')
    const thermomixProposal = await ProposalUseCase.fromAttempt(userId, thermomix.id, V1, ATTEMPT)
    if (typeof thermomixProposal === 'string') throw new Error('expected a proposal')
    expect(thermomixProposal.content).toEqual({
      kind: 'thermomix',
      ingredients: PROPOSAL_INGREDIENTS,
      steps: [
        {
          text: 'Saisir' as StepText,
          settings: {
            time: '5 min' as ThermomixTime,
            temperature: '120°C' as ThermomixTemperature,
            speed: '1' as ThermomixSpeed,
          },
        },
        { text: 'Mijoter' as StepText, settings: {} },
      ],
    })

    // Same proposal on a dish recipe: Thermomix settings are dropped entirely.
    const dish = await RecipeCommand.create(userId, recipeInput())
    if (typeof dish === 'string') throw new Error('expected a recipe')
    const dishProposal = await ProposalUseCase.fromAttempt(userId, dish.id, V1, ATTEMPT)
    if (typeof dishProposal === 'string') throw new Error('expected a proposal')
    expect(dishProposal.content).toEqual({
      kind: 'dish',
      ingredients: PROPOSAL_INGREDIENTS,
      steps: stepList('Saisir', 'Mijoter'),
    })
  })

  test('keeps a coffee proposal’s extraction settings, and only those', async () => {
    proposal = {
      ...baseProposal(),
      steps: [
        // The same proposal carries both settings objects; each type reads its own.
        {
          text: 'Moudre',
          thermomix: { speed: '1' },
          coffee: { grind: 'fine' },
        },
        {
          text: 'Extraire',
          thermomix: {},
          coffee: { temperature: '93°C', time: '28 s', yield: '36 g' },
        },
      ],
    }
    const coffee = await RecipeCommand.create(userId, recipeInput({ type: 'coffee' }))
    if (typeof coffee === 'string') throw new Error('expected a recipe')
    const coffeeProposal = await ProposalUseCase.fromAttempt(userId, coffee.id, V1, ATTEMPT)
    if (typeof coffeeProposal === 'string') throw new Error('expected a proposal')
    expect(coffeeProposal.content).toEqual({
      kind: 'coffee',
      ingredients: PROPOSAL_INGREDIENTS,
      steps: [
        { text: 'Moudre' as StepText, settings: { grind: 'fine' as CoffeeGrind } },
        {
          text: 'Extraire' as StepText,
          settings: {
            temperature: '93°C' as CoffeeTemperature,
            time: '28 s' as CoffeeTime,
            yield: '36 g' as CoffeeYield,
          },
        },
      ],
    })
  })
})

describe('ProposalUseCase.fromImprovement', () => {
  test('proposes from what the cook asked, with no attempt behind it', async () => {
    const recipe = await RecipeCommand.create(userId, recipeInput())
    if (typeof recipe === 'string') throw new Error('expected a recipe')
    const docReadsBefore = fake.docReads
    const batchesBefore = fake.batches.length

    const result = await ProposalUseCase.fromImprovement(
      userId,
      recipe.id,
      V1,
      'Version végétarienne' as Remarks,
    )
    if (typeof result === 'string') throw new Error('expected a proposal')
    expect(result.basedOn).toBe(V1)
    expect(result.content).toEqual({
      kind: 'dish',
      ingredients: PROPOSAL_INGREDIENTS,
      steps: stepList('Saisir', 'Mijoter'),
    })

    // Same budget as fromAttempt: entitlement, recipe pointer, version, and the
    // quota read twice — once to check the limit, once inside the recording
    // transaction.
    expect(fake.docReads - docReadsBefore).toBe(5)
    expect(fake.batches.length).toBe(batchesBefore)
  })

  test('returns not-found for an unknown recipe', async () => {
    expect(
      await ProposalUseCase.fromImprovement(userId, 'nope' as RecipeId, V1, 'x' as Remarks),
    ).toBe('not-found')
  })
})

describe('ProposalUseCase.fromTips', () => {
  test('returns the branded merged list, persisting no version', async () => {
    const recipe = await RecipeCommand.create(userId, recipeInput())
    if (typeof recipe === 'string') throw new Error('expected a recipe')
    const docReadsBefore = fake.docReads
    const batchesBefore = fake.batches.length

    const result = await ProposalUseCase.fromTips(
      userId,
      recipe.id,
      V1,
      'servir avec du riz, se congèle bien' as Remarks,
    )
    if (typeof result === 'string') throw new Error('expected tips')
    expect(result).toEqual(['Servir avec du riz' as Tip, 'Se congèle bien' as Tip])

    // Same budget as a version proposal — entitlement, recipe pointer, version,
    // and the quota twice (the limit check, then the recording transaction) — and
    // the version's own tips are left exactly as they were until updateTips.
    expect(fake.docReads - docReadsBefore).toBe(5)
    expect(fake.batches.length).toBe(batchesBefore)
    expect(fake.snapshot('recipe-versions').get(`${recipe.id}_1`)?.tips).toEqual([])
  })

  test('returns not-found for an unknown recipe or version', async () => {
    expect(await ProposalUseCase.fromTips(userId, 'nope' as RecipeId, V1, 'x' as Remarks)).toBe(
      'not-found',
    )

    const recipe = await RecipeCommand.create(userId, recipeInput())
    if (typeof recipe === 'string') throw new Error('expected a recipe')
    expect(
      await ProposalUseCase.fromTips(userId, recipe.id, 9 as VersionNumber, 'x' as Remarks),
    ).toBe('not-found')
  })
})

describe('ProposalUseCase.fromPhoto', () => {
  test('returns the AI import analysis without persisting a recipe', async () => {
    const batchesBefore = fake.batches.length
    const result = await ProposalUseCase.fromPhoto(userId, { kind: 'text', text: 'Blanquette' })

    expect(result).toEqual(baseAnalysis())
    expect(fake.batches.length).toBe(batchesBefore)
    expect(fake.snapshot('recipes').size).toBe(0)
  })

  test('passes the no-recipe-found sentinel straight through, free of charge', async () => {
    analysis = 'no-recipe-found'
    expect(await ProposalUseCase.fromPhoto(userId, { kind: 'text', text: 'nope' })).toBe(
      'no-recipe-found',
    )
    // A source with no recipe in it is a miss, not an import: nothing is spent.
    expect(fake.snapshot('ai-quotas').size).toBe(0)
  })

  test('reserves the URL import for Premium', async () => {
    expect(await ProposalUseCase.fromPhoto(userId, { kind: 'url', url: 'https://x.test' })).toBe(
      'premium-required',
    )
    // Refused before Gemini is ever called, so it costs nothing at all.
    expect(fake.snapshot('ai-quotas').size).toBe(0)

    premiumUserIds = [userId]
    expect(await ProposalUseCase.fromPhoto(userId, { kind: 'url', url: 'https://x.test' })).toEqual(
      baseAnalysis(),
    )
  })
})

describe('the monthly AI allowance', () => {
  const textSource = { kind: 'text', text: 'Blanquette' } as const

  test('refuses the import past the free limit, then again the next call', async () => {
    for (const _ of Array(FREE_LIMITS.import).keys())
      expect(await ProposalUseCase.fromPhoto(userId, textSource)).toEqual(baseAnalysis())

    expect(await ProposalUseCase.fromPhoto(userId, textSource)).toBe('quota-exhausted')
    expect(await ProposalUseCase.fromPhoto(userId, textSource)).toBe('quota-exhausted')
  })

  test('counts proposals, improvements and tips on the one iteration meter', async () => {
    const recipe = await RecipeCommand.create(userId, recipeInput())
    if (typeof recipe === 'string') throw new Error('expected a recipe')

    // Three different AI calls on an existing version, one shared meter.
    await ProposalUseCase.fromAttempt(userId, recipe.id, V1, ATTEMPT)
    await ProposalUseCase.fromImprovement(userId, recipe.id, V1, 'Végétarien' as Remarks)
    await ProposalUseCase.fromTips(userId, recipe.id, V1, 'riz' as Remarks)
    for (const _ of Array(FREE_LIMITS.iteration - 3).keys())
      await ProposalUseCase.fromAttempt(userId, recipe.id, V1, ATTEMPT)

    expect(await ProposalUseCase.fromAttempt(userId, recipe.id, V1, ATTEMPT)).toBe(
      'quota-exhausted',
    )
    expect(await ProposalUseCase.fromTips(userId, recipe.id, V1, 'riz' as Remarks)).toBe(
      'quota-exhausted',
    )
    // The import meter is untouched by iterations.
    expect(await ProposalUseCase.fromPhoto(userId, textSource)).toEqual(baseAnalysis())
  })

  test('never runs out on Premium', async () => {
    premiumUserIds = [userId]
    for (const _ of Array(FREE_LIMITS.import + 2).keys())
      expect(await ProposalUseCase.fromPhoto(userId, textSource)).toEqual(baseAnalysis())
  })
})

describe('ProposalUseCase.accept', () => {
  test('appends version n+1 from the passed proposal, based on the threaded version', async () => {
    const recipe = await RecipeCommand.create(userId, recipeInput())
    if (typeof recipe === 'string') throw new Error('expected a recipe')
    const queryReadsBefore = fake.queryReads

    const result = (await ProposalUseCase.accept(userId, recipe.id, {
      basedOn: V1,
      changeSummary: 'Bouillon 700 → 650 ml',
      rationale: 'Trop liquide',
      attempt: ATTEMPT,
      content: {
        kind: 'dish',
        ingredients: PROPOSAL_INGREDIENTS,
        steps: stepList('Saisir', 'Mijoter'),
      },
      tips: ['Servir avec du riz' as Tip],
    })) as Recipe
    expect(result.lastVersionNumber).toBe(2 as VersionNumber)

    const v2 = fake.snapshot('recipe-versions').get(`${recipe.id}_2`)
    expect(v2?.change).toBe('Bouillon 700 → 650 ml')
    expect(v2?.why).toBe('Trop liquide')
    // basedOn is threaded through the payload — no lineage rescan to recover it.
    expect(v2?.basedOn).toBe(1 as VersionNumber)
    expect(v2?.content).toEqual({
      kind: 'dish',
      ingredients: PROPOSAL_INGREDIENTS,
      steps: stepList('Saisir', 'Mijoter'),
    })
    expect(v2?.origin).toEqual({ kind: 'ai-proposal' })
    // The accepted tips land on the version created, not on the one it iterates on.
    expect(v2?.tips).toEqual(['Servir avec du riz' as Tip])
    expect(fake.snapshot('recipe-versions').get(`${recipe.id}_1`)?.tips).toEqual([])
    expect(fake.queryReads - queryReadsBefore).toBe(0)
  })

  test('accepting an improvement creates a version to test, with no outcome', async () => {
    const recipe = await RecipeCommand.create(userId, recipeInput())
    if (typeof recipe === 'string') throw new Error('expected a recipe')

    await ProposalUseCase.accept(userId, recipe.id, {
      basedOn: V1,
      changeSummary: 'Version végétarienne',
      rationale: 'Demandé',
      content: {
        kind: 'dish',
        ingredients: PROPOSAL_INGREDIENTS,
        steps: stepList('Saisir'),
      },
      tips: [],
    })

    const v2 = fake.snapshot('recipe-versions').get(`${recipe.id}_2`)
    expect(v2?.toTest).toBe(true)
    expect(v2).not.toHaveProperty('executedAt')
    expect(v2).not.toHaveProperty('rating')
  })

  test('returns not-found for an unknown recipe', async () => {
    expect(
      await ProposalUseCase.accept(userId, 'nope' as RecipeId, {
        basedOn: V1,
        changeSummary: 'x',
        rationale: 'y',
        attempt: ATTEMPT,
        content: { kind: 'dish', ingredients: PROPOSAL_INGREDIENTS, steps: stepList('Saisir') },
        tips: [],
      }),
    ).toBe('not-found')
  })
})
