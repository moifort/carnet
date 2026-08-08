import { describe, expect, test } from 'bun:test'
import { VersionContent } from '~/domain/recipe/primitives'
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
