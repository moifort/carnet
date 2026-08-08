import { describe, expect, test } from 'bun:test'
import { emptyCoffeeParameters, restDays, toCoffeeParameters } from '~/domain/recipe/content/coffee'
import type { RecipeVersion } from '~/domain/recipe/types'

describe('toCoffeeParameters', () => {
  test('turns the boundaries’ nulls into absent keys', () => {
    const params = toCoffeeParameters({
      beans: { name: 'Belleville — Guji', country: null, producer: null, dose: '18 g' },
      water: { kind: 'Robinet (dureté 3/5)', amount: '300 g', temperature: null },
      extraction: { grind: 'Niveau 12', time: '28 s', yield: null },
      milk: null,
      gear: { machine: 'Rancilio Silvia', grinder: null },
    } as never)
    expect(params.beans).toEqual({ name: 'Belleville — Guji', dose: '18 g' } as never)
    expect(params.water).toEqual({ kind: 'Robinet (dureté 3/5)', amount: '300 g' } as never)
    expect(params.extraction).toEqual({ grind: 'Niveau 12', time: '28 s' } as never)
    expect(params.gear).toEqual({ machine: 'Rancilio Silvia' } as never)
  })

  test('drops the milk entirely when none of its fields is set', () => {
    expect(
      toCoffeeParameters({ milk: { kind: null, amount: null, temperature: null } as never }).milk,
    ).toBeUndefined()
  })

  test('keeps the milk as soon as one field is set', () => {
    expect(
      toCoffeeParameters({ milk: { kind: 'Avoine Oatly', amount: '150 ml' } as never }).milk,
    ).toEqual({ kind: 'Avoine Oatly', amount: '150 ml' } as never)
  })

  test('renders an empty payload as four total, empty blocks and no milk', () => {
    expect(toCoffeeParameters({})).toEqual(emptyCoffeeParameters)
    expect(emptyCoffeeParameters.milk).toBeUndefined()
  })
})

describe('restDays', () => {
  const version = (roastedOn?: Date, createdAt = new Date('2026-06-26T08:00:00Z')) =>
    ({
      createdAt,
      content: {
        ...emptyCoffeeParameters,
        kind: 'coffee',
        ...(roastedOn ? { beans: { roastedOn } } : {}),
      },
    }) as unknown as RecipeVersion

  test('counts the full days between the roast and the version', () => {
    expect(restDays(version(new Date('2026-06-12T09:00:00Z')))).toBe(13)
  })

  test('is zero on a coffee brewed the day it was roasted', () => {
    expect(restDays(version(new Date('2026-06-26T06:00:00Z')))).toBe(0)
  })

  test('is absent without a roast date, and on anything that is not a coffee', () => {
    expect(restDays(version())).toBeUndefined()
    expect(
      restDays({
        createdAt: new Date(),
        content: { kind: 'dish', ingredients: [], steps: [] },
      } as unknown as RecipeVersion),
    ).toBeUndefined()
  })

  test('is absent when the roast date is in the future — a typo never reads as a negative rest', () => {
    expect(restDays(version(new Date('2026-07-02T09:00:00Z')))).toBeUndefined()
  })
})
