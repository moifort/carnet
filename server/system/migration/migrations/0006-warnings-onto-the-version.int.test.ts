import { expect, test } from 'bun:test'
import { resetFakeFirestore } from '~/test/fake-firestore'

const { migration0006 } = await import('./0006-warnings-onto-the-version')

const seedRecipe = (fake: ReturnType<typeof resetFakeFirestore>, id: string, warnings?: string[]) =>
  fake.seed('recipes', id, {
    id,
    userId: 'user-1',
    type: 'dish',
    title: 'Sauce mousseline',
    lastVersionNumber: 2,
    ...(warnings === undefined ? {} : { warnings }),
  })

const seedVersion = (
  fake: ReturnType<typeof resetFakeFirestore>,
  recipeId: string,
  number: number,
) =>
  fake.seed('recipe-versions', `${recipeId}_${number}`, {
    recipeId,
    number,
    userId: 'user-1',
    content: { kind: 'dish', ingredients: [], steps: [] },
    tips: [],
  })

test('hands the cautions to every version of the recipe, and drops them from the aggregate', async () => {
  const fake = resetFakeFirestore()
  seedRecipe(fake, 'r1', ['Mettre le fouet dès le début'])
  seedVersion(fake, 'r1', 1)
  seedVersion(fake, 'r1', 2)

  const result = await migration0006.migrate({ db: fake.db })

  expect(result).toEqual({ ok: true, transformed: 1 })
  // Every version, not just the one the recipe opens on: a caution that shows up
  // only on the best-rated attempt is a caution the cook loses by browsing.
  expect(fake.snapshot('recipe-versions').get('r1_1')?.warnings).toEqual([
    'Mettre le fouet dès le début',
  ])
  expect(fake.snapshot('recipe-versions').get('r1_2')?.warnings).toEqual([
    'Mettre le fouet dès le début',
  ])
  expect(fake.snapshot('recipes').get('r1')?.warnings).toBeUndefined()
})

test('drops an empty list without writing a single version', async () => {
  const fake = resetFakeFirestore()
  seedRecipe(fake, 'r1', [])
  seedVersion(fake, 'r1', 1)

  const result = await migration0006.migrate({ db: fake.db })

  expect(result).toEqual({ ok: true, transformed: 1 })
  expect(fake.snapshot('recipes').get('r1')?.warnings).toBeUndefined()
  expect(fake.snapshot('recipe-versions').get('r1_1')?.warnings).toBeUndefined()
})

test('is idempotent — a second run transforms nothing', async () => {
  const fake = resetFakeFirestore()
  seedRecipe(fake, 'r1', ['Sortir le beurre 1 h avant'])
  seedVersion(fake, 'r1', 1)

  await migration0006.migrate({ db: fake.db })

  expect(await migration0006.migrate({ db: fake.db })).toEqual({ ok: true, transformed: 0 })
  expect(fake.snapshot('recipe-versions').get('r1_1')?.warnings).toEqual([
    'Sortir le beurre 1 h avant',
  ])
})

test('keeps the recipe otherwise untouched', async () => {
  const fake = resetFakeFirestore()
  seedRecipe(fake, 'r1', ['Le fouet dès le début'])
  seedVersion(fake, 'r1', 1)

  await migration0006.migrate({ db: fake.db })

  expect(fake.snapshot('recipes').get('r1')).toMatchObject({
    userId: 'user-1',
    type: 'dish',
    title: 'Sauce mousseline',
    lastVersionNumber: 2,
  })
})
