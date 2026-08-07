import { expect, test } from 'bun:test'
import { resetFakeFirestore } from '~/test/fake-firestore'

const { migration0002 } = await import('./0002-coffee-parameters')

test('empties a coffee version’s parameters and keeps its steps', async () => {
  const fake = resetFakeFirestore()
  fake.seed('recipe-versions', 'r1_1', {
    recipeId: 'r1',
    number: 1,
    content: {
      kind: 'coffee',
      ingredients: [{ name: 'Café', quantity: '18 g' }],
      steps: [{ text: 'Infuser 4 min', settings: { time: '4 min' } }],
    },
  })

  const result = await migration0002.migrate({ db: fake.db })

  expect(result).toEqual({ ok: true, transformed: 1 })
  const content = fake.snapshot('recipe-versions').get('r1_1')?.content
  expect(content).toEqual({
    kind: 'coffee',
    beans: {},
    water: {},
    extraction: {},
    gear: {},
    // The gestures survive: they are still the recipe for a French press.
    steps: [{ text: 'Infuser 4 min', settings: { time: '4 min' } }],
  })
})

test('leaves a dish version alone', async () => {
  const fake = resetFakeFirestore()
  const dish = { kind: 'dish', ingredients: [{ name: 'Farine', quantity: '250 g' }], steps: [] }
  fake.seed('recipe-versions', 'r2_1', { recipeId: 'r2', number: 1, content: dish })

  const result = await migration0002.migrate({ db: fake.db })

  expect(result).toEqual({ ok: true, transformed: 0 })
  expect(fake.snapshot('recipe-versions').get('r2_1')?.content).toEqual(dish)
})

test('is idempotent — a second run transforms nothing', async () => {
  const fake = resetFakeFirestore()
  fake.seed('recipe-versions', 'r1_1', {
    recipeId: 'r1',
    number: 1,
    content: { kind: 'coffee', ingredients: [], steps: [] },
  })

  await migration0002.migrate({ db: fake.db })

  expect(await migration0002.migrate({ db: fake.db })).toEqual({ ok: true, transformed: 0 })
})

test('keeps the version envelope — only the content is rewritten', async () => {
  const fake = resetFakeFirestore()
  fake.seed('recipe-versions', 'r1_2', {
    recipeId: 'r1',
    number: 2,
    userId: 'user-1',
    origin: { kind: 'ai-proposal' },
    rating: 4,
    tips: ['Servir tout de suite'],
    content: { kind: 'coffee', ingredients: [], steps: [] },
  })

  await migration0002.migrate({ db: fake.db })

  expect(fake.snapshot('recipe-versions').get('r1_2')).toMatchObject({
    userId: 'user-1',
    origin: { kind: 'ai-proposal' },
    rating: 4,
    tips: ['Servir tout de suite'],
  })
})
