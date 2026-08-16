import { expect, test } from 'bun:test'
import { resetFakeFirestore } from '~/test/fake-firestore'

const { migration0008 } = await import('./0008-components-onto-the-recipe')

type Fake = ReturnType<typeof resetFakeFirestore>

const seedRecipe = (fake: Fake, id: string) =>
  fake.seed('recipes', id, {
    id,
    userId: 'user-1',
    type: 'dish',
    title: 'Ravioles aux champignons',
    lastVersionNumber: 2,
  })

// One version whose ingredient lines carry a link, or not: `['dough', undefined]`
// seeds a first line that IS the dough recipe and a plain second one.
const seedVersion = (fake: Fake, recipeId: string, number: number, links: (string | undefined)[]) =>
  fake.seed('recipe-versions', `${recipeId}_${number}`, {
    recipeId,
    number,
    userId: 'user-1',
    content: {
      kind: 'dish',
      ingredients: links.map((component, i) => ({
        name: `Ligne ${i}`,
        quantity: '400 g',
        ...(component ? { component } : {}),
      })),
      steps: ['Garnir'],
    },
    tips: [],
    warnings: [],
  })

test('lifts every linked recipe onto the aggregate, at the weight it is written', async () => {
  const fake = resetFakeFirestore()
  seedRecipe(fake, 'r1')
  seedVersion(fake, 'r1', 1, ['dough', undefined])

  const result = await migration0008.migrate({ db: fake.db })

  expect(result).toEqual({ ok: true, transformed: 1 })
  expect(fake.snapshot('recipes').get('r1')?.components).toEqual([{ recipe: 'dough', scale: 1 }])
  // The flat ids ride along, or the link could not be read backwards.
  expect(fake.snapshot('recipes').get('r1')?.componentIds).toEqual(['dough'])
})

test('takes each linked recipe once, in the order the lineage meets it', async () => {
  const fake = resetFakeFirestore()
  seedRecipe(fake, 'r1')
  seedVersion(fake, 'r1', 1, ['dough', 'sauce'])
  seedVersion(fake, 'r1', 2, ['dough'])

  await migration0008.migrate({ db: fake.db })

  expect(fake.snapshot('recipes').get('r1')?.components).toEqual([
    { recipe: 'dough', scale: 1 },
    { recipe: 'sauce', scale: 1 },
  ])
})

test('the lines lose the link and keep everything else', async () => {
  const fake = resetFakeFirestore()
  seedRecipe(fake, 'r1')
  seedVersion(fake, 'r1', 1, ['dough', undefined])

  await migration0008.migrate({ db: fake.db })

  const stored = fake.snapshot('recipe-versions').get('r1_1')
  expect(stored?.content).toEqual({
    kind: 'dish',
    // A line that was a link stays a line of the shopping list.
    ingredients: [
      { name: 'Ligne 0', quantity: '400 g' },
      { name: 'Ligne 1', quantity: '400 g' },
    ],
    steps: ['Garnir'],
  })
  expect(stored).toMatchObject({ userId: 'user-1', tips: [], warnings: [] })
})

test('leaves a recipe that links nothing untouched, coffees included', async () => {
  const fake = resetFakeFirestore()
  seedRecipe(fake, 'r1')
  seedVersion(fake, 'r1', 1, [undefined])
  fake.seed('recipe-versions', 'r1_2', {
    recipeId: 'r1',
    number: 2,
    userId: 'user-1',
    content: { kind: 'coffee', extraction: { grind: 'Niveau 12' } },
    tips: [],
    warnings: [],
  })

  const result = await migration0008.migrate({ db: fake.db })

  expect(result).toEqual({ ok: true, transformed: 0 })
  expect(fake.snapshot('recipes').get('r1')).not.toHaveProperty('components')
  expect(fake.snapshot('recipe-versions').get('r1_2')?.content).toEqual({
    kind: 'coffee',
    extraction: { grind: 'Niveau 12' },
  })
})

test('is idempotent — a second run transforms nothing', async () => {
  const fake = resetFakeFirestore()
  seedRecipe(fake, 'r1')
  seedVersion(fake, 'r1', 1, ['dough'])

  await migration0008.migrate({ db: fake.db })

  expect(await migration0008.migrate({ db: fake.db })).toEqual({ ok: true, transformed: 0 })
  expect(fake.snapshot('recipes').get('r1')?.components).toEqual([{ recipe: 'dough', scale: 1 }])
})
