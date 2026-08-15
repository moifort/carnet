import { beforeEach, describe, expect, mock, test } from 'bun:test'
import { graphql } from 'graphql'
import type { DishCategory, RecipeId, VersionNumber } from '~/domain/recipe/types'
import type { UserId } from '~/domain/shared/types'
import { fakeFirebase, resetFakeFirestore } from '~/test/fake-firestore'

mock.module('~/system/firebase', fakeFirebase)

const { schema } = await import('~/domain/shared/graphql/schema')
const { recipeSatelliteLoaders } = await import('~/domain/shared/graphql/loaders')
const { categoryRank } = await import('~/domain/recipe/business-rules')

const userId = 'user-1' as UserId
const unknownId = '11111111-1111-4111-8111-111111111111'

// Recipe ids are UUIDs (the `RecipeId` scalar rejects anything else), so the
// fixtures use readable ones rather than `r1`/`r2`.
const r1 = 'aaaaaaaa-0000-4000-8000-000000000001'
const r2 = 'aaaaaaaa-0000-4000-8000-000000000002'
const r3 = 'aaaaaaaa-0000-4000-8000-000000000003'
const foreign = 'bbbbbbbb-0000-4000-8000-000000000001'

let fake = resetFakeFirestore()
beforeEach(() => {
  fake = resetFakeFirestore()
})

// One request = one loader set, exactly as routes/graphql.ts builds it.
const execute = (source: string) =>
  graphql({
    schema,
    source,
    contextValue: { userId, event: undefined as never, loaders: recipeSatelliteLoaders(userId) },
  })

const seedRecipe = (id: string, fields: { category: DishCategory; updatedAt: number }) => {
  fake.seed('recipes', id, {
    id,
    userId,
    type: 'dish',
    category: fields.category,
    categoryRank: categoryRank(fields.category),
    title: `Recette ${id}`,
    lastVersionNumber: 1,
    createdAt: new Date(fields.updatedAt),
    updatedAt: new Date(fields.updatedAt),
  })
}

const seedVersion = (recipeId: string, number: number, rating?: number) => {
  fake.seed('recipe-versions', `${recipeId}_${number}`, {
    userId,
    recipeId: recipeId as RecipeId,
    number: number as VersionNumber,
    createdAt: new Date(number * 1000),
    origin: { kind: number === 1 ? 'import' : 'ai-proposal' },
    content: { kind: 'dish', ingredients: [], steps: ['Cuire'] },
    tips: [],
    ...(rating === undefined ? {} : { executedAt: new Date(number * 1000), rating }),
  })
}

describe('recipe query', () => {
  test('returns the recipe with its lineage and everything derived from it', async () => {
    seedRecipe(r1, { category: 'main', updatedAt: 1000 })
    seedVersion(r1, 1, 3)
    seedVersion(r1, 2, 5)
    seedVersion(r1, 3)

    const result = await execute(`
      query {
        recipe(id: "${r1}") {
          title
          versionCount
          bestRating
          versionToOpen { number rating }
          versions { number rating }
        }
      }
    `)
    expect(result.errors).toBeUndefined()
    expect(result.data?.recipe).toMatchObject({
      title: `Recette ${r1}`,
      versionCount: 3,
      // Derived from the cooked versions — v2 scored highest, so that is the one
      // the app opens, and the untried v3 changes neither.
      bestRating: 5,
      versionToOpen: { number: 2, rating: 5 },
    })
    expect(result.data?.recipe).toMatchObject({
      versions: [
        { number: 1, rating: 3 },
        { number: 2, rating: 5 },
        { number: 3, rating: null },
      ],
    })
  })

  test('reads the lineage once, however many fields are derived from it', async () => {
    seedRecipe(r1, { category: 'main', updatedAt: 1000 })
    seedVersion(r1, 1, 3)
    seedVersion(r1, 2, 5)

    // Exactly what the recipe sheet asks for.
    const result = await execute(`
      query {
        recipe(id: "${r1}") {
          bestRating
          versionToOpen { number }
          versions { number }
        }
      }
    `)
    expect(result.errors).toBeUndefined()
    // The recipe itself by key, then one scan shared by everything derived from the
    // lineage — `versions` included, which used to pay for a second, redundant query.
    expect(fake.docReads).toBe(1)
    expect(fake.queryReads).toBe(1)
  })

  test('serves the pinned warnings — and the empty list on a pre-feature document', async () => {
    // Seeded raw without `warnings`, the shape every pre-feature document has.
    seedRecipe(r1, { category: 'main', updatedAt: 1000 })
    seedVersion(r1, 1)

    const legacy = await execute(`query { recipe(id: "${r1}") { warnings } }`)
    expect(legacy.errors).toBeUndefined()
    expect(legacy.data?.recipe).toMatchObject({ warnings: [] })

    fake.seed('recipes', r2, {
      id: r2,
      userId,
      type: 'dish',
      category: 'main',
      categoryRank: categoryRank('main'),
      title: 'Sauce mousseline',
      warnings: ['Mettre le fouet dès le début'],
      lastVersionNumber: 1,
      createdAt: new Date(1000),
      updatedAt: new Date(1000),
    })
    const pinned = await execute(`query { recipe(id: "${r2}") { warnings } }`)
    expect(pinned.errors).toBeUndefined()
    expect(pinned.data?.recipe).toMatchObject({ warnings: ['Mettre le fouet dès le début'] })
  })

  test('returns null for a recipe that does not exist', async () => {
    const result = await execute(`query { recipe(id: "${unknownId}") { title } }`)
    expect(result.errors).toBeUndefined()
    expect(result.data?.recipe).toBeNull()
  })

  test('returns null for another cook’s recipe', async () => {
    fake.seed('recipes', foreign, {
      id: foreign,
      userId: 'user-2' as UserId,
      type: 'dish',
      category: 'main',
      categoryRank: categoryRank('main'),
      title: 'Pas la mienne',
      lastVersionNumber: 1,
      createdAt: new Date(1000),
      updatedAt: new Date(1000),
    })
    const result = await execute(`query { recipe(id: "${foreign}") { title } }`)
    expect(result.errors).toBeUndefined()
    expect(result.data?.recipe).toBeNull()
  })
})

describe('recipes query', () => {
  beforeEach(() => {
    seedRecipe(r1, { category: 'main', updatedAt: 1000 })
    seedRecipe(r2, { category: 'starter', updatedAt: 2000 })
    seedRecipe(r3, { category: 'dessert', updatedAt: 3000 })
    for (const id of [r1, r2, r3]) {
      seedVersion(id, 1, 4)
      seedVersion(id, 2, 2)
    }
  })

  test('pages the library and hands the cursor to the next page', async () => {
    const first = await execute(`
      query { recipes(sort: UPDATED_AT, order: DESC, limit: 2) { items { id } hasMore } }
    `)
    expect(first.errors).toBeUndefined()
    expect(first.data?.recipes).toMatchObject({
      items: [{ id: r3 }, { id: r2 }],
      hasMore: true,
    })

    const next = await execute(`
      query { recipes(sort: UPDATED_AT, order: DESC, limit: 2, after: "${r2}") { items { id } hasMore } }
    `)
    expect(next.data?.recipes).toMatchObject({ items: [{ id: r1 }], hasMore: false })
  })

  test('orders by the course rank when asked to sort by category', async () => {
    const result = await execute(`
      query { recipes(sort: CATEGORY, limit: 10) { items { id category } } }
    `)
    expect(result.errors).toBeUndefined()
    // starter → main → dessert is the business rank, not the alphabet.
    expect(
      (result.data as { recipes: { items: { id: string }[] } }).recipes.items.map((r) => r.id),
    ).toEqual([r2, r1, r3])
  })

  test('costs one lineage scan for the whole page, not one read per recipe', async () => {
    const before = fake.queryReads
    const result = await execute(`
      query {
        recipes(sort: UPDATED_AT, order: DESC, limit: 10) {
          items { id bestRating versionCount toTestCount versionToOpen { number } versions { number } }
        }
      }
    `)
    expect(result.errors).toBeUndefined()
    // One scan for the page itself, one for every satellite field of every recipe: the
    // loader batches them all, so three recipes and five satellite fields — the lineage
    // itself included — never cost more than the single scan they share.
    expect(fake.queryReads - before).toBe(2)
    expect(fake.docReads).toBe(0)
  })

  test('keeps that budget when the page grows', async () => {
    for (let i = 4; i <= 12; i++) {
      const id = `aaaaaaaa-0000-4000-8000-0000000000${String(i).padStart(2, '0')}`
      seedRecipe(id, { category: 'main', updatedAt: i * 1000 })
      seedVersion(id, 1, 3)
    }
    const before = fake.queryReads
    const result = await execute(`
      query {
        recipes(sort: UPDATED_AT, order: DESC, limit: 12) {
          items { id bestRating versions { number } }
        }
      }
    `)
    expect(result.errors).toBeUndefined()
    expect((result.data as { recipes: { items: unknown[] } }).recipes.items.length).toBe(12)
    // Four times the recipes, same two reads — the proof that the budget is the
    // page's, not the recipe's.
    expect(fake.queryReads - before).toBe(2)
  })
})

describe('an ingredient that is a recipe', () => {
  // The ravioli, whose first line IS the dough recipe seeded beside it.
  const seedComposed = (parentId: string, ...componentIds: string[]) => {
    seedRecipe(parentId, { category: 'main', updatedAt: 1000 })
    fake.seed('recipe-versions', `${parentId}_1`, {
      userId,
      recipeId: parentId as RecipeId,
      number: 1 as VersionNumber,
      createdAt: new Date(1000),
      origin: { kind: 'import' },
      content: {
        kind: 'dish',
        ingredients: [
          ...componentIds.map((component, i) => ({
            name: `Composant ${i}`,
            quantity: '400 g',
            component,
          })),
          { name: 'Champignons', quantity: '250 g' },
        ],
        steps: ['Garnir'],
      },
      tips: [],
    })
  }

  const COMPOSED_SHEET = (id: string) => `
    query {
      recipe(id: "${id}") {
        versionToOpen {
          content {
            ... on DishContent {
              ingredients {
                name
                quantity
                component { title bestRating versionToOpen { number } }
              }
            }
          }
        }
      }
    }
  `

  test('serves the linked recipe’s live title and best rating, and nothing on a plain line', async () => {
    seedComposed(r1, r2)
    seedRecipe(r2, { category: 'main', updatedAt: 2000 })
    seedVersion(r2, 1, 3)
    seedVersion(r2, 2, 5)

    const result = await execute(COMPOSED_SHEET(r1))

    expect(result.errors).toBeUndefined()
    const { ingredients } = (
      result.data as { recipe: { versionToOpen: { content: { ingredients: unknown[] } } } }
    ).recipe.versionToOpen.content
    expect(ingredients[0]).toEqual({
      name: 'Composant 0',
      quantity: '400 g',
      // The title comes from the link, live; the version shown is derived, so the
      // dough's best attempt is what the ravioli displays.
      component: { title: `Recette ${r2}`, bestRating: 5, versionToOpen: { number: 2 } },
    })
    expect(ingredients[1]).toEqual({ name: 'Champignons', quantity: '250 g', component: null })
  })

  test('answers null once the linked recipe is gone, the line staying readable', async () => {
    // The dough was thrown away on purpose: nothing to repair, nothing to clean up —
    // the immutable content still names what goes in and how much of it.
    seedComposed(r1, unknownId)

    const result = await execute(COMPOSED_SHEET(r1))

    expect(result.errors).toBeUndefined()
    const { ingredients } = (
      result.data as { recipe: { versionToOpen: { content: { ingredients: unknown[] } } } }
    ).recipe.versionToOpen.content
    expect(ingredients[0]).toEqual({ name: 'Composant 0', quantity: '400 g', component: null })
  })

  test('answers null for another cook’s recipe, never their title', async () => {
    seedComposed(r1, foreign)
    fake.seed('recipes', foreign, {
      id: foreign,
      userId: 'user-2' as UserId,
      type: 'dish',
      category: 'main',
      categoryRank: categoryRank('main'),
      title: 'La recette du voisin',
      lastVersionNumber: 1,
      createdAt: new Date(1000),
      updatedAt: new Date(1000),
    })

    const result = await execute(COMPOSED_SHEET(r1))

    expect(result.errors).toBeUndefined()
    expect(JSON.stringify(result.data)).not.toContain('voisin')
  })

  test('costs one lineage scan for every component, never one per line', async () => {
    seedComposed(r1, r2, r3)
    seedRecipe(r2, { category: 'main', updatedAt: 2000 })
    seedVersion(r2, 1, 3)
    seedRecipe(r3, { category: 'main', updatedAt: 3000 })
    seedVersion(r3, 1, 4)

    const result = await execute(COMPOSED_SHEET(r1))

    expect(result.errors).toBeUndefined()
    // The parent by key, then its two components — a keyed read per document is
    // Firestore's price for reading them, and the batch makes it one round trip.
    expect(fake.docReads).toBe(3)
    // What this locks: the parent's lineage, then ONE scan shared by both components.
    // Never a scan per linked line.
    expect(fake.queryReads).toBe(2)
  })

  test('leaves the library budget untouched — it asks for no component', async () => {
    seedComposed(r1, r2)
    seedRecipe(r2, { category: 'main', updatedAt: 2000 })
    seedVersion(r2, 1, 3)
    const before = fake.queryReads

    const result = await execute(`
      query { recipes(sort: UPDATED_AT, order: DESC, limit: 10) { items { id bestRating } } }
    `)

    expect(result.errors).toBeUndefined()
    // The page and its lineages, exactly as before the feature existed.
    expect(fake.queryReads - before).toBe(2)
    expect(fake.docReads).toBe(0)
  })
})

describe('coffeeVocabulary query', () => {
  test('suggests what the cook has already typed, most recent first', async () => {
    fake.seed('coffee-vocabularies', userId, {
      userId,
      beanNames: ['Belleville — Sidamo', 'Belleville — Guji'],
      countries: ['Éthiopie'],
      producers: [],
      roasts: ['Torréfaction claire'],
      waterKinds: ['Robinet (dureté 3/5)'],
      milkKinds: [],
      machines: ['Rancilio Silvia'],
      grinders: ['Niche Zero'],
      updatedAt: new Date(),
    })

    const result = await execute(
      `{ coffeeVocabulary { beanNames countries roasts waterKinds machines grinders milkKinds } }`,
    )

    expect(result.errors).toBeUndefined()
    expect(result.data?.coffeeVocabulary).toEqual({
      beanNames: ['Belleville — Sidamo', 'Belleville — Guji'],
      countries: ['Éthiopie'],
      roasts: ['Torréfaction claire'],
      waterKinds: ['Robinet (dureté 3/5)'],
      machines: ['Rancilio Silvia'],
      grinders: ['Niche Zero'],
      milkKinds: [],
    })
  })

  test('costs one keyed document read and never scans a collection', async () => {
    fake.seed('coffee-vocabularies', userId, {
      userId,
      beanNames: ['Guji'],
      countries: [],
      producers: [],
      waterKinds: [],
      milkKinds: [],
      machines: [],
      grinders: [],
      updatedAt: new Date(),
    })
    const before = fake.docReads

    await execute(`{ coffeeVocabulary { beanNames } }`)

    expect(fake.docReads - before).toBe(1)
    expect(fake.queryReads).toBe(0)
  })

  test('answers empty lists to a cook who has never saved a coffee', async () => {
    const result = await execute(`{ coffeeVocabulary { beanNames machines } }`)

    expect(result.errors).toBeUndefined()
    expect(result.data?.coffeeVocabulary).toEqual({ beanNames: [], machines: [] })
  })
})
