import { describe, expect, test } from 'bun:test'
import {
  bestRating,
  categoryRank,
  nextVersionNumber,
  toTestCount,
  versionToOpen,
  withComponents,
} from '~/domain/recipe/business-rules'
import {
  type ComponentScale,
  DISH_CATEGORY_VALUES,
  type Rating,
  type Recipe,
  type RecipeId,
  type RecipeTitle,
  type RecipeVersion,
  type VersionNumber,
} from '~/domain/recipe/types'

const v = (n: number) => n as VersionNumber
const rating = (n: number) => n as Rating

// Minimal RecipeVersion fixture: bestRating/versionToOpen/toTestCount only read
// `number`, `rating`, `toTest` and `basedOn`. An absent rating means the version was
// never cooked — the domain always writes the rating and the cook date together.
const version = (
  number: number,
  opts: { rating?: number; basedOn?: number; toTest?: true } = {},
): RecipeVersion =>
  ({
    number: v(number),
    ...(opts.rating === undefined ? {} : { rating: rating(opts.rating), executedAt: new Date() }),
    ...(opts.basedOn === undefined ? {} : { basedOn: v(opts.basedOn) }),
    ...(opts.toTest === undefined ? {} : { toTest: opts.toTest }),
  }) as RecipeVersion

describe('categoryRank', () => {
  test('ranks the courses in business order, not alphabetically', () => {
    expect(categoryRank('starter')).toBe(0)
    expect(categoryRank('main')).toBe(1)
    expect(categoryRank('dessert')).toBe(2)
    expect(categoryRank('soup')).toBe(3)
    expect(categoryRank('sauce')).toBe(4)
    expect(categoryRank('baking')).toBe(5)
    expect(categoryRank('drink')).toBe(6)
  })
  test('a starter outranks a dessert which outranks baking (non-alphabetical)', () => {
    expect(categoryRank('starter')).toBeLessThan(categoryRank('dessert'))
    expect(categoryRank('dessert')).toBeLessThan(categoryRank('baking'))
  })
  test('assigns a distinct rank to every category', () => {
    const ranks = DISH_CATEGORY_VALUES.map(categoryRank)
    expect(new Set(ranks).size).toBe(DISH_CATEGORY_VALUES.length)
  })
})

describe('nextVersionNumber', () => {
  test('increments the highest allocated number', () => {
    expect(nextVersionNumber(v(3))).toBe(v(4))
  })
})

describe('toTestCount', () => {
  test('counts nothing when the recipe owes no cook', () => {
    expect(toTestCount([])).toBe(0)
    expect(toTestCount([version(1, { rating: 3 }), version(2)])).toBe(0)
  })
  test('counts the versions waiting to be cooked, whatever the rest went through', () => {
    expect(toTestCount([version(1, { rating: 3 }), version(2, { toTest: true }), version(3)])).toBe(
      1,
    )
  })
})

describe('bestRating', () => {
  test('returns nothing when no version was ever cooked', () => {
    expect(bestRating([])).toBeUndefined()
    expect(bestRating([version(1), version(2)])).toBeUndefined()
  })
  test('returns the highest-rated version', () => {
    const v2 = version(2, { rating: 5 })
    expect(bestRating([version(1, { rating: 3 }), v2, version(3, { rating: 4 })])).toBe(v2)
  })
  test('breaks a rating tie toward the most recent version', () => {
    const v3 = version(3, { rating: 4 })
    expect(bestRating([version(1, { rating: 4 }), v3, version(2, { rating: 4 })])).toBe(v3)
  })
  test('ignores never-cooked versions', () => {
    const v1 = version(1, { rating: 4 })
    expect(bestRating([v1, version(2), version(3)])).toBe(v1)
  })
})

describe('withComponents', () => {
  const poolish = 'poolish-recipe' as RecipeId
  const dough = 'dough-recipe' as RecipeId
  const scale = (n: number) => n as ComponentScale
  const recipe = {
    id: 'bread' as RecipeId,
    title: 'Pain' as RecipeTitle,
  } as Recipe

  test('writes the list and the flat ids as one fact', () => {
    const linked = withComponents(recipe, [
      { recipe: poolish, scale: scale(0.2) },
      { recipe: dough, scale: scale(1) },
    ])

    expect(linked.components).toEqual([
      { recipe: poolish, scale: scale(0.2) },
      { recipe: dough, scale: scale(1) },
    ])
    expect(linked.componentIds).toEqual([poolish, dough])
  })

  test('leaves neither field behind once the last link goes', () => {
    const linked = withComponents(recipe, [{ recipe: poolish, scale: scale(0.2) }])
    const unlinked = withComponents(linked, [])

    expect(unlinked).not.toHaveProperty('components')
    expect(unlinked).not.toHaveProperty('componentIds')
  })
})

describe('versionToOpen', () => {
  test('opens the latest version when nothing was ever rated', () => {
    const v3 = version(3)
    expect(versionToOpen([version(1), version(2), v3])).toBe(v3)
  })
  test('opens the best-rated version', () => {
    const v1 = version(1, { rating: 5 })
    expect(versionToOpen([v1, version(2, { rating: 3 })])).toBe(v1)
  })
  test('breaks a rating tie toward the most recent version', () => {
    const v2 = version(2, { rating: 4 })
    expect(versionToOpen([version(1, { rating: 4 }), v2])).toBe(v2)
  })
  test('never opens a version waiting to be cooked, however recent', () => {
    const best = version(1, { rating: 5 })
    expect(versionToOpen([best, version(2, { basedOn: 1 })])).toBe(best)
  })
  test('opens a lower-rated iteration only when it outranks nothing else', () => {
    const best = version(2, { rating: 5 })
    expect(versionToOpen([version(1, { rating: 3 }), best, version(3, { rating: 4 })])).toBe(best)
  })
})
