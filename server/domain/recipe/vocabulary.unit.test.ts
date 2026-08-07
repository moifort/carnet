import { describe, expect, test } from 'bun:test'
import type { CoffeeParameters } from '~/domain/recipe/content/coffee'
import type {
  CoffeeBeanName,
  CoffeeMachine,
  CoffeeMilkKind,
  CoffeeTime,
  CoffeeWaterKind,
} from '~/domain/recipe/types'
import { emptyVocabulary, learnedVocabulary, VOCABULARY_MAX } from '~/domain/recipe/vocabulary'
import type { UserId } from '~/domain/shared/types'

const userId = 'user-1' as UserId
const params = (over: Partial<CoffeeParameters> = {}): CoffeeParameters => ({
  beans: {},
  water: {},
  extraction: {},
  gear: {},
  ...over,
})

describe('learnedVocabulary', () => {
  test('learns every free-text value of a saved version', () => {
    const learned = learnedVocabulary(
      emptyVocabulary(userId),
      params({
        beans: { name: 'Belleville — Guji' as CoffeeBeanName },
        water: { kind: 'Robinet (dureté 3/5)' as CoffeeWaterKind },
        gear: { machine: 'Rancilio Silvia' as CoffeeMachine },
      }),
    )
    expect(learned.beanNames).toEqual(['Belleville — Guji' as CoffeeBeanName])
    expect(learned.waterKinds).toEqual(['Robinet (dureté 3/5)' as CoffeeWaterKind])
    expect(learned.machines).toEqual(['Rancilio Silvia' as CoffeeMachine])
    expect(learned.grinders).toEqual([])
  })

  test('puts a value used again back on top rather than twice in the list', () => {
    const first = learnedVocabulary(
      emptyVocabulary(userId),
      params({ beans: { name: 'Guji' as CoffeeBeanName } }),
    )
    const second = learnedVocabulary(first, params({ beans: { name: 'Sidamo' as CoffeeBeanName } }))
    const third = learnedVocabulary(second, params({ beans: { name: 'Guji' as CoffeeBeanName } }))
    expect(third.beanNames).toEqual(['Guji', 'Sidamo'] as CoffeeBeanName[])
  })

  test('keeps the list capped, dropping the oldest value', () => {
    const filled = Array.from({ length: VOCABULARY_MAX }, (_, i) => `Café ${i}` as CoffeeBeanName)
    const current = { ...emptyVocabulary(userId), beanNames: filled }
    const learned = learnedVocabulary(
      current,
      params({ beans: { name: 'Nouveau' as CoffeeBeanName } }),
    )
    expect(learned.beanNames).toHaveLength(VOCABULARY_MAX)
    expect(learned.beanNames[0]).toBe('Nouveau' as CoffeeBeanName)
    expect(learned.beanNames).not.toContain(`Café ${VOCABULARY_MAX - 1}` as CoffeeBeanName)
  })

  test('learns the milk of a milk drink, and nothing from a drink without one', () => {
    const withMilk = learnedVocabulary(
      emptyVocabulary(userId),
      params({ milk: { kind: 'Avoine Oatly' as CoffeeMilkKind } }),
    )
    expect(withMilk.milkKinds).toEqual(['Avoine Oatly' as CoffeeMilkKind])
    expect(learnedVocabulary(emptyVocabulary(userId), params()).milkKinds).toEqual([])
  })

  test('learns nothing from a version with no free text — a measurement is not vocabulary', () => {
    const current = emptyVocabulary(userId)
    const learned = learnedVocabulary(
      current,
      params({ extraction: { time: '28 s' as CoffeeTime } }),
    )
    expect({ ...learned, updatedAt: current.updatedAt }).toEqual(current)
  })
})
