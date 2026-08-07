import { describe, expect, test } from 'bun:test'
import {
  coffeeSteps,
  type LooseCoffeeSettings,
  toCoffeeSettings,
} from '~/domain/recipe/content/coffee'
import type {
  CoffeeGrind,
  CoffeeTemperature,
  CoffeeTime,
  CoffeeWater,
  CoffeeYield,
  StepText,
} from '~/domain/recipe/types'

const texts = (...s: string[]) => s.map((x) => x as StepText)
const settings: LooseCoffeeSettings = {
  temperature: '93°C' as CoffeeTemperature,
  time: '28 s' as CoffeeTime,
}

describe('coffeeSteps', () => {
  test('pairs each step text with its aligned settings', () => {
    expect(coffeeSteps(texts('Moudre', 'Extraire'), [{}, settings])).toEqual([
      { text: 'Moudre' as StepText, settings: {} },
      { text: 'Extraire' as StepText, settings },
    ])
  })

  test('drops settings whose length differs from the steps — every step turns plain', () => {
    expect(coffeeSteps(texts('Moudre', 'Extraire'), [settings])).toEqual([
      { text: 'Moudre' as StepText, settings: {} },
      { text: 'Extraire' as StepText, settings: {} },
    ])
  })

  test('drops settings when every entry is empty — every step turns plain', () => {
    expect(coffeeSteps(texts('Moudre', 'Extraire'), [{}, {}])).toEqual([
      { text: 'Moudre' as StepText, settings: {} },
      { text: 'Extraire' as StepText, settings: {} },
    ])
  })

  test('keeps a grind alone as a setting', () => {
    expect(
      coffeeSteps(texts('Moudre', 'Extraire'), [{ grind: 'fine' as CoffeeGrind }, {}]),
    ).toEqual([
      { text: 'Moudre' as StepText, settings: { grind: 'fine' as CoffeeGrind } },
      { text: 'Extraire' as StepText, settings: {} },
    ])
  })

  test('returns [] for an empty step list', () => {
    expect(coffeeSteps([], [])).toEqual([])
  })
})

describe('toCoffeeSettings', () => {
  test('maps an entry with no field to the empty settings object (a plain step)', () => {
    expect(toCoffeeSettings([{}, {}])).toEqual([{}, {}])
  })

  test('drops absent fields', () => {
    expect(toCoffeeSettings([{ time: '4 min' as CoffeeTime, grind: undefined }])).toEqual([
      { time: '4 min' as CoffeeTime },
    ])
  })

  test('assembles a fully-populated setting — the espresso shot', () => {
    const entry = {
      grind: 'fine' as CoffeeGrind,
      water: '36 g' as CoffeeWater,
      temperature: '93°C' as CoffeeTemperature,
      time: '28 s' as CoffeeTime,
      yield: '36 g' as CoffeeYield,
    }
    expect(toCoffeeSettings([entry])).toEqual([entry])
  })
})
