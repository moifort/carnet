import { expect, test } from 'bun:test'
import { resetFakeFirestore } from '~/test/fake-firestore'

const { migration0004 } = await import('./0004-recipe-dated-by-its-best-version')

const day = (iso: string) => new Date(iso)

test('dates the recipe by its best-rated version, not by its last write', async () => {
  const fake = resetFakeFirestore()
  // The recipe was hearted in August; the version that answers for it is the v2
  // rated 5 back in July.
  fake.seed('recipes', 'r1', {
    id: 'r1',
    title: 'Crumble aux pommes',
    updatedAt: day('2026-08-06T10:00:00Z'),
  })
  fake.seed('recipe-versions', 'r1_1', {
    recipeId: 'r1',
    number: 1,
    rating: 3,
    updatedAt: day('2026-07-02T10:00:00Z'),
  })
  fake.seed('recipe-versions', 'r1_2', {
    recipeId: 'r1',
    number: 2,
    rating: 5,
    updatedAt: day('2026-07-14T10:00:00Z'),
  })

  const result = await migration0004.migrate({ db: fake.db })

  expect(result).toEqual({ ok: true, transformed: 1 })
  expect(fake.snapshot('recipes').get('r1')?.updatedAt).toEqual(day('2026-07-14T10:00:00Z'))
})

test('falls back to the latest version when nothing was ever cooked', async () => {
  const fake = resetFakeFirestore()
  fake.seed('recipes', 'r2', { id: 'r2', updatedAt: day('2026-08-06T10:00:00Z') })
  fake.seed('recipe-versions', 'r2_1', {
    recipeId: 'r2',
    number: 1,
    updatedAt: day('2026-05-01T10:00:00Z'),
  })
  fake.seed('recipe-versions', 'r2_2', {
    recipeId: 'r2',
    number: 2,
    updatedAt: day('2026-05-09T10:00:00Z'),
  })

  await migration0004.migrate({ db: fake.db })

  expect(fake.snapshot('recipes').get('r2')?.updatedAt).toEqual(day('2026-05-09T10:00:00Z'))
})

test('a tie on the rating goes to the most recent version', async () => {
  const fake = resetFakeFirestore()
  fake.seed('recipes', 'r3', { id: 'r3', updatedAt: day('2026-08-06T10:00:00Z') })
  fake.seed('recipe-versions', 'r3_1', {
    recipeId: 'r3',
    number: 1,
    rating: 4,
    updatedAt: day('2026-04-01T10:00:00Z'),
  })
  fake.seed('recipe-versions', 'r3_2', {
    recipeId: 'r3',
    number: 2,
    rating: 4,
    updatedAt: day('2026-04-20T10:00:00Z'),
  })

  await migration0004.migrate({ db: fake.db })

  expect(fake.snapshot('recipes').get('r3')?.updatedAt).toEqual(day('2026-04-20T10:00:00Z'))
})

test('keeps the rest of the recipe, and is idempotent', async () => {
  const fake = resetFakeFirestore()
  fake.seed('recipes', 'r4', {
    id: 'r4',
    title: 'Blanquette',
    favorite: true,
    categoryRank: 1,
    updatedAt: day('2026-08-06T10:00:00Z'),
  })
  fake.seed('recipe-versions', 'r4_1', {
    recipeId: 'r4',
    number: 1,
    rating: 5,
    updatedAt: day('2026-06-11T10:00:00Z'),
  })

  await migration0004.migrate({ db: fake.db })

  expect(fake.snapshot('recipes').get('r4')).toMatchObject({
    title: 'Blanquette',
    favorite: true,
    categoryRank: 1,
    updatedAt: day('2026-06-11T10:00:00Z'),
  })
  // Nothing left to move on a second run.
  expect(await migration0004.migrate({ db: fake.db })).toEqual({ ok: true, transformed: 0 })
})

test('leaves a recipe whose lineage is missing rather than dating it from nothing', async () => {
  const fake = resetFakeFirestore()
  fake.seed('recipes', 'r5', { id: 'r5', updatedAt: day('2026-08-06T10:00:00Z') })

  const result = await migration0004.migrate({ db: fake.db })

  expect(result).toEqual({ ok: true, transformed: 0 })
  expect(fake.snapshot('recipes').get('r5')?.updatedAt).toEqual(day('2026-08-06T10:00:00Z'))
})
