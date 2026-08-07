import { beforeEach, describe, expect, mock, test } from 'bun:test'
import type { BrewMethod, DishCategory, RecipeId, RecipeType } from '~/domain/recipe/types'
import type { UserId } from '~/domain/shared/types'
import { fakeFirebase, resetFakeFirestore } from '~/test/fake-firestore'

mock.module('~/system/firebase', fakeFirebase)

const { RecipeQuery } = await import('~/domain/recipe/query')
const { categoryRank, methodRank } = await import('~/domain/recipe/business-rules')

const userId = 'user-1' as UserId

let fake = resetFakeFirestore()
beforeEach(() => {
  fake = resetFakeFirestore()
})

// Seed a raw recipe doc — only the fields the paginated library reads (owner,
// facet, sort keys). categoryRank mirrors what the repository stamps on save.
const seedRecipe = (
  id: string,
  fields: {
    type?: RecipeType
    category: DishCategory
    method?: BrewMethod
    updatedAt: number
    owner?: UserId
    favorite?: true
  },
) => {
  fake.seed('recipes', id, {
    id,
    userId: fields.owner ?? userId,
    type: fields.type ?? 'dish',
    category: fields.category,
    categoryRank: categoryRank(fields.category),
    // Only a coffee carries a method, hence a method rank — same as on save.
    ...(fields.method ? { method: fields.method, methodRank: methodRank(fields.method) } : {}),
    // Absent unless marked, exactly as the aggregate stores it.
    ...(fields.favorite ? { favorite: true } : {}),
    updatedAt: new Date(fields.updatedAt),
  })
}

const ids = (page: { items: { id: RecipeId }[] }) => page.items.map((r) => String(r.id))

describe('RecipeQuery.library — updatedAt sort & cursor pagination', () => {
  beforeEach(() => {
    seedRecipe('r1', { category: 'main', updatedAt: 1000 })
    seedRecipe('r2', { category: 'main', updatedAt: 2000 })
    seedRecipe('r3', { category: 'main', updatedAt: 3000 })
  })

  test('orders by updatedAt desc and reports hasMore on a full page', async () => {
    const page = await RecipeQuery.library(userId, {
      sort: 'updatedAt',
      order: 'desc',
      limit: 2,
    })
    expect(ids(page)).toEqual(['r3', 'r2'])
    expect(page.hasMore).toBe(true)
    expect(page.totalCount).toBe(2)
  })

  test('the cursor returns the following page and clears hasMore at the end', async () => {
    const page2 = await RecipeQuery.library(userId, {
      sort: 'updatedAt',
      order: 'desc',
      limit: 2,
      after: 'r2' as RecipeId,
    })
    expect(ids(page2)).toEqual(['r1'])
    expect(page2.hasMore).toBe(false)
    expect(page2.totalCount).toBe(1)
  })

  test('breaks equal-updatedAt ties by id in the sort direction (desc)', async () => {
    // Same updatedAt across all three: the implicit id tie-break must follow the
    // last orderBy direction (desc), so ids come back descending, not ascending.
    seedRecipe('a', { category: 'main', updatedAt: 5000 })
    seedRecipe('b', { category: 'main', updatedAt: 5000 })
    seedRecipe('c', { category: 'main', updatedAt: 5000 })
    const page = await RecipeQuery.library(userId, { sort: 'updatedAt', order: 'desc', limit: 3 })
    expect(ids(page)).toEqual(['c', 'b', 'a'])
  })

  test('honours ascending order', async () => {
    const page = await RecipeQuery.library(userId, { sort: 'updatedAt', order: 'asc', limit: 10 })
    expect(ids(page)).toEqual(['r1', 'r2', 'r3'])
    expect(page.hasMore).toBe(false)
  })

  test('excludes other users’ recipes', async () => {
    seedRecipe('foreign', { category: 'main', updatedAt: 9000, owner: 'user-2' as UserId })
    const page = await RecipeQuery.library(userId, { sort: 'updatedAt', order: 'desc', limit: 10 })
    expect(ids(page)).toEqual(['r3', 'r2', 'r1'])
  })
})

describe('RecipeQuery.library — category business order', () => {
  test('sorts by course order (starter → … → baking), not alphabetically', async () => {
    // Seeded in a deliberately scrambled, non-alphabetical order.
    seedRecipe('boul', { category: 'baking', updatedAt: 1000 })
    seedRecipe('entr', { category: 'starter', updatedAt: 1000 })
    seedRecipe('dess', { category: 'dessert', updatedAt: 1000 })
    seedRecipe('sauc', { category: 'sauce', updatedAt: 1000 })

    const page = await RecipeQuery.library(userId, { sort: 'category', order: 'desc', limit: 10 })
    // starter(0) < dessert(2) < sauce(4) < baking(5) — 'boul' is NOT first
    // despite being alphabetically before the others.
    expect(ids(page)).toEqual(['entr', 'dess', 'sauc', 'boul'])
  })

  test('breaks category ties by updatedAt desc', async () => {
    seedRecipe('old', { category: 'main', updatedAt: 1000 })
    seedRecipe('new', { category: 'main', updatedAt: 3000 })
    seedRecipe('mid', { category: 'main', updatedAt: 2000 })

    const page = await RecipeQuery.library(userId, { sort: 'category', order: 'desc', limit: 10 })
    expect(ids(page)).toEqual(['new', 'mid', 'old'])
  })
})

describe('RecipeQuery.library — type filter', () => {
  beforeEach(() => {
    seedRecipe('dish-a', { type: 'dish', category: 'main', updatedAt: 1000 })
    seedRecipe('thermomix-a', { type: 'thermomix', category: 'dessert', updatedAt: 2000 })
    seedRecipe('thermomix-b', { type: 'thermomix', category: 'starter', updatedAt: 3000 })
  })

  test('keeps only the requested type, combined with the sort', async () => {
    const page = await RecipeQuery.library(userId, {
      types: ['thermomix'],
      sort: 'updatedAt',
      order: 'desc',
      limit: 10,
    })
    expect(ids(page)).toEqual(['thermomix-b', 'thermomix-a'])
    expect(page.hasMore).toBe(false)
  })

  test('the type filter also applies under the category sort', async () => {
    const page = await RecipeQuery.library(userId, {
      types: ['thermomix'],
      sort: 'category',
      order: 'desc',
      limit: 10,
    })
    // starter(0) before dessert(2)
    expect(ids(page)).toEqual(['thermomix-b', 'thermomix-a'])
  })

  // The cooking notebook asks for several types at once; the coffee tab asks for
  // the one the notebook leaves out.
  test('keeps every requested type when several are asked for', async () => {
    seedRecipe('coffee-a', {
      type: 'coffee',
      category: 'drink',
      method: 'v60',
      updatedAt: 4000,
    })
    const page = await RecipeQuery.library(userId, {
      types: ['dish', 'thermomix'],
      sort: 'updatedAt',
      order: 'desc',
      limit: 10,
    })
    expect(ids(page)).toEqual(['thermomix-b', 'thermomix-a', 'dish-a'])
  })
})

describe('RecipeQuery.library — the coffee tab', () => {
  beforeEach(() => {
    seedRecipe('dish-a', { type: 'dish', category: 'main', updatedAt: 5000 })
    seedRecipe('v60', { type: 'coffee', category: 'drink', method: 'v60', updatedAt: 1000 })
    seedRecipe('espresso', {
      type: 'coffee',
      category: 'drink',
      method: 'espresso',
      updatedAt: 2000,
    })
    seedRecipe('chemex', { type: 'coffee', category: 'drink', method: 'chemex', updatedAt: 3000 })
  })

  test('reads coffees in brewing order, most recently modified first within a method', async () => {
    const page = await RecipeQuery.library(userId, {
      types: ['coffee'],
      sort: 'method',
      order: 'desc',
      limit: 10,
    })
    // espresso(0) → v60(6) → chemex(7); the dish is not a coffee.
    expect(ids(page)).toEqual(['espresso', 'v60', 'chemex'])
  })

  test('the method facet pins the order to updatedAt desc, like the category one', async () => {
    const page = await RecipeQuery.library(userId, {
      types: ['coffee'],
      method: 'v60',
      sort: 'method',
      order: 'asc',
      limit: 10,
    })
    expect(ids(page)).toEqual(['v60'])
  })
})

describe('RecipeQuery.library — favourites lens', () => {
  beforeEach(() => {
    seedRecipe('fav-dish', { type: 'dish', category: 'main', updatedAt: 1000, favorite: true })
    seedRecipe('plain-dish', { type: 'dish', category: 'starter', updatedAt: 2000 })
    seedRecipe('fav-thermomix', {
      type: 'thermomix',
      category: 'dessert',
      updatedAt: 3000,
      favorite: true,
    })
  })

  test('keeps only the favourites, every type mixed, in course order', async () => {
    const page = await RecipeQuery.library(userId, {
      favorite: true,
      sort: 'category',
      order: 'desc',
      limit: 10,
    })
    // main(1) before dessert(2); the un-favourited starter is out despite ranking first.
    expect(ids(page)).toEqual(['fav-dish', 'fav-thermomix'])
  })

  test('without the facet the library still returns everything', async () => {
    const page = await RecipeQuery.library(userId, { sort: 'updatedAt', order: 'desc', limit: 10 })
    expect(ids(page)).toEqual(['fav-thermomix', 'plain-dish', 'fav-dish'])
  })
})

describe('RecipeQuery.library — category filter', () => {
  beforeEach(() => {
    seedRecipe('dish-old', { type: 'dish', category: 'main', updatedAt: 1000 })
    seedRecipe('dessert-a', { type: 'dish', category: 'dessert', updatedAt: 2000 })
    seedRecipe('dish-new', { type: 'thermomix', category: 'main', updatedAt: 3000 })
    seedRecipe('dessert-b', { type: 'thermomix', category: 'dessert', updatedAt: 4000 })
  })

  test('keeps only the requested category, ordered updatedAt desc', async () => {
    const page = await RecipeQuery.library(userId, {
      category: 'dessert',
      sort: 'updatedAt',
      order: 'desc',
      limit: 10,
    })
    expect(ids(page)).toEqual(['dessert-b', 'dessert-a'])
    expect(page.hasMore).toBe(false)
  })

  test('combines a type facet with the category filter', async () => {
    const page = await RecipeQuery.library(userId, {
      types: ['thermomix'],
      category: 'main',
      sort: 'updatedAt',
      order: 'desc',
      limit: 10,
    })
    expect(ids(page)).toEqual(['dish-new'])
  })

  test('pins the order to updatedAt desc even when an ascending sort is requested', async () => {
    // The category filter coerces the page to updatedAt desc. Requesting the
    // opposite (updatedAt ASC) proves the coercion actually fires: without it the
    // page would come back ascending (['dessert-a', 'dessert-b']).
    const page = await RecipeQuery.library(userId, {
      category: 'dessert',
      sort: 'updatedAt',
      order: 'asc',
      limit: 10,
    })
    expect(ids(page)).toEqual(['dessert-b', 'dessert-a'])
  })

  test('paginates within a category via the cursor', async () => {
    // A third dessert so a limit-2 page leaves a remainder to fetch. Ordered
    // updatedAt desc: dessert-b(4000), dessert-c(3000), dessert-a(2000).
    seedRecipe('dessert-c', { type: 'dish', category: 'dessert', updatedAt: 3000 })
    const page1 = await RecipeQuery.library(userId, {
      category: 'dessert',
      sort: 'updatedAt',
      order: 'desc',
      limit: 2,
    })
    expect(ids(page1)).toEqual(['dessert-b', 'dessert-c'])
    expect(page1.hasMore).toBe(true)

    const page2 = await RecipeQuery.library(userId, {
      category: 'dessert',
      sort: 'updatedAt',
      order: 'desc',
      limit: 2,
      after: 'dessert-c' as RecipeId,
    })
    expect(ids(page2)).toEqual(['dessert-a'])
    expect(page2.hasMore).toBe(false)
  })
})

describe('RecipeQuery.library — limit clamp', () => {
  beforeEach(() => {
    for (let i = 0; i < 3; i++) seedRecipe(`r${i}`, { category: 'main', updatedAt: 1000 + i })
  })

  test('clamps a non-positive limit up to 1', async () => {
    const page = await RecipeQuery.library(userId, { sort: 'updatedAt', order: 'desc', limit: 0 })
    expect(page.items.length).toBe(1)
    expect(page.hasMore).toBe(true)
  })

  test('an oversized limit still returns every matching recipe', async () => {
    const page = await RecipeQuery.library(userId, { sort: 'updatedAt', order: 'desc', limit: 999 })
    expect(page.items.length).toBe(3)
    expect(page.hasMore).toBe(false)
  })

  test('caps the page at 50 recipes whatever the requested limit', async () => {
    for (let i = 3; i < 51; i++) seedRecipe(`r${i}`, { category: 'main', updatedAt: 1000 + i })
    const page = await RecipeQuery.library(userId, { sort: 'updatedAt', order: 'desc', limit: 999 })
    expect(page.items.length).toBe(50)
    expect(page.hasMore).toBe(true)
  })
})

describe('RecipeQuery.versionsOfMany — the satellite loader’s read', () => {
  // Seed a raw version doc — only what the loader groups on.
  const seedVersion = (recipeId: string, number: number) => {
    fake.seed('recipe-versions', `${recipeId}_${number}`, {
      userId,
      recipeId,
      number,
      createdAt: new Date(1000 * number),
      origin: { kind: 'import' },
      content: { kind: 'dish', ingredients: [], steps: [] },
      tips: [],
    })
  }

  test('reads the asked-for lineages and nothing else', async () => {
    seedVersion('r1', 1)
    seedVersion('r1', 2)
    seedVersion('r2', 1)
    seedVersion('untouched', 1)

    const versions = await RecipeQuery.versionsOfMany(['r1', 'r2'] as RecipeId[])
    // The whole notebook is never scanned: a recipe outside the page contributes
    // nothing, however many versions it holds.
    expect(versions.map((v) => `${v.recipeId}_${v.number}`).sort()).toEqual([
      'r1_1',
      'r1_2',
      'r2_1',
    ])
  })

  test('fans a page wider than the 30-value `in` cap into several queries', async () => {
    for (let i = 0; i < 31; i++) seedVersion(`wide-${i}`, 1)
    const before = fake.queryReads

    const versions = await RecipeQuery.versionsOfMany(
      Array.from({ length: 31 }, (_, i) => `wide-${i}`) as RecipeId[],
    )
    expect(versions.length).toBe(31)
    // 31 ids over a cap of 30: two queries, not thirty-one reads.
    expect(fake.queryReads - before).toBe(2)
  })

  test('costs nothing when the page holds no recipe', async () => {
    const before = fake.queryReads
    expect(await RecipeQuery.versionsOfMany([])).toEqual([])
    expect(fake.queryReads - before).toBe(0)
  })
})

describe('RecipeQuery — warnings storage boundary', () => {
  test('a recipe written before the field existed reads as the empty list', async () => {
    // Seeded raw, without `warnings` — the shape every pre-feature document has.
    seedRecipe('legacy', { category: 'main', updatedAt: 1000 })

    const byId = await RecipeQuery.byId(userId, 'legacy' as RecipeId)
    if (byId === 'not-found') throw new Error('expected a recipe')
    expect(byId.warnings).toEqual([])

    const page = await RecipeQuery.library(userId, { sort: 'updatedAt', order: 'desc', limit: 10 })
    expect(page.items[0]?.warnings).toEqual([])
  })
})
