import { beforeEach, describe, expect, mock, test } from 'bun:test'
import type { UserId } from '~/domain/shared/types'
import { fakeFirebase, resetFakeFirestore } from '~/test/fake-firestore'

mock.module('~/system/firebase', fakeFirebase)

const { PortabilityUseCase } = await import('~/system/portability/use-case')
const { EXPORT_SCHEMA_VERSION } = await import('~/system/portability/types')

const userId = 'user-1' as UserId

let fake = resetFakeFirestore()
beforeEach(() => {
  fake = resetFakeFirestore()
})

const seedRecipe = (id: string, title: string, owner: UserId = userId) => {
  fake.seed('recipes', id, {
    id,
    userId: owner,
    type: 'dish',
    category: 'main',
    title,
    lastVersionNumber: 1,
    createdAt: new Date(1000),
    updatedAt: new Date(1000),
  })
}

const seedVersion = (recipeId: string, number: number, owner: UserId = userId) => {
  fake.seed('recipe-versions', `${recipeId}_${number}`, {
    userId: owner,
    recipeId,
    number,
    createdAt: new Date(1000),
    origin: { kind: 'import' },
    content: { kind: 'dish', ingredients: [], steps: [] },
    tips: [],
  })
}

// The shape the app hands back: whatever `exportAll` produced, as JSON.
const backupOf = async (owner: UserId = userId) =>
  JSON.stringify(await PortabilityUseCase.exportAll(owner))

const storedTitles = () =>
  [...fake.snapshot('recipes').values()].map(({ title }) => title as string).sort()

describe('PortabilityUseCase — round trip', () => {
  test('restores every recipe and version the backup carried', async () => {
    seedRecipe('r1', 'Blanquette')
    seedVersion('r1', 1)
    seedVersion('r1', 2)
    const backup = await backupOf()

    const result = await PortabilityUseCase.importAll(userId, backup)

    expect(result).toEqual({ recipes: 1, versions: 2 })
    expect(storedTitles()).toEqual(['Blanquette'])
    expect(fake.snapshot('recipe-versions').size).toBe(2)
  })

  test('restores under the importing cook, so a backup can move accounts', async () => {
    seedRecipe('r1', 'Blanquette')
    seedVersion('r1', 1)
    const backup = await backupOf()

    const other = 'user-2' as UserId
    await PortabilityUseCase.importAll(other, backup)

    expect(fake.snapshot('recipes').get('r1')?.userId).toBe(other)
    expect(fake.snapshot('recipe-versions').get('r1_1')?.userId).toBe(other)
  })

  test('replaces: what the backup does not carry is gone, what it carries wins', async () => {
    seedRecipe('r1', 'Blanquette')
    seedVersion('r1', 1)
    const backup = await backupOf()

    // The notebook moves on after the backup was taken.
    seedRecipe('r1', 'Blanquette revisitée')
    seedRecipe('r2', 'Tarte tatin')
    seedVersion('r2', 1)

    await PortabilityUseCase.importAll(userId, backup)

    // r2 was not in the backup, so it goes; r1 is back to what the backup held.
    expect(storedTitles()).toEqual(['Blanquette'])
    expect([...fake.snapshot('recipe-versions').keys()]).toEqual(['r1_1'])
  })

  test('leaves another cook’s notebook alone', async () => {
    const other = 'user-2' as UserId
    seedRecipe('r1', 'Blanquette')
    const backup = await backupOf()
    seedRecipe('foreign', 'Pas la mienne', other)
    seedVersion('foreign', 1, other)

    await PortabilityUseCase.importAll(userId, backup)

    expect(fake.snapshot('recipes').get('foreign')?.title).toBe('Pas la mienne')
    expect(fake.snapshot('recipe-versions').get('foreign_1')).toBeDefined()
  })
})

describe('PortabilityUseCase — the restore never empties the notebook', () => {
  test('deletes only what the backup does not carry, never a row it restores', async () => {
    seedRecipe('r1', 'Blanquette')
    seedVersion('r1', 1)
    const backup = await backupOf()
    seedRecipe('r2', 'Tarte tatin')
    seedVersion('r2', 1)

    await PortabilityUseCase.importAll(userId, backup)

    // Wiping the notebook and rewriting it deletes r1 and r1_1 on the way — a window
    // with no copy of them anywhere. Only the rows the backup does not carry are
    // ever enqueued for deletion.
    const deleted = fake.batches
      .flatMap(({ ops }) => ops)
      .filter(({ type }) => type === 'delete')
      .map(({ ref }) => ref.id)
      .sort()
    expect(deleted).toEqual(['r2', 'r2_1'])
  })

  test('the backup is already written when the delete pass dies', async () => {
    seedRecipe('r1', 'Blanquette')
    const backup = await backupOf()
    // The notebook drifts after the backup, and gains a row the restore must remove.
    seedRecipe('r1', 'Blanquette modifiée')
    seedRecipe('r2', 'Tarte tatin')

    // The delete pass dies — a timed-out function, a dropped connection.
    fake.failCommitsWith(new Error('function timed out'))
    await expect(PortabilityUseCase.importAll(userId, backup)).rejects.toThrow('function timed out')

    // The restore still happened: writing first means a crash costs the cook the
    // cleanup, never the data. Deleting first would have left them holding nothing.
    expect(fake.snapshot('recipes').get('r1')?.title).toBe('Blanquette')
    expect(fake.snapshot('recipes').get('r2')).toBeDefined()
  })
})

describe('PortabilityUseCase — refusing a payload', () => {
  const envelope = (overrides: Record<string, unknown>) =>
    JSON.stringify({
      schemaVersion: EXPORT_SCHEMA_VERSION,
      exportedAt: new Date(1000),
      userId,
      recipes: [],
      versions: [],
      ...overrides,
    })

  test('refuses text that is not JSON', async () => {
    expect(await PortabilityUseCase.importAll(userId, 'not json')).toEqual({
      error: 'invalid-json',
    })
  })

  test('refuses a schema version it does not speak', async () => {
    const payload = envelope({ schemaVersion: EXPORT_SCHEMA_VERSION + 1 })
    expect(await PortabilityUseCase.importAll(userId, payload)).toEqual({
      error: `unsupported-schema-version:${EXPORT_SCHEMA_VERSION + 1}`,
    })
  })

  // The identity fields are the storage keys: a record missing one would be written
  // under a key built from `undefined`, corrupting the notebook instead of failing.
  test('refuses a recipe with no id', async () => {
    const payload = envelope({ recipes: [{ userId, title: 'Sans id' }] })
    expect(await PortabilityUseCase.importAll(userId, payload)).toEqual({
      error: 'invalid-schema',
    })
    expect(fake.snapshot('recipes').size).toBe(0)
  })

  test('refuses a version with no recipe or no number', async () => {
    expect(
      await PortabilityUseCase.importAll(userId, envelope({ versions: [{ userId }] })),
    ).toEqual({ error: 'invalid-schema' })
    const numberless = envelope({ versions: [{ userId, recipeId: 'r1' }] })
    expect(await PortabilityUseCase.importAll(userId, numberless)).toEqual({
      error: 'invalid-schema',
    })
    expect(fake.snapshot('recipe-versions').size).toBe(0)
  })

  test('keeps a field it does not know about, so an older backup still restores', async () => {
    const payload = envelope({
      recipes: [{ id: 'r1', userId, title: 'Blanquette', retiredField: 'kept' }],
    })
    expect(await PortabilityUseCase.importAll(userId, payload)).toEqual({
      recipes: 1,
      versions: 0,
    })
    expect(fake.snapshot('recipes').get('r1')?.retiredField).toBe('kept')
  })
})
