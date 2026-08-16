import { afterEach, beforeEach, describe, expect, mock, setSystemTime, test } from 'bun:test'
import { type CoffeeContent, emptyCoffeeParameters } from '~/domain/recipe/content/coffee'
import type { DishContent } from '~/domain/recipe/content/dish'
import type { LooseThermomixSettings, ThermomixContent } from '~/domain/recipe/content/thermomix'
import { COMPONENT_LIMITS } from '~/domain/recipe/limits'
import type {
  CoffeeBeanName,
  CoffeeDose,
  CoffeeGrinder,
  CoffeeMachine,
  CoffeeWater,
  CoffeeWaterKind,
  ComponentScale,
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

describe('RecipeCommand.copyVersion', () => {
  test('copies the version into a recipe of its own — content, tips and verdict included', async () => {
    const source = await RecipeCommand.create(userId, {
      ...newInput(),
      tips: ['Servir avec du riz' as Tip],
    })
    if (typeof source === 'string') throw new Error('expected a recipe')
    await RecipeCommand.updateWarnings(userId, source.id, 1 as VersionNumber, [
      'Fouet dès le début' as Warning,
    ])
    await RecipeCommand.recordAttempt(userId, {
      recipeId: source.id,
      versionNumber: 1 as VersionNumber,
      rating: 4 as Rating,
      remarks: 'Trop salé' as Remarks,
    })

    // What the setup wrote (the cautions land as a direct save) is not what this
    // test is about: only the writes the copy itself adds are counted.
    const batches = fake.batches.length
    const directWrites = fake.directWrites.length

    const copy = await RecipeCommand.copyVersion(userId, {
      recipeId: source.id,
      number: 1 as VersionNumber,
      title: 'Blanquette au citron' as RecipeTitle,
    })
    if (typeof copy === 'string') throw new Error(`expected a recipe, got ${copy}`)

    expect(copy.id).not.toBe(source.id)
    expect(copy.title).toBe('Blanquette au citron' as RecipeTitle)
    // The identity of the recipe copied, cautions included.
    expect(copy.type).toBe('dish')
    expect(copy.category).toBe('main')
    expect(copy.lastVersionNumber).toBe(1 as VersionNumber)

    const v1 = fake.snapshot('recipe-versions').get(`${copy.id}_1`)
    expect(v1?.content).toEqual(dishContent())
    expect(v1?.tips).toEqual(['Servir avec du riz' as Tip])
    // The cautions travel with the plate, under the copy's own name.
    expect(v1?.warnings).toEqual(['Fouet dès le début' as Warning])
    // Where it came from survives as a label and nothing else.
    expect(v1?.origin).toEqual({ kind: 'import', detail: 'Blanquette v1' })
    // The verdict travels with the plate…
    expect(v1?.rating).toBe(4 as Rating)
    expect(v1?.remarks).toBe('Trop salé' as Remarks)
    expect(v1?.executedAt).toBeInstanceOf(Date)
    // …but not the lineage: a copy is a v1, it iterates on nothing.
    expect(v1).not.toHaveProperty('change')
    expect(v1).not.toHaveProperty('basedOn')
    expect(v1).not.toHaveProperty('toTest')
    // Both docs land in a single batch (all-or-nothing).
    expect(fake.directWrites.length).toBe(directWrites)
    expect(fake.batches.length).toBe(batches + 1)
  })

  test('leaves the recipe copied exactly as it was', async () => {
    const source = await RecipeCommand.create(userId, newInput())
    if (typeof source === 'string') throw new Error('expected a recipe')
    const before = fake.snapshot('recipes').get(source.id as string)
    const versionBefore = fake.snapshot('recipe-versions').get(`${source.id}_1`)

    await RecipeCommand.copyVersion(userId, {
      recipeId: source.id,
      number: 1 as VersionNumber,
      title: 'Blanquette au citron' as RecipeTitle,
    })

    // Copying a version is not working on it: not one field of the source moves,
    // its date least of all.
    expect(fake.snapshot('recipes').get(source.id as string)).toEqual(before)
    expect(fake.snapshot('recipe-versions').get(`${source.id}_1`)).toEqual(versionBefore)
  })

  test('keeps the brew method of a coffee, rank included', async () => {
    const source = await RecipeCommand.create(userId, {
      type: 'coffee',
      category: 'drink' as const,
      method: 'v60' as const,
      title: 'V60 Éthiopie' as RecipeTitle,
      content: coffeeContent(),
      tips: [],
    })
    if (typeof source === 'string') throw new Error('expected a recipe')

    const copy = await RecipeCommand.copyVersion(userId, {
      recipeId: source.id,
      number: 1 as VersionNumber,
      title: 'V60 Éthiopie — mouture fine' as RecipeTitle,
    })
    if (typeof copy === 'string') throw new Error(`expected a recipe, got ${copy}`)

    expect(copy.method).toBe('v60')
    expect(fake.snapshot('recipes').get(copy.id as string)?.methodRank).toBe(6)
    expect(fake.snapshot('recipe-versions').get(`${copy.id}_1`)?.content).toEqual(coffeeContent())
  })

  test('copies a version never cooked as one never cooked, owing no try', async () => {
    const source = await RecipeCommand.create(userId, newInput())
    if (typeof source === 'string') throw new Error('expected a recipe')
    // An improvement's version: it owes a try on the recipe it was asked for…
    await RecipeCommand.addVersion(userId, source.id, {
      change: 'Moins de sel',
      basedOn: 1 as VersionNumber,
      content: dishContent(),
      tips: [],
    })

    const copy = await RecipeCommand.copyVersion(userId, {
      recipeId: source.id,
      number: 2 as VersionNumber,
      title: 'Blanquette peu salée' as RecipeTitle,
    })
    if (typeof copy === 'string') throw new Error(`expected a recipe, got ${copy}`)

    const v1 = fake.snapshot('recipe-versions').get(`${copy.id}_1`)
    expect(v1).not.toHaveProperty('rating')
    expect(v1).not.toHaveProperty('executedAt')
    // …but nobody asked for the copy: it is a v1 like any other, not a version
    // the kitchen owes a cook.
    expect(v1).not.toHaveProperty('toTest')
    expect(v1?.origin).toEqual({ kind: 'import', detail: 'Blanquette v2' })
  })

  test('answers not-found for another cook’s recipe and for a version that does not exist', async () => {
    const source = await RecipeCommand.create(userId, newInput())
    if (typeof source === 'string') throw new Error('expected a recipe')
    const writes = fake.batches.length

    const stranger = await RecipeCommand.copyVersion('user-2' as UserId, {
      recipeId: source.id,
      number: 1 as VersionNumber,
      title: 'Volée' as RecipeTitle,
    })
    const missing = await RecipeCommand.copyVersion(userId, {
      recipeId: source.id,
      number: 7 as VersionNumber,
      title: 'Fantôme' as RecipeTitle,
    })

    expect(stranger).toBe('not-found')
    expect(missing).toBe('not-found')
    expect(fake.batches.length).toBe(writes)
    expect(fake.directWrites).toEqual([])
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

  test('needs no carrying for the linked recipes — they are held by the recipe', async () => {
    const parent = await RecipeCommand.create(
      userId,
      newInput(dishContent({ ingredients: [ingredient('Pâte à ravioles', '400 g')] })),
    )
    const linked = await RecipeCommand.create(userId, newInput())
    if (typeof parent === 'string' || typeof linked === 'string')
      throw new Error('expected recipes')
    await RecipeCommand.linkComponent(userId, parent.id, linked.id, 1 as ComponentScale)

    // What the model answers: the whole list regenerated, and it knows nothing of the
    // link — which costs nothing, since the link is not in the list.
    await RecipeCommand.addVersion(userId, parent.id, {
      change: 'Pâte 400 → 450 g',
      basedOn: 1 as VersionNumber,
      content: dishContent({ ingredients: [ingredient('Pâte à ravioles', '450 g')] }),
      tips: [],
    })

    expect(fake.snapshot('recipes').get(parent.id)?.components).toEqual([
      { recipe: linked.id, scale: 1 as ComponentScale },
    ])
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

  test('an attempt-born version is one to test too, and the one it answers is cooked', async () => {
    const recipe = await RecipeCommand.create(userId, newInput())
    if (typeof recipe === 'string') throw new Error('expected a recipe')
    // v2 comes from an improvement: it is waiting to be cooked.
    await RecipeCommand.addVersion(userId, recipe.id, {
      change: 'Version végétarienne',
      basedOn: 1 as VersionNumber,
      content: { kind: 'dish', ingredients: [], steps: steps('Saisir') },
      tips: [],
    })

    // Cooking it with remarks answers it with v3: v2 has been made, so it owes
    // nothing anymore — and v3, which has not, takes its place on the list.
    await RecipeCommand.addVersion(userId, recipe.id, {
      change: 'Moins de sel',
      basedOn: 2 as VersionNumber,
      content: { kind: 'dish', ingredients: [], steps: steps('Saisir') },
      tips: [],
      attempt: { rating: 3 as Rating, remarks: 'Trop salé' as Remarks },
    })

    expect(fake.snapshot('recipe-versions').get(`${recipe.id}_2`)).not.toHaveProperty('toTest')
    expect(fake.snapshot('recipe-versions').get(`${recipe.id}_3`)?.toTest).toBe(true)
  })

  test('records the cook that asked for v2 on v1, the version it was made from', async () => {
    const recipe = await RecipeCommand.create(userId, newInput())
    if (typeof recipe === 'string') throw new Error('expected a recipe')

    await RecipeCommand.addVersion(userId, recipe.id, {
      change: 'Bouillon 700 → 650 ml',
      basedOn: 1 as VersionNumber,
      content: { kind: 'dish', ingredients: [], steps: steps('Saisir') },
      tips: [],
      attempt: { rating: 3 as Rating, remarks: 'Trop liquide' as Remarks },
    })

    // The cook that asked for v2 is the outcome of v1 — the plate that was made.
    const v1 = fake.snapshot('recipe-versions').get(`${recipe.id}_1`)
    expect(v1?.rating).toBe(3 as Rating)
    expect(v1?.remarks).toBe('Trop liquide' as Remarks)
    expect(v1?.executedAt).toBeInstanceOf(Date)
    // v2 has never been made: no outcome at all, and it waits on the to-cook list.
    const v2 = fake.snapshot('recipe-versions').get(`${recipe.id}_2`)
    expect(v2).not.toHaveProperty('executedAt')
    expect(v2).not.toHaveProperty('rating')
    expect(v2).not.toHaveProperty('remarks')
    expect(v2?.toTest).toBe(true)
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
  test('renames the recipe without touching the heart its version wears', async () => {
    const recipe = await RecipeCommand.create(userId, newInput())
    if (typeof recipe === 'string') throw new Error('expected a recipe')
    await RecipeCommand.updateFavorite(userId, recipe.id, 1 as VersionNumber, true)

    await RecipeCommand.update(userId, recipe.id, { title: 'Blanquette de veau' as RecipeTitle })

    const renamed = fake.snapshot('recipes').get(recipe.id)
    expect(renamed?.title).toBe('Blanquette de veau' as RecipeTitle)
    expect(renamed?.favorite).toBe(true)
    expect(fake.snapshot('recipe-versions').get(`${recipe.id}_1`)?.favorite).toBe(true)
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
    expect(
      await RecipeCommand.update(userId, 'nope' as RecipeId, {
        title: 'Blanquette' as RecipeTitle,
      }),
    ).toBe('not-found')
  })
})

describe('RecipeCommand.updateFavorite', () => {
  const V1 = 1 as VersionNumber
  const V2 = 2 as VersionNumber

  const twoVersionRecipe = async () => {
    const recipe = await RecipeCommand.create(userId, newInput())
    if (typeof recipe === 'string') throw new Error('expected a recipe')
    await RecipeCommand.addVersion(userId, recipe.id, {
      change: 'Moins de sel',
      basedOn: V1,
      content: dishContent(),
      tips: [],
      attempt: { rating: 5 as Rating },
    })
    return recipe
  }

  test('hearts the version, and mirrors it onto the recipe', async () => {
    const recipe = await RecipeCommand.create(userId, newInput())
    if (typeof recipe === 'string') throw new Error('expected a recipe')
    // Freshly created: neither the version nor its mirror carries the field.
    expect(fake.snapshot('recipes').get(recipe.id)).not.toHaveProperty('favorite')

    const hearted = await RecipeCommand.updateFavorite(userId, recipe.id, V1, true)
    if (typeof hearted === 'string') throw new Error(`expected a version, got ${hearted}`)

    expect(hearted.favorite).toBe(true)
    expect(fake.snapshot('recipe-versions').get(`${recipe.id}_1`)?.favorite).toBe(true)
    expect(fake.snapshot('recipes').get(recipe.id)?.favorite).toBe(true)
  })

  test('un-hearting drops the field on both, absence being the un-hearted state', async () => {
    const recipe = await RecipeCommand.create(userId, newInput())
    if (typeof recipe === 'string') throw new Error('expected a recipe')
    await RecipeCommand.updateFavorite(userId, recipe.id, V1, true)

    await RecipeCommand.updateFavorite(userId, recipe.id, V1, false)

    expect(fake.snapshot('recipe-versions').get(`${recipe.id}_1`)).not.toHaveProperty('favorite')
    expect(fake.snapshot('recipes').get(recipe.id)).not.toHaveProperty('favorite')
  })

  test('a heart on a version that is not the one opened still lists the recipe', async () => {
    const recipe = await twoVersionRecipe()

    // v2 is the rated one, so it is what the recipe opens on — the heart goes on v1.
    await RecipeCommand.updateFavorite(userId, recipe.id, V1, true)

    expect(fake.snapshot('recipes').get(recipe.id)?.favorite).toBe(true)
  })

  test('the mirror holds while any version keeps its heart', async () => {
    const recipe = await twoVersionRecipe()
    await RecipeCommand.updateFavorite(userId, recipe.id, V1, true)
    await RecipeCommand.updateFavorite(userId, recipe.id, V2, true)

    await RecipeCommand.updateFavorite(userId, recipe.id, V2, false)

    expect(fake.snapshot('recipes').get(recipe.id)?.favorite).toBe(true)
  })

  test('the next iteration carries the heart over', async () => {
    const recipe = await RecipeCommand.create(userId, newInput())
    if (typeof recipe === 'string') throw new Error('expected a recipe')
    await RecipeCommand.updateFavorite(userId, recipe.id, V1, true)

    await RecipeCommand.addVersion(userId, recipe.id, {
      change: 'Moins de sel',
      basedOn: V1,
      content: dishContent(),
      tips: [],
    })

    expect(fake.snapshot('recipe-versions').get(`${recipe.id}_2`)?.favorite).toBe(true)
  })

  test('deleting the only hearted version takes the recipe out of the lens', async () => {
    const recipe = await twoVersionRecipe()
    await RecipeCommand.updateFavorite(userId, recipe.id, V2, true)

    await RecipeCommand.removeVersion(userId, recipe.id, V2)

    expect(fake.snapshot('recipes').get(recipe.id)).not.toHaveProperty('favorite')
  })

  test('returns not-found for an unknown recipe, version, or another cook’s recipe', async () => {
    expect(await RecipeCommand.updateFavorite(userId, 'nope' as RecipeId, V1, true)).toBe(
      'not-found',
    )

    const recipe = await RecipeCommand.create(userId, newInput())
    if (typeof recipe === 'string') throw new Error('expected a recipe')
    expect(await RecipeCommand.updateFavorite(userId, recipe.id, 9 as VersionNumber, true)).toBe(
      'not-found',
    )
    expect(await RecipeCommand.updateFavorite('user-2' as UserId, recipe.id, V1, true)).toBe(
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

describe('RecipeCommand.updateRating', () => {
  test('corrects the verdict, leaving the rest of the attempt alone', async () => {
    const recipe = await RecipeCommand.create(userId, newInput())
    if (typeof recipe === 'string') throw new Error('expected a recipe')
    await RecipeCommand.recordAttempt(userId, {
      recipeId: recipe.id,
      versionNumber: 1 as VersionNumber,
      rating: 2 as Rating,
      remarks: 'Trop cuit' as Remarks,
      photoPath: 'photos/first-try.jpg',
    })
    const executedAt = fake.snapshot('recipe-versions').get(`${recipe.id}_1`)?.executedAt as Date
    const batchesBefore = fake.batches.length

    const result = await RecipeCommand.updateRating(
      userId,
      recipe.id,
      1 as VersionNumber,
      4 as Rating,
    )
    if (typeof result === 'string') throw new Error(`expected a version, got ${result}`)

    expect(result.rating).toBe(4 as Rating)
    // Correcting the note is not re-cooking: what the attempt left behind stays.
    expect(result.remarks).toBe('Trop cuit' as Remarks)
    expect(result.photoPath).toBe('photos/first-try.jpg')
    expect(result.executedAt).toEqual(executedAt)

    const stored = fake.snapshot('recipe-versions').get(`${recipe.id}_1`)
    expect(stored?.rating).toBe(4 as Rating)
    expect(stored?.photoPath).toBe('photos/first-try.jpg')
    // No version created, and version + recipe bump land in one batch.
    expect(fake.snapshot('recipes').get(recipe.id)?.lastVersionNumber).toBe(1 as VersionNumber)
    expect(fake.directWrites).toEqual([])
    expect(fake.batches.length).toBe(batchesBefore + 1)
  })

  test('rating a version never cooked marks it cooked and off the to-cook list', async () => {
    const recipe = await RecipeCommand.create(userId, newInput())
    if (typeof recipe === 'string') throw new Error('expected a recipe')
    await RecipeCommand.addVersion(userId, recipe.id, {
      change: 'Version végétarienne',
      basedOn: 1 as VersionNumber,
      content: { kind: 'dish', ingredients: [], steps: steps('Saisir') },
      tips: [],
    })
    expect(fake.snapshot('recipe-versions').get(`${recipe.id}_2`)?.toTest).toBe(true)

    const result = await RecipeCommand.updateRating(
      userId,
      recipe.id,
      2 as VersionNumber,
      5 as Rating,
    )
    if (typeof result === 'string') throw new Error(`expected a version, got ${result}`)

    expect(result.rating).toBe(5 as Rating)
    expect(result.executedAt).toBeInstanceOf(Date)
    expect(result).not.toHaveProperty('toTest')
    expect(fake.snapshot('recipe-versions').get(`${recipe.id}_2`)).not.toHaveProperty('toTest')
  })

  test('returns not-found for an unknown recipe or version', async () => {
    expect(
      await RecipeCommand.updateRating(userId, 'nope' as RecipeId, 1 as VersionNumber, 3 as Rating),
    ).toBe('not-found')

    const recipe = await RecipeCommand.create(userId, newInput())
    if (typeof recipe === 'string') throw new Error('expected a recipe')
    expect(
      await RecipeCommand.updateRating(userId, recipe.id, 9 as VersionNumber, 3 as Rating),
    ).toBe('not-found')
  })
})

describe('RecipeCommand.updateWarnings', () => {
  const V1 = 1 as VersionNumber
  const warnings = (...w: string[]) => w.map((x) => x as Warning)

  test('replaces the version’s warnings in place — no version created', async () => {
    const recipe = await RecipeCommand.create(userId, newInput())
    if (typeof recipe === 'string') throw new Error('expected a recipe')

    const result = await RecipeCommand.updateWarnings(
      userId,
      recipe.id,
      V1,
      warnings('Mettre le fouet dès le début'),
    )
    if (typeof result === 'string') throw new Error(`expected a version, got ${result}`)

    expect(result.warnings).toEqual(warnings('Mettre le fouet dès le début'))
    expect(fake.snapshot('recipe-versions').get(`${recipe.id}_1`)?.warnings).toEqual(
      warnings('Mettre le fouet dès le début'),
    )
    // Pinning a caution never touches the lineage, the content or the outcome.
    const stored = fake.snapshot('recipes').get(recipe.id)
    expect(stored?.lastVersionNumber).toBe(V1)
    expect(fake.snapshot('recipe-versions').get(`${recipe.id}_1`)?.tips).toEqual([])
  })

  test('full-replacement: [] clears the banner', async () => {
    const recipe = await RecipeCommand.create(userId, newInput())
    if (typeof recipe === 'string') throw new Error('expected a recipe')
    await RecipeCommand.updateWarnings(
      userId,
      recipe.id,
      V1,
      warnings('Sortir le beurre 1 h avant'),
    )

    const cleared = await RecipeCommand.updateWarnings(userId, recipe.id, V1, [])
    if (typeof cleared === 'string') throw new Error(`expected a version, got ${cleared}`)

    expect(cleared.warnings).toEqual([])
    expect(fake.snapshot('recipe-versions').get(`${recipe.id}_1`)?.warnings).toEqual([])
  })

  test('the next iteration carries the warnings over', async () => {
    const recipe = await RecipeCommand.create(userId, newInput())
    if (typeof recipe === 'string') throw new Error('expected a recipe')
    await RecipeCommand.updateWarnings(userId, recipe.id, V1, warnings('Fouet dès le début'))

    await RecipeCommand.addVersion(userId, recipe.id, {
      change: 'Moins de sel',
      basedOn: V1,
      content: dishContent(),
      tips: [],
    })

    // The cook wrote the caution about a gesture, not about the seasoning that
    // changed: saying yes to a proposal must not drop it.
    expect(fake.snapshot('recipe-versions').get(`${recipe.id}_2`)?.warnings).toEqual(
      warnings('Fouet dès le début'),
    )
  })

  test('returns not-found for an unknown recipe, version, or another cook’s recipe', async () => {
    expect(await RecipeCommand.updateWarnings(userId, 'nope' as RecipeId, V1, [])).toBe('not-found')

    const recipe = await RecipeCommand.create(userId, newInput())
    if (typeof recipe === 'string') throw new Error('expected a recipe')
    expect(await RecipeCommand.updateWarnings(userId, recipe.id, 9 as VersionNumber, [])).toBe(
      'not-found',
    )
    expect(await RecipeCommand.updateWarnings('user-2' as UserId, recipe.id, V1, [])).toBe(
      'not-found',
    )
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

describe('linkComponent / unlinkComponent', () => {
  const scale = (n: number) => n as ComponentScale
  // What Firestore actually holds for the parent — the assertions are about the
  // stored links, not only the returned ones.
  const storedComponents = (recipeId: RecipeId) =>
    (fake.snapshot('recipes').get(recipeId as string) as Recipe | undefined)?.components ?? []
  const bread = () =>
    RecipeCommand.create(
      userId,
      newInput(
        dishContent({
          ingredients: [ingredient('Farine', '500 g'), ingredient('Sel', '10 g')],
        }),
      ),
    )
  const poolish = () =>
    RecipeCommand.create(userId, {
      type: 'dish' as const,
      category: 'main' as const,
      title: 'Poolish' as RecipeTitle,
      content: dishContent({ ingredients: [ingredient('Farine', '500 g')] }),
      tips: [],
    })

  test('links a recipe at the weight it is used here, in a single batch', async () => {
    const parent = await bread()
    const linked = await poolish()
    if (typeof parent === 'string' || typeof linked === 'string')
      throw new Error('expected recipes')
    const batchesBefore = fake.batches.length

    const updated = await RecipeCommand.linkComponent(userId, parent.id, linked.id, scale(0.2))
    if (typeof updated === 'string') throw new Error(`expected a recipe, got ${updated}`)

    expect(updated.components).toEqual([{ recipe: linked.id, scale: scale(0.2) }])
    // The flat ids ride along, or `usedBy` would answer nothing.
    expect(updated.componentIds).toEqual([linked.id])
    expect(storedComponents(parent.id)).toEqual([{ recipe: linked.id, scale: scale(0.2) }])
    expect(fake.batches.length).toBe(batchesBefore + 1)
    expect(fake.directWrites).toEqual([])
  })

  test('holds several recipes, in the order they were linked', async () => {
    const parent = await bread()
    const first = await poolish()
    const second = await poolish()
    if (typeof parent === 'string' || typeof first === 'string' || typeof second === 'string')
      throw new Error('expected recipes')

    await RecipeCommand.linkComponent(userId, parent.id, first.id, scale(0.2))
    await RecipeCommand.linkComponent(userId, parent.id, second.id, scale(1))

    expect(storedComponents(parent.id)).toEqual([
      { recipe: first.id, scale: scale(0.2) },
      { recipe: second.id, scale: scale(1) },
    ])
  })

  test('relinking one already linked rewrites its weight, in place', async () => {
    const parent = await bread()
    const first = await poolish()
    const second = await poolish()
    if (typeof parent === 'string' || typeof first === 'string' || typeof second === 'string')
      throw new Error('expected recipes')

    await RecipeCommand.linkComponent(userId, parent.id, first.id, scale(0.2))
    await RecipeCommand.linkComponent(userId, parent.id, second.id, scale(1))
    await RecipeCommand.linkComponent(userId, parent.id, first.id, scale(0.5))

    // One entry, not two — and it kept its place: the cook corrected a weight.
    expect(storedComponents(parent.id)).toEqual([
      { recipe: first.id, scale: scale(0.5) },
      { recipe: second.id, scale: scale(1) },
    ])
  })

  test('creates no version and leaves the recipe’s date alone', async () => {
    const parent = await bread()
    const linked = await poolish()
    if (typeof parent === 'string' || typeof linked === 'string')
      throw new Error('expected recipes')
    const versionsBefore = fake.snapshot('recipe-versions').size

    await RecipeCommand.linkComponent(userId, parent.id, linked.id, scale(0.2))

    // Saying what a recipe is made of is not cooking it.
    expect(fake.snapshot('recipe-versions').size).toBe(versionsBefore)
    expect(fake.snapshot('recipes').get(parent.id as string)?.updatedAt).toEqual(parent.updatedAt)
  })

  test('unlinks, and leaves neither field behind once the last link goes', async () => {
    const parent = await bread()
    const first = await poolish()
    const second = await poolish()
    if (typeof parent === 'string' || typeof first === 'string' || typeof second === 'string')
      throw new Error('expected recipes')
    await RecipeCommand.linkComponent(userId, parent.id, first.id, scale(0.2))
    await RecipeCommand.linkComponent(userId, parent.id, second.id, scale(1))

    await RecipeCommand.unlinkComponent(userId, parent.id, first.id)
    expect(storedComponents(parent.id)).toEqual([{ recipe: second.id, scale: scale(1) }])

    await RecipeCommand.unlinkComponent(userId, parent.id, second.id)
    const stored = fake.snapshot('recipes').get(parent.id as string)
    expect(stored).not.toHaveProperty('components')
    expect(stored).not.toHaveProperty('componentIds')
  })

  test('unlinking what was never linked changes nothing', async () => {
    const parent = await bread()
    const linked = await poolish()
    if (typeof parent === 'string' || typeof linked === 'string')
      throw new Error('expected recipes')

    const updated = await RecipeCommand.unlinkComponent(userId, parent.id, linked.id)
    if (typeof updated === 'string') throw new Error('expected a recipe')

    expect(updated).not.toHaveProperty('components')
  })

  test('refuses a recipe made of itself', async () => {
    const parent = await bread()
    if (typeof parent === 'string') throw new Error('expected a recipe')

    expect(await RecipeCommand.linkComponent(userId, parent.id, parent.id, scale(1))).toBe(
      'self-reference',
    )
  })

  test('refuses more links than a recipe may hold', async () => {
    const parent = await bread()
    if (typeof parent === 'string') throw new Error('expected a recipe')
    for (let i = 0; i < COMPONENT_LIMITS.perRecipe; i++) {
      const linked = await poolish()
      if (typeof linked === 'string') throw new Error('expected a recipe')
      await RecipeCommand.linkComponent(userId, parent.id, linked.id, scale(1))
    }
    const extra = await poolish()
    if (typeof extra === 'string') throw new Error('expected a recipe')

    expect(await RecipeCommand.linkComponent(userId, parent.id, extra.id, scale(1))).toBe(
      'too-many-components',
    )
    // A weight is still correctable at the cap: the list does not grow.
    const known = storedComponents(parent.id)[0]
    if (!known) throw new Error('expected a link')
    expect(
      typeof (await RecipeCommand.linkComponent(userId, parent.id, known.recipe, scale(0.5))),
    ).not.toBe('string')
  })

  test('answers not-found for an unknown recipe, or another cook’s', async () => {
    const parent = await bread()
    const linked = await poolish()
    if (typeof parent === 'string' || typeof linked === 'string')
      throw new Error('expected recipes')

    expect(await RecipeCommand.linkComponent(userId, 'nope' as RecipeId, linked.id, scale(1))).toBe(
      'not-found',
    )
    expect(
      await RecipeCommand.linkComponent('user-2' as UserId, parent.id, linked.id, scale(1)),
    ).toBe('not-found')
    expect(await RecipeCommand.unlinkComponent('user-2' as UserId, parent.id, linked.id)).toBe(
      'not-found',
    )
  })

  test('answers not-found when the linked recipe is another cook’s — never a code of its own', async () => {
    const parent = await bread()
    const stranger = await RecipeCommand.create('user-2' as UserId, newInput())
    if (typeof parent === 'string' || typeof stranger === 'string')
      throw new Error('expected recipes')

    // A code that said "it exists but is not yours" would tell them it exists.
    expect(await RecipeCommand.linkComponent(userId, parent.id, stranger.id, scale(1))).toBe(
      'not-found',
    )
    expect(storedComponents(parent.id)).toEqual([])
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

  test('recording the attempt, the rating, the tips or the parameters moves it', async () => {
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

    at('2026-03-12T18:00:00.000Z')
    const rerated = await RecipeCommand.updateRating(userId, recipe.id, V1, 5 as Rating)
    if (typeof rerated === 'string') throw new Error(`expected a version, got ${rerated}`)
    expect(rerated.updatedAt).toEqual(new Date('2026-03-12T18:00:00.000Z'))
    // The cook date is when the version was cooked, and a corrected note is not a cook.
    expect(rerated.executedAt).toEqual(new Date('2026-03-12T09:00:00.000Z'))

    at('2026-03-13T10:00:00.000Z')
    const retipped = await RecipeCommand.updateTips(userId, recipe.id, V1, [
      'Servir tout de suite' as Tip,
    ])
    if (typeof retipped === 'string') throw new Error(`expected a version, got ${retipped}`)
    expect(retipped.updatedAt).toEqual(new Date('2026-03-13T10:00:00.000Z'))

    at('2026-03-13T16:00:00.000Z')
    const warned = await RecipeCommand.updateWarnings(userId, recipe.id, V1, [
      'Sortir le beurre' as Warning,
    ])
    if (typeof warned === 'string') throw new Error(`expected a version, got ${warned}`)
    expect(warned.updatedAt).toEqual(new Date('2026-03-13T16:00:00.000Z'))

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

  test('the base an attempt-born version iterates on is dated by that cook', async () => {
    at('2026-03-11T08:00:00.000Z')
    const recipe = await RecipeCommand.create(userId, newInput())
    if (typeof recipe === 'string') throw new Error('expected a recipe')
    // v2 is asked for by an improvement, so v1 is left exactly as it was.
    at('2026-03-12T09:00:00.000Z')
    await RecipeCommand.addVersion(userId, recipe.id, {
      change: 'Moins de bouillon',
      basedOn: V1,
      content: dishContent(),
      tips: [],
    })
    expect(fake.snapshot('recipe-versions').get(`${recipe.id}_1`)?.updatedAt).toEqual(
      new Date('2026-03-11T08:00:00.000Z'),
    )

    // Iterating on v1 with a cook behind it writes that cook on v1: not bookkeeping
    // but the cook's own work on it, so it is dated by it, like any attempt.
    at('2026-03-13T10:00:00.000Z')
    await RecipeCommand.addVersion(userId, recipe.id, {
      change: 'Encore moins',
      basedOn: V1,
      content: dishContent(),
      tips: [],
      attempt: { rating: 4 as Rating, remarks: 'Trop liquide' as Remarks },
    })

    const v1 = fake.snapshot('recipe-versions').get(`${recipe.id}_1`)
    expect(v1?.rating).toBe(4 as Rating)
    expect(v1?.updatedAt).toEqual(new Date('2026-03-13T10:00:00.000Z'))
  })
})

describe('a recipe’s date — the version it opens on', () => {
  const V1 = 1 as VersionNumber
  const V2 = 2 as VersionNumber
  const at = (iso: string) => setSystemTime(new Date(iso))
  const storedDate = (recipeId: RecipeId) => fake.snapshot('recipes').get(recipeId)?.updatedAt
  afterEach(() => setSystemTime())

  test('a fresh recipe is dated by its v1', async () => {
    at('2026-03-11T08:00:00.000Z')
    const recipe = await RecipeCommand.create(userId, newInput())
    if (typeof recipe === 'string') throw new Error('expected a recipe')

    expect(recipe.updatedAt).toEqual(new Date('2026-03-11T08:00:00.000Z'))
  })

  test('cooking the reference version re-dates the recipe', async () => {
    at('2026-03-11T08:00:00.000Z')
    const recipe = await RecipeCommand.create(userId, newInput())
    if (typeof recipe === 'string') throw new Error('expected a recipe')

    at('2026-04-02T19:00:00.000Z')
    await RecipeCommand.recordAttempt(userId, {
      recipeId: recipe.id,
      versionNumber: V1,
      rating: 4 as Rating,
    })

    expect(storedDate(recipe.id)).toEqual(new Date('2026-04-02T19:00:00.000Z'))
  })

  test('a favourite and a rename never move it', async () => {
    at('2026-03-11T08:00:00.000Z')
    const recipe = await RecipeCommand.create(userId, newInput())
    if (typeof recipe === 'string') throw new Error('expected a recipe')

    at('2026-08-06T10:00:00.000Z')
    await RecipeCommand.updateFavorite(userId, recipe.id, V1, true)
    await RecipeCommand.update(userId, recipe.id, { title: 'Blanquette de mamie' as RecipeTitle })

    // Housekeeping, not cooking: the recipe stays filed under March, and the
    // version the heart landed on is not dated by it either.
    expect(storedDate(recipe.id)).toEqual(new Date('2026-03-11T08:00:00.000Z'))
    expect(fake.snapshot('recipes').get(recipe.id)?.favorite).toBe(true)
    expect(fake.snapshot('recipe-versions').get(`${recipe.id}_1`)?.updatedAt).toEqual(
      new Date('2026-03-11T08:00:00.000Z'),
    )
  })

  test('an attempt rated below the reference leaves the recipe where it was', async () => {
    at('2026-03-11T08:00:00.000Z')
    const recipe = await RecipeCommand.create(userId, newInput())
    if (typeof recipe === 'string') throw new Error('expected a recipe')
    // v1 becomes the reference, rated 5 in March.
    await RecipeCommand.recordAttempt(userId, {
      recipeId: recipe.id,
      versionNumber: V1,
      rating: 5 as Rating,
    })

    // A v2 asked for, then cooked in August but rated below: v1 still answers for
    // the recipe, so the recipe stays filed under March.
    at('2026-08-06T10:00:00.000Z')
    await RecipeCommand.addVersion(userId, recipe.id, {
      change: 'Moins de bouillon',
      basedOn: V1,
      content: dishContent(),
      tips: [],
    })
    await RecipeCommand.recordAttempt(userId, {
      recipeId: recipe.id,
      versionNumber: V2,
      rating: 3 as Rating,
    })

    expect(storedDate(recipe.id)).toEqual(new Date('2026-03-11T08:00:00.000Z'))
  })

  test('a better attempt hands the reference over, and the date with it', async () => {
    at('2026-03-11T08:00:00.000Z')
    const recipe = await RecipeCommand.create(userId, newInput())
    if (typeof recipe === 'string') throw new Error('expected a recipe')
    await RecipeCommand.recordAttempt(userId, {
      recipeId: recipe.id,
      versionNumber: V1,
      rating: 3 as Rating,
    })

    at('2026-08-06T10:00:00.000Z')
    await RecipeCommand.addVersion(userId, recipe.id, {
      change: 'Plus de bouillon',
      basedOn: V1,
      content: dishContent(),
      tips: [],
    })
    await RecipeCommand.recordAttempt(userId, {
      recipeId: recipe.id,
      versionNumber: V2,
      rating: 5 as Rating,
    })

    expect(storedDate(recipe.id)).toEqual(new Date('2026-08-06T10:00:00.000Z'))
  })

  test('correcting the note of the reference version re-dates the recipe', async () => {
    at('2026-03-11T08:00:00.000Z')
    const recipe = await RecipeCommand.create(userId, newInput())
    if (typeof recipe === 'string') throw new Error('expected a recipe')

    at('2026-08-06T10:00:00.000Z')
    await RecipeCommand.updateRating(userId, recipe.id, V1, 4 as Rating)

    expect(storedDate(recipe.id)).toEqual(new Date('2026-08-06T10:00:00.000Z'))
  })

  test('deleting the reference version hands the recipe to what remains', async () => {
    at('2026-03-11T08:00:00.000Z')
    const recipe = await RecipeCommand.create(userId, newInput())
    if (typeof recipe === 'string') throw new Error('expected a recipe')
    await RecipeCommand.recordAttempt(userId, {
      recipeId: recipe.id,
      versionNumber: V1,
      rating: 3 as Rating,
    })

    at('2026-08-06T10:00:00.000Z')
    await RecipeCommand.addVersion(userId, recipe.id, {
      change: 'Plus de bouillon',
      basedOn: V1,
      content: dishContent(),
      tips: [],
    })
    await RecipeCommand.recordAttempt(userId, {
      recipeId: recipe.id,
      versionNumber: V2,
      rating: 5 as Rating,
    })
    expect(storedDate(recipe.id)).toEqual(new Date('2026-08-06T10:00:00.000Z'))

    // The best-rated version goes: v1 answers for the recipe again.
    at('2026-09-01T10:00:00.000Z')
    await RecipeCommand.removeVersion(userId, recipe.id, V2)

    expect(storedDate(recipe.id)).toEqual(new Date('2026-03-11T08:00:00.000Z'))
  })
})

describe('RecipeCommand.updateIngredients', () => {
  const V1 = 1 as VersionNumber
  const flour = ingredient('Farine', '250 g')
  const withFlour = () => newInput(dishContent({ ingredients: [flour] }))
  const stored = (recipeId: RecipeId) =>
    fake.snapshot('recipe-versions').get(`${recipeId}_1`)?.content as DishContent | undefined

  test('replaces the list in place, creating no version', async () => {
    const recipe = await RecipeCommand.create(userId, withFlour())
    if (typeof recipe === 'string') throw new Error(`expected a recipe, got ${recipe}`)

    const updated = await RecipeCommand.updateIngredients(userId, recipe.id, V1, [
      ingredient('Farine', '200 g'),
      ingredient('Beurre', '80 g'),
    ])
    if (typeof updated === 'string') throw new Error(`expected a version, got ${updated}`)

    expect(updated.content).toMatchObject({
      ingredients: [
        { name: 'Farine', quantity: '200 g' },
        { name: 'Beurre', quantity: '80 g' },
      ],
    })
    expect(stored(recipe.id)?.ingredients).toEqual(
      (updated.content as DishContent).ingredients as Ingredient[],
    )
    // Correcting is not iterating: the chain does not grow.
    expect(fake.snapshot('recipes').get(recipe.id as string)?.lastVersionNumber).toBe(1)
  })

  test('leaves the steps and the outcome of a rated version alone', async () => {
    const recipe = await RecipeCommand.create(userId, withFlour())
    if (typeof recipe === 'string') throw new Error(`expected a recipe, got ${recipe}`)
    await RecipeCommand.recordAttempt(userId, {
      recipeId: recipe.id,
      versionNumber: V1,
      rating: 4 as Rating,
    })

    const updated = await RecipeCommand.updateIngredients(userId, recipe.id, V1, [
      ingredient('Farine', '200 g'),
    ])
    if (typeof updated === 'string') throw new Error(`expected a version, got ${updated}`)

    // A rating is a verdict on the same plate: the correction does not clear it.
    expect(updated.rating).toBe(4 as Rating)
    expect(updated.executedAt).toBeDefined()
    expect((updated.content as DishContent).steps).toEqual(steps('Saisir', 'Mijoter'))
  })

  test('restamps the version and the recipe, in one batch', async () => {
    const recipe = await RecipeCommand.create(userId, withFlour())
    if (typeof recipe === 'string') throw new Error(`expected a recipe, got ${recipe}`)
    const batchesBefore = fake.batches.length

    const updated = await RecipeCommand.updateIngredients(userId, recipe.id, V1, [
      ingredient('Farine', '200 g'),
    ])
    if (typeof updated === 'string') throw new Error(`expected a version, got ${updated}`)

    expect(fake.snapshot('recipes').get(recipe.id as string)?.updatedAt).toEqual(updated.updatedAt)
    expect(fake.batches.length).toBe(batchesBefore + 1)
    expect(fake.directWrites).toEqual([])
  })

  test('refuses a coffee, which has no shopping list', async () => {
    const recipe = await RecipeCommand.create(userId, {
      type: 'coffee' as const,
      category: 'drink' as const,
      method: 'espresso' as const,
      title: 'Espresso du matin' as RecipeTitle,
      content: coffeeContent(),
      tips: [],
    })
    if (typeof recipe === 'string') throw new Error(`expected a recipe, got ${recipe}`)

    expect(await RecipeCommand.updateIngredients(userId, recipe.id, V1, [])).toBe(
      'not-a-cooked-recipe',
    )
  })

  test('returns not-found for an unknown recipe, another cook’s, or an unknown version', async () => {
    expect(await RecipeCommand.updateIngredients(userId, 'nope' as RecipeId, V1, [])).toBe(
      'not-found',
    )

    const recipe = await RecipeCommand.create(userId, withFlour())
    if (typeof recipe === 'string') throw new Error(`expected a recipe, got ${recipe}`)
    expect(await RecipeCommand.updateIngredients('user-2' as UserId, recipe.id, V1, [])).toBe(
      'not-found',
    )
    expect(await RecipeCommand.updateIngredients(userId, recipe.id, 9 as VersionNumber, [])).toBe(
      'not-found',
    )
  })
})

describe('RecipeCommand.updateSteps', () => {
  const V1 = 1 as VersionNumber
  const step = (text: string, settings: LooseThermomixSettings = {}) => ({
    text: text as StepText,
    settings,
  })
  const thermomixInput = () =>
    newInput({
      kind: 'thermomix',
      ingredients: [],
      steps: [{ text: 'Mixer' as StepText, settings: {} }],
    })

  test('replaces a dish’s steps in place, dropping settings it has no machine for', async () => {
    const recipe = await RecipeCommand.create(userId, newInput())
    if (typeof recipe === 'string') throw new Error(`expected a recipe, got ${recipe}`)

    const updated = await RecipeCommand.updateSteps(userId, recipe.id, V1, [
      step('Monter les couches'),
      step('Enfourner à 180°C', { time: '40 min' as ThermomixTime }),
    ])
    if (typeof updated === 'string') throw new Error(`expected a version, got ${updated}`)

    // A dish has no machine: its steps are plain text, settings and all.
    expect(updated.content).toMatchObject({
      kind: 'dish',
      steps: ['Monter les couches', 'Enfourner à 180°C'],
    })
    expect(fake.snapshot('recipes').get(recipe.id as string)?.lastVersionNumber).toBe(1)
  })

  test('keeps a Thermomix step’s machine settings', async () => {
    const recipe = await RecipeCommand.create(userId, thermomixInput())
    if (typeof recipe === 'string') throw new Error(`expected a recipe, got ${recipe}`)

    const updated = await RecipeCommand.updateSteps(userId, recipe.id, V1, [
      step('Mixer les oignons', { time: '5 s' as ThermomixTime, speed: '5' as ThermomixSpeed }),
      step('Laisser reposer'),
    ])
    if (typeof updated === 'string') throw new Error(`expected a version, got ${updated}`)

    expect(updated.content).toMatchObject({
      kind: 'thermomix',
      steps: [
        { text: 'Mixer les oignons', settings: { time: '5 s', speed: '5' } },
        { text: 'Laisser reposer', settings: {} },
      ],
    })
  })

  test('leaves the ingredients and a rated outcome alone', async () => {
    const flour = ingredient('Farine', '250 g')
    const recipe = await RecipeCommand.create(
      userId,
      newInput(dishContent({ ingredients: [flour] })),
    )
    if (typeof recipe === 'string') throw new Error(`expected a recipe, got ${recipe}`)
    await RecipeCommand.recordAttempt(userId, {
      recipeId: recipe.id,
      versionNumber: V1,
      rating: 5 as Rating,
    })

    const updated = await RecipeCommand.updateSteps(userId, recipe.id, V1, [step('Enfourner')])
    if (typeof updated === 'string') throw new Error(`expected a version, got ${updated}`)

    expect(updated.rating).toBe(5 as Rating)
    expect((updated.content as DishContent).ingredients).toEqual([flour])
  })

  test('restamps the version and the recipe, in one batch', async () => {
    const recipe = await RecipeCommand.create(userId, newInput())
    if (typeof recipe === 'string') throw new Error(`expected a recipe, got ${recipe}`)
    const batchesBefore = fake.batches.length

    const updated = await RecipeCommand.updateSteps(userId, recipe.id, V1, [step('Enfourner')])
    if (typeof updated === 'string') throw new Error(`expected a version, got ${updated}`)

    expect(fake.snapshot('recipes').get(recipe.id as string)?.updatedAt).toEqual(updated.updatedAt)
    expect(fake.batches.length).toBe(batchesBefore + 1)
    expect(fake.directWrites).toEqual([])
  })

  test('refuses a coffee, which has no steps', async () => {
    const recipe = await RecipeCommand.create(userId, {
      type: 'coffee' as const,
      category: 'drink' as const,
      method: 'espresso' as const,
      title: 'Espresso du matin' as RecipeTitle,
      content: coffeeContent(),
      tips: [],
    })
    if (typeof recipe === 'string') throw new Error(`expected a recipe, got ${recipe}`)

    expect(await RecipeCommand.updateSteps(userId, recipe.id, V1, [])).toBe('not-a-cooked-recipe')
  })

  test('returns not-found for an unknown recipe or another cook’s recipe', async () => {
    expect(await RecipeCommand.updateSteps(userId, 'nope' as RecipeId, V1, [])).toBe('not-found')

    const recipe = await RecipeCommand.create(userId, newInput())
    if (typeof recipe === 'string') throw new Error(`expected a recipe, got ${recipe}`)
    expect(await RecipeCommand.updateSteps('user-2' as UserId, recipe.id, V1, [])).toBe('not-found')
  })
})
