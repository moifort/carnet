import { expect, test } from 'bun:test'
import { resetFakeFirestore } from '~/test/fake-firestore'

const { migration0005 } = await import('./0005-coffee-roast-vocabulary')

test('gives a vocabulary learned before roast profiles an empty list', async () => {
  const fake = resetFakeFirestore()
  fake.seed('coffee-vocabularies', 'user-1', {
    userId: 'user-1',
    beanNames: ['Belleville — Guji'],
    machines: ['Rancilio Silvia'],
  })

  const result = await migration0005.migrate({ db: fake.db })

  expect(result).toEqual({ ok: true, transformed: 1 })
  expect(fake.snapshot('coffee-vocabularies').get('user-1')?.roasts).toEqual([])
})

test('leaves a vocabulary that already knows its roast profiles', async () => {
  const fake = resetFakeFirestore()
  fake.seed('coffee-vocabularies', 'user-1', {
    userId: 'user-1',
    roasts: ['Torréfaction claire'],
  })

  const result = await migration0005.migrate({ db: fake.db })

  expect(result).toEqual({ ok: true, transformed: 0 })
  expect(fake.snapshot('coffee-vocabularies').get('user-1')?.roasts).toEqual([
    'Torréfaction claire',
  ])
})

test('keeps every other list untouched', async () => {
  const fake = resetFakeFirestore()
  fake.seed('coffee-vocabularies', 'user-1', {
    userId: 'user-1',
    beanNames: ['Belleville — Guji'],
    countries: ['Éthiopie'],
    producers: ['Coop. Hambela'],
    waterKinds: ['Volvic'],
    milkKinds: ['Avoine Oatly'],
    machines: ['Rancilio Silvia'],
    grinders: ['Niche Zero'],
  })

  await migration0005.migrate({ db: fake.db })

  expect(fake.snapshot('coffee-vocabularies').get('user-1')).toMatchObject({
    beanNames: ['Belleville — Guji'],
    countries: ['Éthiopie'],
    producers: ['Coop. Hambela'],
    waterKinds: ['Volvic'],
    milkKinds: ['Avoine Oatly'],
    machines: ['Rancilio Silvia'],
    grinders: ['Niche Zero'],
    roasts: [],
  })
})

test('is idempotent — a second run transforms nothing', async () => {
  const fake = resetFakeFirestore()
  fake.seed('coffee-vocabularies', 'user-1', { userId: 'user-1', machines: ['Rancilio Silvia'] })

  await migration0005.migrate({ db: fake.db })

  expect(await migration0005.migrate({ db: fake.db })).toEqual({ ok: true, transformed: 0 })
})
