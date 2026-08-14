import { describe, expect, test } from 'bun:test'
import { Ingredients, VersionContent, VersionSteps } from '~/domain/recipe/primitives'
import type {
  CoffeeBeanName,
  CoffeeDose,
  CoffeeGrind,
  CoffeeMachine,
  CoffeeTime,
  CoffeeWater,
  CoffeeWaterKind,
  IngredientName,
  IngredientQuantity,
  OvenDuration,
  OvenTemperature,
  StepText,
  ThermomixSpeed,
  ThermomixTime,
} from '~/domain/recipe/types'

describe('VersionContent — a coffee is its parameters, nothing else', () => {
  test('brands a coffee body with no steps at all', () => {
    const content = VersionContent({
      kind: 'coffee',
      beans: { name: 'Belleville — Guji', dose: '18 g' },
      water: { kind: 'Robinet (dureté 3/5)', amount: '36 g' },
      extraction: { grind: 'Niveau 12', time: '28 s' },
      gear: { machine: 'Rancilio Silvia' },
    })
    expect(content).toEqual({
      kind: 'coffee',
      beans: { name: 'Belleville — Guji' as CoffeeBeanName, dose: '18 g' as CoffeeDose },
      water: {
        kind: 'Robinet (dureté 3/5)' as CoffeeWaterKind,
        amount: '36 g' as CoffeeWater,
      },
      extraction: { grind: 'Niveau 12' as CoffeeGrind, time: '28 s' as CoffeeTime },
      gear: { machine: 'Rancilio Silvia' as CoffeeMachine },
    })
    expect('steps' in content).toBe(false)
  })

  test('drops the steps an older client still sends', () => {
    const content = VersionContent({
      kind: 'coffee',
      extraction: { grind: 'fine' },
      steps: [{ text: 'Rincer le filtre', settings: { water: '50 g' } }],
    })
    expect('steps' in content).toBe(false)
  })

  test('keeps the steps of a dish and of a Thermomix recipe', () => {
    expect(
      VersionContent({
        kind: 'dish',
        ingredients: [{ name: 'Beurre', quantity: '170 g' }],
        steps: ['Fondre le beurre'],
      }),
    ).toEqual({
      kind: 'dish',
      ingredients: [{ name: 'Beurre' as IngredientName, quantity: '170 g' as IngredientQuantity }],
      steps: ['Fondre le beurre' as StepText],
    })

    expect(
      VersionContent({
        kind: 'thermomix',
        ingredients: [],
        steps: [{ text: 'Mixer', settings: { time: '3 min', speed: '5' } }],
      }),
    ).toEqual({
      kind: 'thermomix',
      ingredients: [],
      steps: [
        {
          text: 'Mixer' as StepText,
          settings: { time: '3 min' as ThermomixTime, speed: '5' as ThermomixSpeed },
        },
      ],
    })
  })
})

describe('VersionContent — the oven profile', () => {
  test('brands the oven profile of a dish', () => {
    const content = VersionContent({
      kind: 'dish',
      ingredients: [{ name: 'Pâte brisée', quantity: '1 rouleau' }],
      steps: ['Enfourner'],
      oven: { program: 'convection', temperature: '180', duration: 25, core: null },
    })

    expect(content).toEqual({
      kind: 'dish',
      ingredients: [
        { name: 'Pâte brisée' as IngredientName, quantity: '1 rouleau' as IngredientQuantity },
      ],
      steps: ['Enfourner' as StepText],
      oven: {
        program: 'convection',
        temperature: 180 as OvenTemperature,
        duration: 25 as OvenDuration,
      },
    })
  })

  test('a dish that never sees an oven carries no oven key at all', () => {
    const content = VersionContent({ kind: 'dish', ingredients: [], steps: ['Mélanger'] })

    expect('oven' in content).toBe(false)
  })

  test('rejects a temperature no oven can reach', () => {
    expect(() =>
      VersionContent({
        kind: 'dish',
        ingredients: [],
        steps: ['Enfourner'],
        oven: { program: 'convection', temperature: 900 },
      }),
    ).toThrow()
  })

  test('brands the oven profile of a thermomix recipe too — a TM dough still bakes', () => {
    const content = VersionContent({
      kind: 'thermomix',
      ingredients: [],
      steps: [{ text: 'Pétrir', settings: { speed: 'pétrin' } }],
      oven: { program: 'conventional', temperature: 200, duration: 30 },
    })

    expect(content.kind === 'thermomix' && content.oven).toEqual({
      program: 'conventional',
      temperature: 200 as OvenTemperature,
      duration: 30 as OvenDuration,
    })
  })
})

describe('VersionContent — the oven’s own programmes', () => {
  test('keeps the appliance code that makes an assisted cooking reproducible', () => {
    const content = VersionContent({
      kind: 'dish',
      ingredients: [],
      steps: ['Enfourner'],
      oven: {
        program: 'assisted',
        assisted: 'ASSIST_QUICHEANDTARTETHIN',
        temperature: 170,
        duration: 52,
      },
    })

    expect(content.kind === 'dish' && content.oven).toMatchObject({
      program: 'assisted',
      assisted: 'ASSIST_QUICHEANDTARTETHIN',
    })
  })

  test('refuses an assisted programme with no code — half a pair starts nothing', () => {
    expect(() =>
      VersionContent({
        kind: 'dish',
        ingredients: [],
        steps: ['Enfourner'],
        oven: { program: 'assisted', temperature: 170 },
      }),
    ).toThrow()
  })
})

describe('Ingredients — the shopping list on its own', () => {
  test('brands a whole list, order kept', () => {
    expect(Ingredients([{ name: ' Farine ', quantity: '250 g' }])).toEqual([
      { name: 'Farine' as IngredientName, quantity: '250 g' as IngredientQuantity },
    ])
  })

  test('refuses a line with an empty name', () => {
    expect(() => Ingredients([{ name: '  ', quantity: '250 g' }])).toThrow()
  })

  test('accepts an empty list — a recipe with nothing measurable', () => {
    expect(Ingredients([])).toEqual([])
  })
})

describe('VersionSteps — the method on its own', () => {
  test('brands the text and the machine settings that come with it', () => {
    expect(VersionSteps([{ text: 'Mixer', settings: { time: '10 min', reverse: true } }])).toEqual([
      { text: 'Mixer' as StepText, settings: { time: '10 min' as ThermomixTime, reverse: true } },
    ])
  })

  test('a step with no settings at all is a plain step', () => {
    expect(VersionSteps([{ text: 'Enfourner' }])).toEqual([
      { text: 'Enfourner' as StepText, settings: {} },
    ])
  })

  test('reverse false carries no information and is dropped', () => {
    expect(VersionSteps([{ text: 'Mixer', settings: { reverse: false } }])).toEqual([
      { text: 'Mixer' as StepText, settings: {} },
    ])
  })

  test('refuses an empty step text', () => {
    expect(() => VersionSteps([{ text: '   ' }])).toThrow()
  })
})
