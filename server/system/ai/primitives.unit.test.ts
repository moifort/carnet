import { describe, expect, test } from 'bun:test'
import { RECIPE_MAX } from '~/domain/recipe/limits'
import {
  IngredientName,
  IngredientQuantity,
  RecipeTitle,
  StepText,
  ThermomixTime,
} from '~/domain/recipe/primitives'
import {
  parseImportResponse,
  parseProposalResponse,
  parseTipsResponse,
} from '~/system/ai/primitives'
import type { ImportAnalysis } from '~/system/ai/types'

const base = { type: 'thermomix', title: 'Risotto' }

// Unwraps a parse expected to yield an analysis; the union's 'no-recipe-found'
// arm is exercised on its own in the dedicated describe below.
const parsedImport = (payload: object): ImportAnalysis => {
  const result = parseImportResponse(JSON.stringify(payload))
  if (result === 'no-recipe-found') throw new Error('expected an analysis')
  return result
}

describe('parseImportResponse — Thermomix steps', () => {
  test('keeps each step text paired with its normalized nested settings', () => {
    const result = parsedImport({
      ...base,
      steps: [
        { text: 'Mixer les oignons', thermomix: { time: '5 s', temperature: null, speed: '5' } },
        {
          text: 'Servir',
          thermomix: { time: null, temperature: null, speed: null, reverse: null },
        },
        {
          text: 'Cuire',
          thermomix: { time: '14 min', temperature: '100°C', speed: '1', reverse: true },
        },
      ],
    })

    // The AI's explicit nulls are normalized away at the parse boundary: an absent
    // setting is an absent key, a step that sets nothing an entry whose settings
    // are `{}` — and a Thermomix step never carries extraction settings.
    expect(result.steps).toEqual([
      { text: 'Mixer les oignons', thermomix: { time: '5 s', speed: '5' }, coffee: {} },
      { text: 'Servir', thermomix: {}, coffee: {} },
      {
        text: 'Cuire',
        thermomix: { time: '14 min', temperature: '100°C', speed: '1', reverse: true },
        coffee: {},
      },
    ])
  })

  test('makes every step plain when no step carries a setting', () => {
    const result = parsedImport({
      ...base,
      type: 'dish',
      steps: [{ text: 'Émincer' }, { text: 'Saisir', thermomix: { time: null, reverse: false } }],
    })

    expect(result.steps).toEqual([
      { text: 'Émincer', thermomix: {}, coffee: {} },
      { text: 'Saisir', thermomix: {}, coffee: {} },
    ])
  })

  test('tolerates bare string steps as plain steps', () => {
    const result = parsedImport({ ...base, steps: ['Mixer', 'Servir'] })

    expect(result.steps).toEqual([
      { text: 'Mixer', thermomix: {}, coffee: {} },
      { text: 'Servir', thermomix: {}, coffee: {} },
    ])
  })
})

describe('parseImportResponse — coffee', () => {
  const coffeeBase = { type: 'coffee', title: 'Espresso' }

  test('keeps each brewing step paired with its normalized extraction settings', () => {
    const result = parsedImport({
      ...coffeeBase,
      method: 'espresso',
      steps: [
        { text: 'Moudre', coffee: { grind: 'fine', water: null, yield: null } },
        {
          text: 'Extraire',
          coffee: { grind: null, water: null, temperature: '93°C', time: '28 s', yield: '36 g' },
        },
      ],
    })

    expect(result.method).toBe('espresso')
    expect(result.steps).toEqual([
      { text: 'Moudre', thermomix: {}, coffee: { grind: 'fine' } },
      {
        text: 'Extraire',
        thermomix: {},
        coffee: { temperature: '93°C', time: '28 s', yield: '36 g' },
      },
    ])
  })

  test('falls back to `other` rather than forcing a method the coffee was not made with', () => {
    expect(parsedImport({ ...coffeeBase, method: 'siphon', steps: ['Infuser'] }).method).toBe(
      'other',
    )
    expect(parsedImport({ ...coffeeBase, method: null, steps: ['Infuser'] }).method).toBe('other')
  })

  test('hangs no method on a recipe that is not a coffee', () => {
    expect(parsedImport({ ...base, method: 'v60', steps: ['Mixer'] }).method).toBeUndefined()
  })
})

describe('parseImportResponse — dish category', () => {
  test('parses a valid detected category', () => {
    const result = parsedImport({
      type: 'dish',
      category: 'dessert',
      title: 'Tarte',
      steps: ['Cuire'],
    })

    expect(result.category).toBe('dessert')
  })

  test('falls back to main on an invalid category', () => {
    const result = parsedImport({
      type: 'dish',
      category: 'boisson',
      title: 'Soupe',
      steps: ['Cuire'],
    })

    expect(result.category).toBe('main')
  })

  test('falls back to main when the category is missing', () => {
    const result = parsedImport({ type: 'dish', title: 'Soupe', steps: ['Cuire'] })

    expect(result.category).toBe('main')
  })
})

describe('parseImportResponse — ingredients', () => {
  test('parses the ingredient list with names and quantities', () => {
    const result = parsedImport({
      type: 'dish',
      title: 'Ratatouille',
      ingredients: [
        { name: 'Aubergine', quantity: '2 pièces' },
        { name: 'Poivron rouge', quantity: '1 pièce' },
        { name: 'Courgette', quantity: '2 pièces' },
      ],
    })

    expect(result.ingredients).toEqual([
      { name: 'Aubergine', quantity: '2 pièces' },
      { name: 'Poivron rouge', quantity: '1 pièce' },
      { name: 'Courgette', quantity: '2 pièces' },
    ])
  })

  test('defaults to an empty ingredient list when the field is absent', () => {
    // A lone step keeps this a real recipe (no ingredients + no steps is a miss).
    const result = parsedImport({ type: 'dish', title: 'Soupe', steps: ['Cuire'] })

    expect(result.ingredients).toEqual([])
  })
})

describe('parseImportResponse — clamps oversized AI strings to domain limits', () => {
  test('truncates title, ingredients, steps and thermomix settings', () => {
    const result = parsedImport({
      type: 'thermomix',
      title: 'T'.repeat(500),
      ingredients: [{ name: 'N'.repeat(200), quantity: 'Q'.repeat(200) }],
      steps: [{ text: 'E'.repeat(500), thermomix: { time: 't'.repeat(50) } }],
    })

    expect(result.title.length).toBe(RECIPE_MAX.title)
    expect(result.ingredients[0].name.length).toBe(RECIPE_MAX.ingredientName)
    expect(result.ingredients[0].quantity.length).toBe(RECIPE_MAX.ingredientQuantity)
    expect(result.steps[0].text.length).toBe(RECIPE_MAX.stepText)
    expect(result.steps[0].thermomix.time?.length).toBe(RECIPE_MAX.thermomix)

    // Backstop against drift: the clamped values pass the domain constructors,
    // so createRecipe can never 400 on these lengths.
    expect(() => RecipeTitle(result.title)).not.toThrow()
    expect(() => IngredientName(result.ingredients[0].name)).not.toThrow()
    expect(() => IngredientQuantity(result.ingredients[0].quantity)).not.toThrow()
    expect(() => StepText(result.steps[0].text)).not.toThrow()
    expect(() => ThermomixTime(result.steps[0].thermomix.time ?? '')).not.toThrow()
  })
})

describe('parseImportResponse — drops blank items instead of failing', () => {
  test('drops ingredients/steps whose required fields came back blank', () => {
    const result = parsedImport({
      type: 'thermomix',
      title: 'Risotto',
      ingredients: [
        { name: 'Gin', quantity: '30 ml' },
        { name: '   ', quantity: 'x' },
      ],
      steps: [{ text: 'Mixer', thermomix: { time: '5 s' } }, { text: '   ' }, { text: 'Servir' }],
    })

    expect(result.ingredients).toEqual([{ name: 'Gin', quantity: '30 ml' }])
    // Blank step dropped; each surviving step keeps its own settings.
    expect(result.steps).toEqual([
      { text: 'Mixer', thermomix: { time: '5 s' }, coffee: {} },
      { text: 'Servir', thermomix: {}, coffee: {} },
    ])
  })

  test('drops items whose required field is absent or null instead of throwing', () => {
    const result = parsedImport({
      type: 'dish',
      title: 'Soupe',
      ingredients: [{ name: 'Eau', quantity: '1 L' }, { quantity: '2' }, { name: null }],
      steps: [{ thermomix: { time: '5 s' } }, 'Servir'],
    })

    expect(result.ingredients).toEqual([{ name: 'Eau', quantity: '1 L' }])
    expect(result.steps).toEqual([{ text: 'Servir', thermomix: {}, coffee: {} }])
  })

  test('falls back to a default title when the AI returns a blank or null one', () => {
    // A step keeps each payload a real recipe so the title fallback is reached.
    expect(parsedImport({ type: 'dish', title: '   ', steps: ['Cuire'] }).title).toBe(
      'Recette importée',
    )
    expect(parsedImport({ type: 'dish', title: null, steps: ['Cuire'] }).title).toBe(
      'Recette importée',
    )
    expect(parsedImport({ type: 'dish', steps: ['Cuire'] }).title).toBe('Recette importée')
  })

  test('caps runaway arrays at 100 items', () => {
    const many = Array.from({ length: 150 }, (_, i) => ({ name: `Ing ${i}`, quantity: '1' }))
    const result = parsedImport({ type: 'dish', title: 'Big recipe', ingredients: many })

    expect(result.ingredients).toHaveLength(100)
  })
})

describe('parseImportResponse — no recipe found', () => {
  test('returns the sentinel when recipeFound is false', () => {
    expect(parseImportResponse(JSON.stringify({ recipeFound: false }))).toBe('no-recipe-found')
  })

  test('returns the sentinel when a found recipe has no ingredients and no steps', () => {
    expect(
      parseImportResponse(JSON.stringify({ recipeFound: true, type: 'dish', title: 'Vide' })),
    ).toBe('no-recipe-found')
  })

  test('parses normally when recipeFound is absent (tolerated) and a recipe is present', () => {
    const result = parsedImport({ type: 'dish', title: 'Soupe', steps: ['Cuire'] })

    expect(result.title).toBe('Soupe')
    expect(result.steps).toEqual([{ text: 'Cuire', thermomix: {}, coffee: {} }])
  })

  test('parses normally when recipeFound is true and a recipe is present', () => {
    const result = parsedImport({
      recipeFound: true,
      type: 'dish',
      title: 'Ratatouille',
      ingredients: [{ name: 'Aubergine', quantity: '2 pièces' }],
      steps: ['Cuire'],
    })

    expect(result.title).toBe('Ratatouille')
    expect(result.ingredients).toEqual([{ name: 'Aubergine', quantity: '2 pièces' }])
  })
})

describe('parseProposalResponse — full next-version proposal', () => {
  test('parses the change summary, full ingredient/step lists and nested settings', () => {
    const result = parseProposalResponse(
      JSON.stringify({
        changeSummary: 'Bouillon 700 → 650 ml',
        rationale: 'Trop liquide',
        ingredients: [
          { name: 'Veau', quantity: '800 g' },
          { name: 'Bouillon', quantity: '650 ml' },
        ],
        steps: [
          {
            text: 'Saisir',
            thermomix: { time: '5 min', temperature: '120°C', speed: '1' },
            coffee: {},
          },
          { text: 'Mijoter' },
        ],
      }),
    )

    expect(result.changeSummary).toBe('Bouillon 700 → 650 ml')
    expect(result.rationale).toBe('Trop liquide')
    expect(result.ingredients).toEqual([
      { name: 'Veau', quantity: '800 g' },
      { name: 'Bouillon', quantity: '650 ml' },
    ])
    expect(result.steps).toEqual([
      {
        text: 'Saisir',
        thermomix: { time: '5 min', temperature: '120°C', speed: '1' },
        coffee: {},
      },
      { text: 'Mijoter', thermomix: {}, coffee: {} },
    ])
  })

  test('clamps the change summary to the domain limit', () => {
    const result = parseProposalResponse(
      JSON.stringify({
        changeSummary: 'C'.repeat(500),
        rationale: 'ok',
        ingredients: [{ name: 'Riz', quantity: '300 g' }],
        steps: ['Cuire'],
      }),
    )

    expect(result.changeSummary.length).toBe(RECIPE_MAX.changeSummary)
  })

  test('drops blank ingredients/steps', () => {
    const result = parseProposalResponse(
      JSON.stringify({
        changeSummary: 'Ajustement',
        rationale: 'ok',
        ingredients: [
          { name: 'Sel', quantity: '5 g' },
          { name: '  ', quantity: 'x' },
        ],
        steps: [{ text: 'Saler' }, { text: '   ' }],
      }),
    )

    expect(result.ingredients).toEqual([{ name: 'Sel', quantity: '5 g' }])
    expect(result.steps).toEqual([{ text: 'Saler', thermomix: {}, coffee: {} }])
  })
})

describe('tips', () => {
  test('an import keeps the extracted tips, and defaults to none when nulled', () => {
    expect(parsedImport({ ...base, steps: ['Cuire'], tips: ['Servir avec du riz'] }).tips).toEqual([
      'Servir avec du riz',
    ])
    // Gemini nulls a field it was told to leave out — the domain spells it `[]`.
    expect(parsedImport({ ...base, steps: ['Cuire'], tips: null }).tips).toEqual([])
    expect(parsedImport({ ...base, steps: ['Cuire'] }).tips).toEqual([])
  })

  test('a proposal carries its tips, clamped and stripped of blanks', () => {
    const result = parseProposalResponse(
      JSON.stringify({
        changeSummary: 'Ajustement',
        rationale: 'ok',
        ingredients: [{ name: 'Riz', quantity: '300 g' }],
        steps: ['Cuire'],
        tips: ['Servir avec du riz', '   ', 'T'.repeat(500)],
      }),
    )

    expect(result.tips.length).toBe(2)
    expect(result.tips[0]).toBe('Servir avec du riz')
    expect(result.tips[1]?.length).toBe(RECIPE_MAX.tip)
  })

  test('parseTipsResponse returns the merged list, blanks dropped', () => {
    expect(
      parseTipsResponse(JSON.stringify({ tips: ['Servir avec du riz', '', 'Se congèle bien'] })),
    ).toEqual(['Servir avec du riz', 'Se congèle bien'])
    expect(parseTipsResponse(JSON.stringify({ tips: [] }))).toEqual([])
  })
})
