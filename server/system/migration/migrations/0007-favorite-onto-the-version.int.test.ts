import { expect, test } from 'bun:test'
import { resetFakeFirestore } from '~/test/fake-firestore'

const { migration0007 } = await import('./0007-favorite-onto-the-version')

type Fake = ReturnType<typeof resetFakeFirestore>

const seedRecipe = (fake: Fake, id: string, favorite?: true) =>
  fake.seed('recipes', id, {
    id,
    userId: 'user-1',
    type: 'dish',
    title: 'Risotto au parmesan',
    lastVersionNumber: 3,
    ...(favorite ? { favorite } : {}),
  })

const seedVersion = (fake: Fake, recipeId: string, number: number, rating?: number) =>
  fake.seed('recipe-versions', `${recipeId}_${number}`, {
    recipeId,
    number,
    userId: 'user-1',
    content: { kind: 'dish', ingredients: [], steps: [] },
    tips: [],
    warnings: [],
    ...(rating === undefined ? {} : { rating }),
  })

test('hearts the version the recipe opens on — its best-rated attempt', async () => {
  const fake = resetFakeFirestore()
  seedRecipe(fake, 'r1', true)
  seedVersion(fake, 'r1', 1, 3)
  seedVersion(fake, 'r1', 2, 5)
  seedVersion(fake, 'r1', 3, 4)

  const result = await migration0007.migrate({ db: fake.db })

  expect(result).toEqual({ ok: true, transformed: 1 })
  expect(fake.snapshot('recipe-versions').get('r1_2')?.favorite).toBe(true)
  // One version, not all of them: hearting every attempt would claim the cook
  // picked each one.
  expect(fake.snapshot('recipe-versions').get('r1_1')?.favorite).toBeUndefined()
  expect(fake.snapshot('recipe-versions').get('r1_3')?.favorite).toBeUndefined()
  // The mirror already reads true, and is left exactly as it was.
  expect(fake.snapshot('recipes').get('r1')?.favorite).toBe(true)
})

test('falls back to the latest version when nothing was ever cooked', async () => {
  const fake = resetFakeFirestore()
  seedRecipe(fake, 'r1', true)
  seedVersion(fake, 'r1', 1)
  seedVersion(fake, 'r1', 2)

  await migration0007.migrate({ db: fake.db })

  expect(fake.snapshot('recipe-versions').get('r1_2')?.favorite).toBe(true)
})

test('leaves a recipe nobody hearted alone', async () => {
  const fake = resetFakeFirestore()
  seedRecipe(fake, 'r1')
  seedVersion(fake, 'r1', 1, 5)

  const result = await migration0007.migrate({ db: fake.db })

  expect(result).toEqual({ ok: true, transformed: 0 })
  expect(fake.snapshot('recipe-versions').get('r1_1')?.favorite).toBeUndefined()
})

test('is idempotent — a second run transforms nothing', async () => {
  const fake = resetFakeFirestore()
  seedRecipe(fake, 'r1', true)
  seedVersion(fake, 'r1', 1, 4)

  await migration0007.migrate({ db: fake.db })

  expect(await migration0007.migrate({ db: fake.db })).toEqual({ ok: true, transformed: 0 })
  expect(fake.snapshot('recipe-versions').get('r1_1')?.favorite).toBe(true)
})

test('keeps the version envelope — only the heart is added', async () => {
  const fake = resetFakeFirestore()
  seedRecipe(fake, 'r1', true)
  seedVersion(fake, 'r1', 1, 4)

  await migration0007.migrate({ db: fake.db })

  expect(fake.snapshot('recipe-versions').get('r1_1')).toMatchObject({
    userId: 'user-1',
    content: { kind: 'dish', ingredients: [], steps: [] },
    tips: [],
    warnings: [],
    rating: 4,
  })
})
