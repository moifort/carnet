import { expect, test } from 'bun:test'
import { resetFakeFirestore } from '~/test/fake-firestore'

const { migration0003 } = await import('./0003-version-updated-at')

test('dates an untouched version by its creation', async () => {
  const fake = resetFakeFirestore()
  const createdAt = new Date('2026-03-11T08:00:00.000Z')
  fake.seed('recipe-versions', 'r1_1', { recipeId: 'r1', number: 1, createdAt })

  const result = await migration0003.migrate({ db: fake.db })

  expect(result).toEqual({ ok: true, transformed: 1 })
  expect(fake.snapshot('recipe-versions').get('r1_1')?.updatedAt).toEqual(createdAt)
})

test('leaves a version that already carries its edit date', async () => {
  const fake = resetFakeFirestore()
  const updatedAt = new Date('2026-04-02T19:30:00.000Z')
  fake.seed('recipe-versions', 'r1_2', {
    recipeId: 'r1',
    number: 2,
    createdAt: new Date('2026-03-11T08:00:00.000Z'),
    updatedAt,
  })

  const result = await migration0003.migrate({ db: fake.db })

  expect(result).toEqual({ ok: true, transformed: 0 })
  expect(fake.snapshot('recipe-versions').get('r1_2')?.updatedAt).toEqual(updatedAt)
})

test('is idempotent — a second run transforms nothing', async () => {
  const fake = resetFakeFirestore()
  fake.seed('recipe-versions', 'r1_1', {
    recipeId: 'r1',
    number: 1,
    createdAt: new Date('2026-03-11T08:00:00.000Z'),
  })

  await migration0003.migrate({ db: fake.db })

  expect(await migration0003.migrate({ db: fake.db })).toEqual({ ok: true, transformed: 0 })
})

test('keeps the version envelope — only the date is added', async () => {
  const fake = resetFakeFirestore()
  fake.seed('recipe-versions', 'r1_3', {
    recipeId: 'r1',
    number: 3,
    userId: 'user-1',
    createdAt: new Date('2026-03-11T08:00:00.000Z'),
    origin: { kind: 'ai-proposal' },
    rating: 4,
    tips: ['Servir tout de suite'],
  })

  await migration0003.migrate({ db: fake.db })

  expect(fake.snapshot('recipe-versions').get('r1_3')).toMatchObject({
    userId: 'user-1',
    origin: { kind: 'ai-proposal' },
    rating: 4,
    tips: ['Servir tout de suite'],
  })
})
