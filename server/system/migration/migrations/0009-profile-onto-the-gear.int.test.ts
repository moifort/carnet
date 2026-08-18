import { expect, test } from 'bun:test'
import { resetFakeFirestore } from '~/test/fake-firestore'

const { migration0009 } = await import('./0009-profile-onto-the-gear')

const coffee = (roast?: string) => ({
  recipeId: 'r1',
  number: 1,
  content: {
    kind: 'coffee',
    beans: { name: 'Belleville — Guji', ...(roast ? { roast } : {}) },
    water: {},
    extraction: {},
    gear: { machine: 'Rancilio Silvia' },
  },
})

test('drops the roast a coffee version carried on its beans', async () => {
  const fake = resetFakeFirestore()
  fake.seed('recipe-versions', 'r1_1', coffee('Torréfaction claire'))

  const result = await migration0009.migrate({ db: fake.db })

  expect(result).toEqual({ ok: true, transformed: 1 })
  // The bag keeps what it says of itself, minus a profile that was never its own.
  expect(fake.snapshot('recipe-versions').get('r1_1')?.content).toMatchObject({
    beans: { name: 'Belleville — Guji' },
  })
  expect(fake.snapshot('recipe-versions').get('r1_1')?.content).toEqual({
    kind: 'coffee',
    beans: { name: 'Belleville — Guji' },
    water: {},
    extraction: {},
    gear: { machine: 'Rancilio Silvia' },
  })
})

test('touches neither a coffee without one nor a cooked version', async () => {
  const fake = resetFakeFirestore()
  fake.seed('recipe-versions', 'r1_1', coffee())
  fake.seed('recipe-versions', 'r2_1', {
    recipeId: 'r2',
    number: 1,
    content: { kind: 'dish', ingredients: [], steps: ['Cuire'] },
  })

  expect(await migration0009.migrate({ db: fake.db })).toEqual({ ok: true, transformed: 0 })
})

test('empties the suggestion list rather than promoting roasts into profiles', async () => {
  const fake = resetFakeFirestore()
  fake.seed('coffee-vocabularies', 'user-1', {
    userId: 'user-1',
    machines: ['Rancilio Silvia'],
    roasts: ['Torréfaction claire'],
  })

  const result = await migration0009.migrate({ db: fake.db })

  expect(result).toEqual({ ok: true, transformed: 1 })
  const vocabulary = fake.snapshot('coffee-vocabularies').get('user-1')
  expect(vocabulary?.profiles).toEqual([])
  expect(vocabulary).not.toHaveProperty('roasts')
  expect(vocabulary?.machines).toEqual(['Rancilio Silvia'])
})

test('is idempotent — a second run transforms nothing', async () => {
  const fake = resetFakeFirestore()
  fake.seed('recipe-versions', 'r1_1', coffee('Torréfaction claire'))
  fake.seed('coffee-vocabularies', 'user-1', { userId: 'user-1', roasts: [] })

  await migration0009.migrate({ db: fake.db })

  expect(await migration0009.migrate({ db: fake.db })).toEqual({ ok: true, transformed: 0 })
})
