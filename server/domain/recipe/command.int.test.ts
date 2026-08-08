import { afterEach, beforeEach, describe, expect, mock, setSystemTime, test } from 'bun:test'
import { type CoffeeContent, emptyCoffeeParameters } from '~/domain/recipe/content/coffee'
import type { DishContent } from '~/domain/recipe/content/dish'
import type { ThermomixContent } from '~/domain/recipe/content/thermomix'
import type {
  CoffeeBeanName,
  CoffeeDose,
  CoffeeGrinder,
  CoffeeMachine,
  CoffeeTemperature,
  CoffeeTime,
  CoffeeWater,
  CoffeeWaterKind,
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
  ThermomixTime,
  Tip,
  VersionNumber,
  Warning,
} from '~/domain/recipe/types'
import type { UserId } from '~/domain/shared/types'
import { fakeFirebase, resetFakeFirestore } from '~/test/fake-firestore'

mock.module('~/system/firebase', fakeFirebase)

const { RecipeCommand } = await import('~/domain/recipe/command')
const repository = await import('~/domain/recipe/infrastructure/repository')

const userId = 'user-1' as UserId
const ingredient = (n: string, q: string): Ingredient => ({
  name: n as IngredientName,
  quantity: q as IngredientQuantity,
})
const steps = (...s: string[]) => s.map((x) => x as StepText)

const dishContent = (opts: { ingredients?: Ingredient[] } = {}): DishContent => ({
  kind: 'dish',
  ingredients: opts.ingredients ?? [],
  steps: steps('Saisir', 'Mijoter'),
})

const coffeeContent = (): CoffeeContent => ({
  kind: 'coffee',
  beans: { name: 'Belleville — Guji' as CoffeeBeanName, dose: '18 g' as CoffeeDose },
  water: { amount: '36 g' as CoffeeWater },
  extraction: {},
  gear: { machine: 'Rancilio Silvia' as CoffeeMachine },
  steps: [
    { text: 'Moudre' as StepText, settings: {} },
    {
      text: 'Extraire' as StepText,
      settings: { temperature: '93°C' as CoffeeTemperature, time: '28 s' as CoffeeTime },
    },
  ],
})

const newInput = (content: DishContent | ThermomixContent = dishContent()) => ({
  type: content.kind,
  category: 'main' as const,
  title: 'Blanquette' as RecipeTitle,
  content,
  tips: [],
})

let fake = resetFakeFirestore()
beforeEach(() => {
  fake = resetFakeFirestore()
})

describe('RecipeCommand.create', () => {
  test('creates a pointer recipe and its v1 (based on nothing) atomically', async () => {
    const recipe = await RecipeCommand.create(userId, newInput(), 'Un site')
    if (typeof recipe === 'string') throw new Error(`expected a recipe, got ${recipe}`)

    expect(recipe.lastVersionNumber).toBe(1 as VersionNumber)
    expect(fake.snapshot('recipes').get(recipe.id as string)?.type).toBe('dish')
    const v1 = fake.snapshot('recipe-versions').get(`${recipe.id}_1`)
    expect(v1?.origin).toEqual({ kind: 'import', detail: 'Un site' })
    // v1 iterates on nothing and starts as a planned attempt: the absent fields
    // are absent from the document, never stored as null.
    expect(v1).not.toHaveProperty('change')
    expect(v1).not.toHaveProperty('basedOn')
    expect(v1).not.toHaveProperty('executedAt')
    expect(v1).not.toHaveProperty('rating')
    expect(v1).not.toHaveProperty('remarks')
    expect(v1).not.toHaveProperty('photoPath')
    // Both docs land in a single batch (all-or-nothing).
    expect(fake.directWrites).toEqual([])
    expect(fake.batches.length).toBe(1)
  })

  test('stores the version content verbatim, empty settings steps included', async () => {
    const content: ThermomixContent = {
      kind: 'thermomix',
      ingredients: [ingredient('Gin', '50 ml')],
      steps: [
        {
          text: 'Mixer' as StepText,
          settings: { time: '5 min' as ThermomixTime, speed: '4' as ThermomixSpeed, reverse: true },
        },
        { text: 'Servir' as StepText, settings: {} },
      ],
    }
    const recipe = await RecipeCommand.create(userId, newInput(content))
    if (typeof recipe === 'string') throw new Error(`expected a recipe, got ${recipe}`)

    // A plain step keeps its slot as the empty settings object — Firestore stores
    // it verbatim, no `null` placeholder needed.
    expect(fake.snapshot('recipe-versions').get(`${recipe.id}_1`)?.content).toEqual(content)
  })

  test('rejects content whose kind does not match the recipe type', async () => {
    const mismatch = await RecipeCommand.create(userId, {
      type: 'thermomix',
      category: 'main' as const,
      title: 'Blanquette' as RecipeTitle,
      content: dishContent(),
      tips: [],
    })
    expect(mismatch).toBe('content-type-mismatch')
    // Nothing written on the rejected create.
    expect(fake.batches.length).toBe(0)
    expect(fake.directWrites).toEqual([])
  })

  test('rejects a coffee with no brew method, and a method on anything else', async () => {
    const methodless = await RecipeCommand.create(userId, {
      type: 'coffee',
      category: 'drink' as const,
      title: 'Espresso' as RecipeTitle,
      content: coffeeContent(),
      tips: [],
    })
    expect(methodless).toBe('method-mismatch')

    const dishWithMethod = await RecipeCommand.create(userId, {
      ...newInput(),
      method: 'v60' as const,
    })
    expect(dishWithMethod).toBe('method-mismatch')

    expect(fake.batches.length).toBe(0)
    expect(fake.directWrites).toEqual([])
  })

  test('files a coffee as a drink whatever category it is given, and keeps its method', async () => {
    const recipe = await RecipeCommand.create(userId, {
      type: 'coffee',
      // The AI filed it as a main course; a coffee is a drink regardless.
      category: 'main' as const,
      method: 'v60' as const,
      title: 'V60 Éthiopie' as RecipeTitle,
      content: coffeeContent(),
      tips: [],
    })
    if (typeof recipe === 'string') throw new Error(`expected a recipe, got ${recipe}`)

    expect(recipe.category).toBe('drink')
    expect(recipe.method).toBe('v60')
    const stored = fake.snapshot('recipes').get(recipe.id as string)
    // The coffee tab's Firestore order reads the denormalized rank, not the value.
    expect(stored?.methodRank).toBe(6)
    expect(fake.snapshot('recipe-versions').get(`${recipe.id}_1`)?.content).toEqual(coffeeContent())
  })

  test('persists ingredients on v1 and stores [] when absent', async () => {
    const ingredients = [ingredient('Gin', '50 ml'), ingredient('Vermouth rouge', '25 ml')]
    const withIngredients = await RecipeCommand.create(
      userId,
      newInput(dishContent({ ingredients })),
    )
    if (typeof withIngredients === 'string') throw new Error('expected a recipe')
    expect(fake.snapshot('recipe-versions').get(`${withIngredients.id}_1`)?.content).toEqual(
      dishContent({ ingredients }),
    )

    const without = await RecipeCommand.create(userId, newInput())
    if (typeof without === 'string') throw new Error('expected a recipe')
    expect(fake.snapshot('recipe-versions').get(`${without.id}_1`)?.content).toEqual(dishContent())
  })
})

describe('RecipeCommand.addVersion', () => {
  test('appends v2, stamping its basedOn and bumping the version count', async () => {
    const recipe = await RecipeCommand.create(userId, newInput())
    if (typeof recipe === 'string') throw new Error('expected a recipe')

    const content: DishContent = {
      kind: 'dish',
      ingredients: [],
      steps: steps('Saisir', 'Mijoter'),
    }
    const withV2 = (await RecipeCommand.addVersion(userId, recipe.id, {
      change: 'Bouillon 700 → 650 ml',
      basedOn: 1 as VersionNumber,
      content,
      tips: [],
    })) as Recipe

    expect(withV2.lastVersionNumber).toBe(2 as VersionNumber)
    const v2 = fake.snapshot('recipe-versions').get(`${recipe.id}_2`)
    expect(v2?.change).toBe('Bouillon 700 → 650 ml')
    expect(v2?.basedOn).toBe(1 as VersionNumber)
    expect(v2?.content).toEqual(content)
    // A freshly appended version is a planned attempt: no outcome stored at all.
    expect(v2).not.toHaveProperty('executedAt')
    expect(v2).not.toHaveProperty('rating')
    expect(v2).not.toHaveProperty('remarks')
    // The version + recipe bump land in a single batch (all-or-nothing).
    expect(fake.directWrites).toEqual([])
  })

  test('an improvement-born version is one to test, and v1 never was', async () => {
    const recipe = await RecipeCommand.create(userId, newInput())
    if (typeof recipe === 'string') throw new Error('expected a recipe')
    // Only an improvement puts a version on the to-cook list — v1 is not one.
    expect(fake.snapshot('recipe-versions').get(`${recipe.id}_1`)).not.toHaveProperty('toTest')

    await RecipeCommand.addVersion(userId, recipe.id, {
      change: 'Version végétarienne',
      basedOn: 1 as VersionNumber,
      content: { kind: 'dish', ingredients: [], steps: steps('Saisir') },
      tips: [],
    })
    expect(fake.snapshot('recipe-versions').get(`${recipe.id}_2`)?.toTest).toBe(true)
  })

  test('an attempt-born version is not to test, and clears the flag of the one it answers', async () => {
    const recipe = await RecipeCommand.create(userId, newInput())
    if (typeof recipe === 'string') throw new Error('expected a recipe')
    // v2 comes from an improvement: it is waiting to be cooked.
    await RecipeCommand.addVersion(userId, recipe.id, {
      change: 'Version végétarienne',
      basedOn: 1 as VersionNumber,
      content: { kind: 'dish', ingredients: [], steps: steps('Saisir') },
      tips: [],
    })

    // Cooking it with remarks answers it with v3 — v2 owes nothing anymore.
    await RecipeCommand.addVersion(userId, recipe.id, {
      change: 'Moins de sel',
      basedOn: 2 as VersionNumber,
      content: { kind: 'dish', ingredients: [], steps: steps('Saisir') },
      tips: [],
      attempt: { rating: 3 as Rating, remarks: 'Trop salé' as Remarks },
    })

    expect(fake.snapshot('recipe-versions').get(`${recipe.id}_2`)).not.toHaveProperty('toTest')
    expect(fake.snapshot('recipe-versions').get(`${recipe.id}_3`)).not.toHaveProperty('toTest')
  })

  test('records the attempt that produced v2 on v2, leaving v1 untouched', async () => {
    const recipe = await RecipeCommand.create(userId, newInput())
    if (typeof recipe === 'string') throw new Error('expected a recipe')

    await RecipeCommand.addVersion(userId, recipe.id, {
      change: 'Bouillon 700 → 650 ml',
      basedOn: 1 as VersionNumber,
      content: { kind: 'dish', ingredients: [], steps: steps('Saisir') },
      tips: [],
      attempt: { rating: 3 as Rating, remarks: 'Trop liquide' as Remarks },
    })

    // The cook that asked for v2 is v2's own outcome.
    const v2 = fake.snapshot('recipe-versions').get(`${recipe.id}_2`)
    expect(v2?.rating).toBe(3 as Rating)
    expect(v2?.remarks).toBe('Trop liquide' as Remarks)
    expect(v2?.executedAt).toBeInstanceOf(Date)
    // The version it iterates on keeps no trace of it.
    const v1 = fake.snapshot('recipe-versions').get(`${recipe.id}_1`)
    expect(v1).not.toHaveProperty('executedAt')
    expect(v1).not.toHaveProperty('rating')
    expect(v1).not.toHaveProperty('remarks')
  })

  test('rejects content whose kind does not match the recipe type', async () => {
    const recipe = await RecipeCommand.create(userId, newInput())
    if (typeof recipe === 'string') throw new Error('expected a recipe')
    const result = await RecipeCommand.addVersion(userId, recipe.id, {
      change: 'x',
      content: { kind: 'thermomix', ingredients: [], steps: [] },
      tips: [],
    })
    expect(result).toBe('content-type-mismatch')
  })

  test('returns not-found for an unknown recipe', async () => {
    const result = await RecipeCommand.addVersion(userId, 'nope' as RecipeId, {
      change: 'x',
      content: { kind: 'dish', ingredients: [], steps: [] },
      tips: [],
    })
    expect(result).toBe('not-found')
  })
})

describe('RecipeCommand.update', () => {
  test('marks and un-marks a favourite, absence being the un-marked state', async () => {
    const recipe = await RecipeCommand.create(userId, newInput())
    if (typeof recipe === 'string') throw new Error('expected a recipe')
    // Freshly created: not a favourite, and the field is not there at all.
    expect(fake.snapshot('recipes').get(recipe.id)).not.toHaveProperty('favorite')

    await RecipeCommand.update(userId, recipe.id, { favorite: true })
    expect(fake.snapshot('recipes').get(recipe.id)?.favorite).toBe(true)

    await RecipeCommand.update(userId, recipe.id, { favorite: false })
    expect(fake.snapshot('recipes').get(recipe.id)).not.toHaveProperty('favorite')
  })

  test('renames without touching the favourite, and vice versa', async () => {
    const recipe = await RecipeCommand.create(userId, newInput())
    if (typeof recipe === 'string') throw new Error('expected a recipe')
    await RecipeCommand.update(userId, recipe.id, { favorite: true })

    await RecipeCommand.update(userId, recipe.id, { title: 'Blanquette de veau' as RecipeTitle })
    const renamed = fake.snapshot('recipes').get(recipe.id)
    expect(renamed?.title).toBe('Blanquette de veau' as RecipeTitle)
    expect(renamed?.favorite).toBe(true)

    await RecipeCommand.update(userId, recipe.id, { favorite: false })
    expect(fake.snapshot('recipes').get(recipe.id)?.title).toBe('Blanquette de veau' as RecipeTitle)
  })

  test('refiles the recipe under another course, re-deriving its sort rank', async () => {
    const recipe = await RecipeCommand.create(userId, newInput())
    if (typeof recipe === 'string') throw new Error('expected a recipe')

    await RecipeCommand.update(userId, recipe.id, { category: 'drink' })
    const refiled = fake.snapshot('recipes').get(recipe.id)
    expect(refiled?.category).toBe('drink')
    expect(refiled?.categoryRank).toBe(6)
  })

  test('returns not-found for an unknown recipe', async () => {
    expect(await RecipeCommand.update(userId, 'nope' as RecipeId, { favorite: true })).toBe(
      'not-found',
    )
  })
})

describe('RecipeCommand.removeVersion', () => {
  // A three-version chain v1 → v2 → v3, each iterating on the previous one.
  const threeVersionRecipe = async (): Promise<Recipe> => {
    const recipe = await RecipeCommand.create(userId, newInput())
    if (typeof recipe === 'string') throw new Error('expected a recipe')
    await RecipeCommand.addVersion(userId, recipe.id, {
      change: 'v2',
      basedOn: 1 as VersionNumber,
      content: dishContent(),
      tips: [],
    })
    await RecipeCommand.addVersion(userId, recipe.id, {
      change: 'v3',
      basedOn: 2 as VersionNumber,
      content: dishContent(),
      tips: [],
    })
    return recipe
  }

  test('deletes the version and re-threads its children onto its base, atomically', async () => {
    const recipe = await threeVersionRecipe()
    const batchesBefore = fake.batches.length

    const result = await RecipeCommand.removeVersion(userId, recipe.id, 2 as VersionNumber)
    expect(result).toBeUndefined()

    expect(fake.snapshot('recipe-versions').has(`${recipe.id}_2`)).toBe(false)
    // v3 iterated on v2; it now iterates on what v2 iterated on.
    expect(fake.snapshot('recipe-versions').get(`${recipe.id}_3`)?.basedOn).toBe(1 as VersionNumber)
    // The allocator never rolls back: the next iteration must not reuse a number.
    expect(fake.snapshot('recipes').get(recipe.id)?.lastVersionNumber).toBe(3 as VersionNumber)
    // Re-threading + delete + recipe bump land in a single batch (all-or-nothing).
    expect(fake.directWrites).toEqual([])
    expect(fake.batches.length).toBe(batchesBefore + 1)
  })

  test('deleting a root leaves its children iterating on nothing', async () => {
    const recipe = await threeVersionRecipe()

    await RecipeCommand.removeVersion(userId, recipe.id, 1 as VersionNumber)

    const v2 = fake.snapshot('recipe-versions').get(`${recipe.id}_2`)
    expect(v2).not.toHaveProperty('basedOn')
    // The rest of the chain is untouched.
    expect(fake.snapshot('recipe-versions').get(`${recipe.id}_3`)?.basedOn).toBe(2 as VersionNumber)
  })

  test('deleting the sole version removes the whole recipe', async () => {
    const recipe = await RecipeCommand.create(userId, newInput())
    if (typeof recipe === 'string') throw new Error('expected a recipe')

    const result = await RecipeCommand.removeVersion(userId, recipe.id, 1 as VersionNumber)
    expect(result).toBeUndefined()

    expect(fake.snapshot('recipes').has(recipe.id)).toBe(false)
    expect(fake.snapshot('recipe-versions').has(`${recipe.id}_1`)).toBe(false)
  })

  test('a deleted number is never reused by the next iteration', async () => {
    const recipe = await RecipeCommand.create(userId, newInput())
    if (typeof recipe === 'string') throw new Error('expected a recipe')
    await RecipeCommand.addVersion(userId, recipe.id, {
      change: 'v2',
      basedOn: 1 as VersionNumber,
      content: dishContent(),
      tips: [],
    })

    await RecipeCommand.removeVersion(userId, recipe.id, 2 as VersionNumber)
    await RecipeCommand.addVersion(userId, recipe.id, {
      change: 'après le trou',
      basedOn: 1 as VersionNumber,
      content: dishContent(),
      tips: [],
    })

    // v2's number stays a hole: the new iteration is v3.
    expect(fake.snapshot('recipe-versions').has(`${recipe.id}_2`)).toBe(false)
    expect(fake.snapshot('recipe-versions').get(`${recipe.id}_3`)?.change).toBe('après le trou')
  })

  test('returns not-found for an unknown recipe or version', async () => {
    expect(await RecipeCommand.removeVersion(userId, 'nope' as RecipeId, 1 as VersionNumber)).toBe(
      'not-found',
    )

    const recipe = await RecipeCommand.create(userId, newInput())
    if (typeof recipe === 'string') throw new Error('expected a recipe')
    expect(await RecipeCommand.removeVersion(userId, recipe.id, 9 as VersionNumber)).toBe(
      'not-found',
    )
    // Nothing was written on the rejected removals.
    expect(fake.snapshot('recipe-versions').has(`${recipe.id}_1`)).toBe(true)
  })
})

describe('RecipeCommand.recordAttempt', () => {
  test('folds the outcome onto v1 and returns the executed version', async () => {
    const recipe = await RecipeCommand.create(userId, newInput())
    if (typeof recipe === 'string') throw new Error('expected a recipe')
    const batchesBefore = fake.batches.length

    const result = await RecipeCommand.recordAttempt(userId, {
      recipeId: recipe.id,
      versionNumber: 1 as VersionNumber,
      rating: 5 as Rating,
      remarks: 'Parfait' as Remarks,
    })
    if (typeof result === 'string') throw new Error(`expected a result, got ${result}`)

    expect(result.rating).toBe(5 as Rating)
    expect(result.remarks).toBe('Parfait' as Remarks)
    expect(result.executedAt).toBeInstanceOf(Date)
    // The content rides along untouched by the outcome write.
    expect(result.content).toEqual(dishContent())

    const stored = fake.snapshot('recipe-versions').get(`${recipe.id}_1`)
    expect(stored?.rating).toBe(5 as Rating)
    expect(stored?.executedAt).toBeInstanceOf(Date)
    // Outcome + recipe bump land in a single batch (all-or-nothing).
    expect(fake.directWrites).toEqual([])
    expect(fake.batches.length).toBe(batchesBefore + 1)
  })

  test('cooking a version takes it off the to-cook list', async () => {
    const recipe = await RecipeCommand.create(userId, newInput())
    if (typeof recipe === 'string') throw new Error('expected a recipe')
    await RecipeCommand.addVersion(userId, recipe.id, {
      change: 'Version végétarienne',
      basedOn: 1 as VersionNumber,
      content: { kind: 'dish', ingredients: [], steps: steps('Saisir') },
      tips: [],
    })

    await RecipeCommand.recordAttempt(userId, {
      recipeId: recipe.id,
      versionNumber: 2 as VersionNumber,
      rating: 4 as Rating,
    })
    expect(fake.snapshot('recipe-versions').get(`${recipe.id}_2`)).not.toHaveProperty('toTest')
  })

  test('records a bare rating, and a re-cook without remarks erases the earlier ones', async () => {
    const recipe = await RecipeCommand.create(userId, newInput())
    if (typeof recipe === 'string') throw new Error('expected a recipe')

    const rated = await RecipeCommand.recordAttempt(userId, {
      recipeId: recipe.id,
      versionNumber: 1 as VersionNumber,
      rating: 4 as Rating,
    })
    if (typeof rated === 'string') throw new Error(`expected a result, got ${rated}`)
    expect(rated.rating).toBe(4 as Rating)
    expect(rated).not.toHaveProperty('remarks')

    await RecipeCommand.recordAttempt(userId, {
      recipeId: recipe.id,
      versionNumber: 1 as VersionNumber,
      rating: 2 as Rating,
      remarks: 'Trop cuit' as Remarks,
    })
    const bare = await RecipeCommand.recordAttempt(userId, {
      recipeId: recipe.id,
      versionNumber: 1 as VersionNumber,
      rating: 5 as Rating,
    })
    if (typeof bare === 'string') throw new Error(`expected a result, got ${bare}`)
    expect(bare).not.toHaveProperty('remarks')
    expect(fake.snapshot('recipe-versions').get(`${recipe.id}_1`)).not.toHaveProperty('remarks')
  })

  test('overwrites a previously recorded attempt on the same version', async () => {
    const recipe = await RecipeCommand.create(userId, newInput())
    if (typeof recipe === 'string') throw new Error('expected a recipe')
    await RecipeCommand.recordAttempt(userId, {
      recipeId: recipe.id,
      versionNumber: 1 as VersionNumber,
      rating: 3 as Rating,
      remarks: 'Bof' as Remarks,
    })

    const again = await RecipeCommand.recordAttempt(userId, {
      recipeId: recipe.id,
      versionNumber: 1 as VersionNumber,
      rating: 4 as Rating,
      remarks: 'Better' as Remarks,
    })
    if (typeof again === 'string') throw new Error(`expected a result, got ${again}`)
    expect(again.rating).toBe(4 as Rating)
    expect(again.remarks).toBe('Better' as Remarks)

    const stored = fake.snapshot('recipe-versions').get(`${recipe.id}_1`)
    expect(stored?.rating).toBe(4 as Rating)
    expect(stored?.remarks).toBe('Better' as Remarks)
  })

  test('erases the previous photo when the re-cook carries none', async () => {
    const recipe = await RecipeCommand.create(userId, newInput())
    if (typeof recipe === 'string') throw new Error('expected a recipe')
    await RecipeCommand.recordAttempt(userId, {
      recipeId: recipe.id,
      versionNumber: 1 as VersionNumber,
      rating: 3 as Rating,
      remarks: 'Bof' as Remarks,
      photoPath: 'photos/first-try.jpg',
    })
    expect(fake.snapshot('recipe-versions').get(`${recipe.id}_1`)?.photoPath).toBe(
      'photos/first-try.jpg',
    )

    const again = await RecipeCommand.recordAttempt(userId, {
      recipeId: recipe.id,
      versionNumber: 1 as VersionNumber,
      rating: 4 as Rating,
      remarks: 'Better' as Remarks,
    })
    if (typeof again === 'string') throw new Error(`expected a result, got ${again}`)

    // The outcome is rewritten in place: the field is gone from the document, not
    // left behind at its previous value.
    expect(again).not.toHaveProperty('photoPath')
    expect(fake.snapshot('recipe-versions').get(`${recipe.id}_1`)).not.toHaveProperty('photoPath')
  })

  test('returns not-found for an unknown recipe or version', async () => {
    const unknownRecipe = await RecipeCommand.recordAttempt(userId, {
      recipeId: 'nope' as RecipeId,
      versionNumber: 1 as VersionNumber,
      rating: 4 as Rating,
      remarks: '' as Remarks,
    })
    expect(unknownRecipe).toBe('not-found')

    const recipe = await RecipeCommand.create(userId, newInput())
    if (typeof recipe === 'string') throw new Error('expected a recipe')
    const unknownVersion = await RecipeCommand.recordAttempt(userId, {
      recipeId: recipe.id,
      versionNumber: 9 as VersionNumber,
      rating: 4 as Rating,
      remarks: '' as Remarks,
    })
    expect(unknownVersion).toBe('not-found')
  })
})

describe('RecipeCommand.updateTips', () => {
  const tips = (...t: string[]) => t.map((x) => x as Tip)

  test('replaces the tips in place — no new version, everything else untouched', async () => {
    const recipe = await RecipeCommand.create(userId, newInput())
    if (typeof recipe === 'string') throw new Error('expected a recipe')
    const batchesBefore = fake.batches.length

    const result = await RecipeCommand.updateTips(
      userId,
      recipe.id,
      1 as VersionNumber,
      tips('Servir avec du riz', 'Se congèle bien'),
    )
    if (typeof result === 'string') throw new Error(`expected a version, got ${result}`)

    expect(result.tips).toEqual(tips('Servir avec du riz', 'Se congèle bien'))
    const stored = fake.snapshot('recipe-versions').get(`${recipe.id}_1`)
    expect(stored?.tips).toEqual(tips('Servir avec du riz', 'Se congèle bien'))
    // Refining the advice never creates a version, and the content rides along.
    expect(fake.snapshot('recipes').get(recipe.id)?.lastVersionNumber).toBe(1 as VersionNumber)
    expect(stored?.content).toEqual(dishContent())
    // Tips + recipe bump land in a single batch (all-or-nothing).
    expect(fake.directWrites).toEqual([])
    expect(fake.batches.length).toBe(batchesBefore + 1)
  })

  test('full-replacement: [] clears the section, the outcome stays', async () => {
    const recipe = await RecipeCommand.create(userId, newInput())
    if (typeof recipe === 'string') throw new Error('expected a recipe')
    await RecipeCommand.recordAttempt(userId, {
      recipeId: recipe.id,
      versionNumber: 1 as VersionNumber,
      rating: 4 as Rating,
    })
    await RecipeCommand.updateTips(userId, recipe.id, 1 as VersionNumber, tips('Servir chaud'))

    const cleared = await RecipeCommand.updateTips(userId, recipe.id, 1 as VersionNumber, [])
    if (typeof cleared === 'string') throw new Error(`expected a version, got ${cleared}`)

    expect(cleared.tips).toEqual([])
    const stored = fake.snapshot('recipe-versions').get(`${recipe.id}_1`)
    expect(stored?.tips).toEqual([])
    expect(stored?.rating).toBe(4 as Rating)
  })

  test('returns not-found for an unknown recipe or version', async () => {
    expect(await RecipeCommand.updateTips(userId, 'nope' as RecipeId, 1 as VersionNumber, [])).toBe(
      'not-found',
    )

    const recipe = await RecipeCommand.create(userId, newInput())
    if (typeof recipe === 'string') throw new Error('expected a recipe')
    expect(await RecipeCommand.updateTips(userId, recipe.id, 9 as VersionNumber, [])).toBe(
      'not-found',
    )
  })
})

describe('RecipeCommand.updateWarnings', () => {
  const warnings = (...w: string[]) => w.map((x) => x as Warning)

  test('replaces the warnings in place — no version touched, updatedAt bumped', async () => {
    const recipe = await RecipeCommand.create(userId, newInput())
    if (typeof recipe === 'string') throw new Error('expected a recipe')

    const result = await RecipeCommand.updateWarnings(
      userId,
      recipe.id,
      warnings('Mettre le fouet dès le début'),
    )
    if (typeof result === 'string') throw new Error(`expected a recipe, got ${result}`)

    expect(result.warnings).toEqual(warnings('Mettre le fouet dès le début'))
    expect(result.updatedAt.getTime()).toBeGreaterThanOrEqual(recipe.updatedAt.getTime())
    const stored = fake.snapshot('recipes').get(recipe.id)
    expect(stored?.warnings).toEqual(warnings('Mettre le fouet dès le début'))
    // Pinning a caution never touches the lineage.
    expect(stored?.lastVersionNumber).toBe(1 as VersionNumber)
    expect(fake.snapshot('recipe-versions').get(`${recipe.id}_1`)?.tips).toEqual([])
  })

  test('full-replacement: [] clears the banner', async () => {
    const recipe = await RecipeCommand.create(userId, newInput())
    if (typeof recipe === 'string') throw new Error('expected a recipe')
    await RecipeCommand.updateWarnings(userId, recipe.id, warnings('Sortir le beurre 1 h avant'))

    const cleared = await RecipeCommand.updateWarnings(userId, recipe.id, [])
    if (typeof cleared === 'string') throw new Error(`expected a recipe, got ${cleared}`)

    expect(cleared.warnings).toEqual([])
    expect(fake.snapshot('recipes').get(recipe.id)?.warnings).toEqual([])
  })

  test('returns not-found for an unknown recipe or another cook’s recipe', async () => {
    expect(await RecipeCommand.updateWarnings(userId, 'nope' as RecipeId, [])).toBe('not-found')

    const recipe = await RecipeCommand.create(userId, newInput())
    if (typeof recipe === 'string') throw new Error('expected a recipe')
    expect(await RecipeCommand.updateWarnings('user-2' as UserId, recipe.id, [])).toBe('not-found')
  })
})

describe('updateCoffeeParameters', () => {
  const V1 = 1 as VersionNumber
  const coffeeInput = (content: CoffeeContent = coffeeContent()) => ({
    type: 'coffee' as const,
    category: 'drink' as const,
    method: 'espresso' as const,
    title: 'Espresso du matin' as RecipeTitle,
    content,
    tips: [],
  })

  test('corrects the version in place and teaches the vocabulary, in one batch', async () => {
    const recipe = await RecipeCommand.create(userId, coffeeInput())
    if (typeof recipe === 'string') throw new Error('expected a recipe')

    const updated = await RecipeCommand.updateCoffeeParameters(userId, recipe.id, V1, {
      ...emptyCoffeeParameters,
      beans: { name: 'Belleville — Sidamo' as CoffeeBeanName },
      gear: { grinder: 'Niche Zero' as CoffeeGrinder },
    })
    if (typeof updated === 'string') throw new Error(`expected a version, got ${updated}`)

    expect(updated.content).toMatchObject({ beans: { name: 'Belleville — Sidamo' } })
    expect(fake.snapshot('recipe-versions').get(`${recipe.id}_1`)?.content).toEqual(updated.content)
    // The value typed now leads; the one the recipe was created with stays behind it.
    const vocabulary = await repository.findVocabulary(userId)
    expect(vocabulary.beanNames).toEqual([
      'Belleville — Sidamo' as CoffeeBeanName,
      'Belleville — Guji' as CoffeeBeanName,
    ])
    expect(vocabulary.grinders).toEqual(['Niche Zero' as CoffeeGrinder])
  })

  test('writes the version, the recipe and the vocabulary all-or-nothing', async () => {
    const recipe = await RecipeCommand.create(userId, coffeeInput())
    if (typeof recipe === 'string') throw new Error('expected a recipe')
    const batchesBefore = fake.batches.length

    await RecipeCommand.updateCoffeeParameters(userId, recipe.id, V1, emptyCoffeeParameters)

    expect(fake.batches.length).toBe(batchesBefore + 1)
    expect(fake.directWrites).toEqual([])
  })

  test('leaves the steps untouched — correcting a parameter is not iterating', async () => {
    const withSteps: CoffeeContent = {
      ...coffeeContent(),
      steps: [{ text: 'Infuser 4 min' as StepText, settings: {} }],
    }
    const recipe = await RecipeCommand.create(userId, coffeeInput(withSteps))
    if (typeof recipe === 'string') throw new Error('expected a recipe')

    const updated = await RecipeCommand.updateCoffeeParameters(userId, recipe.id, V1, {
      ...emptyCoffeeParameters,
      water: { kind: 'Volvic' as CoffeeWaterKind },
    })
    if (typeof updated === 'string') throw new Error(`expected a version, got ${updated}`)

    expect(updated.content.kind === 'coffee' && updated.content.steps).toEqual([
      { text: 'Infuser 4 min' as StepText, settings: {} },
    ])
  })

  test('refuses a version that is not a coffee', async () => {
    const recipe = await RecipeCommand.create(userId, newInput())
    if (typeof recipe === 'string') throw new Error('expected a recipe')

    expect(
      await RecipeCommand.updateCoffeeParameters(userId, recipe.id, V1, emptyCoffeeParameters),
    ).toBe('not-a-coffee')
  })

  test('returns not-found for an unknown recipe or another cook\u2019s recipe', async () => {
    expect(
      await RecipeCommand.updateCoffeeParameters(
        userId,
        'nope' as RecipeId,
        V1,
        emptyCoffeeParameters,
      ),
    ).toBe('not-found')

    const recipe = await RecipeCommand.create(userId, coffeeInput())
    if (typeof recipe === 'string') throw new Error('expected a recipe')
    expect(
      await RecipeCommand.updateCoffeeParameters(
        'user-2' as UserId,
        recipe.id,
        V1,
        emptyCoffeeParameters,
      ),
    ).toBe('not-found')
  })

  test('teaches the vocabulary when a coffee recipe is created too', async () => {
    await RecipeCommand.create(userId, coffeeInput())

    const vocabulary = await repository.findVocabulary(userId)
    expect(vocabulary.machines).toEqual(['Rancilio Silvia' as CoffeeMachine])
  })
})

describe('a version’s updatedAt', () => {
  const V1 = 1 as VersionNumber
  // Frozen clock: the bump is asserted on the exact instant of the edit, not on a
  // millisecond the machine may or may not have crossed.
  const at = (iso: string) => setSystemTime(new Date(iso))
  afterEach(() => setSystemTime())

  test('an untouched version was last modified when it was created', async () => {
    at('2026-03-11T08:00:00.000Z')
    const recipe = await RecipeCommand.create(userId, newInput())
    if (typeof recipe === 'string') throw new Error('expected a recipe')

    const v1 = fake.snapshot('recipe-versions').get(`${recipe.id}_1`)
    expect(v1?.updatedAt).toEqual(v1?.createdAt)
    expect(v1?.updatedAt).toEqual(new Date('2026-03-11T08:00:00.000Z'))
  })

  test('recording the attempt, the tips or the parameters moves it', async () => {
    at('2026-03-11T08:00:00.000Z')
    const recipe = await RecipeCommand.create(userId, {
      type: 'coffee' as const,
      category: 'drink' as const,
      method: 'espresso' as const,
      title: 'Espresso du matin' as RecipeTitle,
      content: coffeeContent(),
      tips: [],
    })
    if (typeof recipe === 'string') throw new Error('expected a recipe')

    at('2026-03-12T09:00:00.000Z')
    const executed = await RecipeCommand.recordAttempt(userId, {
      recipeId: recipe.id,
      versionNumber: V1,
      rating: 4 as Rating,
    })
    if (typeof executed === 'string') throw new Error(`expected a version, got ${executed}`)
    expect(executed.updatedAt).toEqual(new Date('2026-03-12T09:00:00.000Z'))

    at('2026-03-13T10:00:00.000Z')
    const retipped = await RecipeCommand.updateTips(userId, recipe.id, V1, [
      'Servir tout de suite' as Tip,
    ])
    if (typeof retipped === 'string') throw new Error(`expected a version, got ${retipped}`)
    expect(retipped.updatedAt).toEqual(new Date('2026-03-13T10:00:00.000Z'))

    at('2026-03-14T11:00:00.000Z')
    const corrected = await RecipeCommand.updateCoffeeParameters(userId, recipe.id, V1, {
      ...emptyCoffeeParameters,
      water: { kind: 'Volvic' as CoffeeWaterKind },
    })
    if (typeof corrected === 'string') throw new Error(`expected a version, got ${corrected}`)
    expect(corrected.updatedAt).toEqual(new Date('2026-03-14T11:00:00.000Z'))
    // The creation date never moves — only the edit date does.
    expect(corrected.createdAt).toEqual(new Date('2026-03-11T08:00:00.000Z'))
  })

  test('bookkeeping leaves it alone: the base a new version iterates on', async () => {
    at('2026-03-11T08:00:00.000Z')
    const recipe = await RecipeCommand.create(userId, newInput())
    if (typeof recipe === 'string') throw new Error('expected a recipe')
    // v2 is asked for by an improvement, so v1 is the version waiting to be cooked.
    at('2026-03-12T09:00:00.000Z')
    await RecipeCommand.addVersion(userId, recipe.id, {
      change: 'Moins de bouillon',
      basedOn: V1,
      content: dishContent(),
      tips: [],
    })

    // Cooking v2 clears v1’s `toTest` flag — a flag the cook never wrote on v1.
    at('2026-03-13T10:00:00.000Z')
    await RecipeCommand.addVersion(userId, recipe.id, {
      change: 'Encore moins',
      basedOn: V1,
      content: dishContent(),
      tips: [],
      attempt: { rating: 4 as Rating, remarks: 'Trop liquide' as Remarks },
    })

    const v1 = fake.snapshot('recipe-versions').get(`${recipe.id}_1`)
    expect(v1?.toTest).toBeUndefined()
    expect(v1?.updatedAt).toEqual(new Date('2026-03-11T08:00:00.000Z'))
  })
})
