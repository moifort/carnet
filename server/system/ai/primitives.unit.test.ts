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
  parseCoffeeImportResponse,
  parseCoffeeProposalResponse,
  parseCookingImportResponse,
  parseCookingProposalResponse,
  parseTipsResponse,
} from '~/system/ai/primitives'
import type { CoffeeImportAnalysis, CookingImportAnalysis } from '~/system/ai/types'

const base = { type: 'thermomix', title: 'Risotto' }
const coffeeBase = { method: 'espresso', title: 'Espresso' }

// Unwraps a parse expected to yield an analysis; the union's 'no-recipe-found'
// arm is exercised on its own in the dedicated describes below.
const parsedCooking = (payload: object): CookingImportAnalysis => {
  const result = parseCookingImportResponse(JSON.stringify(payload))
  if (result === 'no-recipe-found') throw new Error('expected an analysis')
  return result
}

const parsedCoffee = (payload: object): CoffeeImportAnalysis => {
  const result = parseCoffeeImportResponse(JSON.stringify(payload))
  if (result === 'no-recipe-found') throw new Error('expected an analysis')
  return result
}

describe('parseCookingImportResponse — Thermomix steps', () => {
  test('keeps each step text paired with its normalized nested settings', () => {
    const result = parsedCooking({
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
    // are `{}`.
    expect(result.steps).toEqual([
      { text: 'Mixer les oignons', thermomix: { time: '5 s', speed: '5' } },
      { text: 'Servir', thermomix: {} },
      {
        text: 'Cuire',
        thermomix: { time: '14 min', temperature: '100°C', speed: '1', reverse: true },
      },
    ])
  })

  test('makes every step plain when no step carries a setting', () => {
    const result = parsedCooking({
      ...base,
      type: 'dish',
      steps: [{ text: 'Émincer' }, { text: 'Saisir', thermomix: { time: null, reverse: false } }],
    })

    expect(result.steps).toEqual([
      { text: 'Émincer', thermomix: {} },
      { text: 'Saisir', thermomix: {} },
    ])
  })

  test('tolerates bare string steps as plain steps', () => {
    const result = parsedCooking({ ...base, steps: ['Mixer', 'Servir'] })

    expect(result.steps).toEqual([
      { text: 'Mixer', thermomix: {} },
      { text: 'Servir', thermomix: {} },
    ])
  })

  test('never answers a coffee — that source belongs to the other flow', () => {
    expect(parsedCooking({ type: 'coffee', title: 'Espresso', steps: ['Extraire'] }).type).toBe(
      'dish',
    )
  })
})

describe('parseCoffeeImportResponse', () => {
  test('reads the parameters off the source, nulls becoming absent fields', () => {
    const result = parsedCoffee({
      ...coffeeBase,
      parameters: {
        beans: {
          name: 'Belleville — Guji',
          country: 'Éthiopie',
          producer: null,
          roastedOn: '2026-06-12',
          dose: '18 g',
        },
        water: { kind: 'Robinet', amount: '36 g', temperature: '93°C' },
        extraction: { grind: 'Niveau 12', time: '28 s', yield: '36 g' },
        milk: null,
        gear: { machine: 'Rancilio Silvia', grinder: null },
      },
    })

    expect(result.parameters).toEqual({
      beans: {
        name: 'Belleville — Guji',
        country: 'Éthiopie',
        roastedOn: '2026-06-12',
        dose: '18 g',
      },
      water: { kind: 'Robinet', amount: '36 g', temperature: '93°C' },
      extraction: { grind: 'Niveau 12', time: '28 s', yield: '36 g' },
      gear: { machine: 'Rancilio Silvia' },
    })
    expect(result.method).toBe('espresso')
  })

  test('falls back to `other` rather than forcing a method the coffee was not made with', () => {
    const parameters = { extraction: { grind: 'moyenne' } }
    expect(parsedCoffee({ ...coffeeBase, method: 'siphon', parameters }).method).toBe('other')
    expect(parsedCoffee({ ...coffeeBase, method: null, parameters }).method).toBe('other')
  })

  test('keeps the milk of a milk drink and drops an empty one', () => {
    const latte = parsedCoffee({
      ...coffeeBase,
      method: 'latte',
      parameters: { milk: { kind: 'Avoine Oatly', amount: '150 ml', temperature: null } },
    })
    expect(latte.parameters.milk).toEqual({ kind: 'Avoine Oatly', amount: '150 ml' })

    const espresso = parsedCoffee({
      ...coffeeBase,
      parameters: {
        extraction: { time: '28 s' },
        milk: { kind: null, amount: null, temperature: null },
      },
    })
    expect(espresso.parameters.milk).toBeUndefined()
  })

  test('stands as a coffee on a single dial, and is no coffee with none at all', () => {
    expect(
      parseCoffeeImportResponse(
        JSON.stringify({ ...coffeeBase, parameters: { beans: { dose: '18 g' } } }),
      ),
    ).not.toBe('no-recipe-found')
    expect(parseCoffeeImportResponse(JSON.stringify({ ...coffeeBase, parameters: {} }))).toBe(
      'no-recipe-found',
    )
    expect(parseCoffeeImportResponse(JSON.stringify({ coffeeFound: false }))).toBe(
      'no-recipe-found',
    )
  })

  test('falls back to a default title when the AI returns a blank or null one', () => {
    const parameters = { extraction: { grind: 'fine' } }
    expect(parsedCoffee({ ...coffeeBase, title: '   ', parameters }).title).toBe('Café importé')
    expect(parsedCoffee({ ...coffeeBase, title: null, parameters }).title).toBe('Café importé')
  })

  test('clamps oversized parameter values to the domain limits', () => {
    const result = parsedCoffee({
      ...coffeeBase,
      title: 'T'.repeat(500),
      parameters: {
        beans: { name: 'N'.repeat(500) },
        extraction: { grind: 'G'.repeat(200) },
      },
    })

    expect(result.title.length).toBe(RECIPE_MAX.title)
    expect(result.parameters.beans.name?.length).toBe(RECIPE_MAX.coffeeLabel)
    expect(result.parameters.extraction.grind?.length).toBe(RECIPE_MAX.coffee)
    expect(() => RecipeTitle(result.title)).not.toThrow()
  })
})

describe('parseCookingImportResponse — dish category', () => {
  test('parses a valid detected category', () => {
    const result = parsedCooking({
      type: 'dish',
      category: 'dessert',
      title: 'Tarte',
      steps: ['Cuire'],
    })

    expect(result.category).toBe('dessert')
  })

  test('falls back to main on an invalid or missing category', () => {
    expect(
      parsedCooking({ type: 'dish', category: 'boisson', title: 'Soupe', steps: ['Cuire'] })
        .category,
    ).toBe('main')
    expect(parsedCooking({ type: 'dish', title: 'Soupe', steps: ['Cuire'] }).category).toBe('main')
  })
})

describe('parseCookingImportResponse — ingredients', () => {
  test('parses the ingredient list with names and quantities', () => {
    const result = parsedCooking({
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
    const result = parsedCooking({ type: 'dish', title: 'Soupe', steps: ['Cuire'] })

    expect(result.ingredients).toEqual([])
  })
})

describe('parseCookingImportResponse — clamps oversized AI strings to domain limits', () => {
  test('truncates title, ingredients, steps and thermomix settings', () => {
    const result = parsedCooking({
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

describe('parseCookingImportResponse — drops blank items instead of failing', () => {
  test('drops ingredients/steps whose required fields came back blank', () => {
    const result = parsedCooking({
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
      { text: 'Mixer', thermomix: { time: '5 s' } },
      { text: 'Servir', thermomix: {} },
    ])
  })

  test('drops items whose required field is absent or null instead of throwing', () => {
    const result = parsedCooking({
      type: 'dish',
      title: 'Soupe',
      ingredients: [{ name: 'Eau', quantity: '1 L' }, { quantity: '2' }, { name: null }],
      steps: [{ thermomix: { time: '5 s' } }, 'Servir'],
    })

    expect(result.ingredients).toEqual([{ name: 'Eau', quantity: '1 L' }])
    expect(result.steps).toEqual([{ text: 'Servir', thermomix: {} }])
  })

  test('falls back to a default title when the AI returns a blank or null one', () => {
    // A step keeps each payload a real recipe so the title fallback is reached.
    expect(parsedCooking({ type: 'dish', title: '   ', steps: ['Cuire'] }).title).toBe(
      'Recette importée',
    )
    expect(parsedCooking({ type: 'dish', title: null, steps: ['Cuire'] }).title).toBe(
      'Recette importée',
    )
    expect(parsedCooking({ type: 'dish', steps: ['Cuire'] }).title).toBe('Recette importée')
  })

  test('caps runaway arrays at 100 items', () => {
    const many = Array.from({ length: 150 }, (_, i) => ({ name: `Ing ${i}`, quantity: '1' }))
    const result = parsedCooking({ type: 'dish', title: 'Big recipe', ingredients: many })

    expect(result.ingredients).toHaveLength(100)
  })
})

describe('parseCookingImportResponse — no recipe found', () => {
  test('returns the sentinel when recipeFound is false', () => {
    expect(parseCookingImportResponse(JSON.stringify({ recipeFound: false }))).toBe(
      'no-recipe-found',
    )
  })

  test('returns the sentinel when a found recipe has no ingredients and no steps', () => {
    expect(
      parseCookingImportResponse(
        JSON.stringify({ recipeFound: true, type: 'dish', title: 'Vide' }),
      ),
    ).toBe('no-recipe-found')
  })

  test('parses normally when recipeFound is absent (tolerated) and a recipe is present', () => {
    const result = parsedCooking({ type: 'dish', title: 'Soupe', steps: ['Cuire'] })

    expect(result.title).toBe('Soupe')
    expect(result.steps).toEqual([{ text: 'Cuire', thermomix: {} }])
  })
})

describe('parseCookingProposalResponse — full next-version proposal', () => {
  test('parses the change summary, full ingredient/step lists and nested settings', () => {
    const result = parseCookingProposalResponse(
      JSON.stringify({
        changeSummary: 'Bouillon 700 → 650 ml',
        rationale: 'Trop liquide',
        ingredients: [
          { name: 'Veau', quantity: '800 g' },
          { name: 'Bouillon', quantity: '650 ml' },
        ],
        steps: [
          { text: 'Saisir', thermomix: { time: '5 min', temperature: '120°C', speed: '1' } },
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
      { text: 'Saisir', thermomix: { time: '5 min', temperature: '120°C', speed: '1' } },
      { text: 'Mijoter', thermomix: {} },
    ])
  })

  test('clamps the change summary to the domain limit', () => {
    const result = parseCookingProposalResponse(
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
    const result = parseCookingProposalResponse(
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
    expect(result.steps).toEqual([{ text: 'Saler', thermomix: {} }])
  })
})

describe('parseCoffeeProposalResponse — the single dial that moved', () => {
  test('parses the complete parameters of the next version', () => {
    const result = parseCoffeeProposalResponse(
      JSON.stringify({
        changeSummary: 'Mouture Niveau 12 → Niveau 10',
        rationale: 'La tasse était acide.',
        parameters: {
          beans: { name: 'Belleville — Guji', dose: '18 g' },
          extraction: { grind: 'Niveau 10', time: '28 s' },
          gear: { machine: 'Rancilio Silvia' },
        },
        tips: [],
      }),
    )

    expect(result.changeSummary).toBe('Mouture Niveau 12 → Niveau 10')
    expect(result.parameters).toEqual({
      beans: { name: 'Belleville — Guji', dose: '18 g' },
      water: {},
      extraction: { grind: 'Niveau 10', time: '28 s' },
      gear: { machine: 'Rancilio Silvia' },
    })
  })

  test('leaves a parameter the model returned empty empty — it proposes the field, not a value', () => {
    const result = parseCoffeeProposalResponse(
      JSON.stringify({
        changeSummary: 'Dose 18 → 17 g',
        rationale: 'ok',
        parameters: {
          beans: { dose: '17 g' },
          water: { kind: null, amount: null, temperature: null },
        },
        tips: [],
      }),
    )

    expect(result.parameters.water).toEqual({})
  })
})

describe('tips', () => {
  test('an import keeps the extracted tips, and defaults to none when nulled', () => {
    expect(parsedCooking({ ...base, steps: ['Cuire'], tips: ['Servir avec du riz'] }).tips).toEqual(
      ['Servir avec du riz'],
    )
    // Gemini nulls a field it was told to leave out — the domain spells it `[]`.
    expect(parsedCooking({ ...base, steps: ['Cuire'], tips: null }).tips).toEqual([])
    expect(parsedCooking({ ...base, steps: ['Cuire'] }).tips).toEqual([])
  })

  test('a proposal carries its tips, clamped and stripped of blanks', () => {
    const result = parseCookingProposalResponse(
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

describe('parseCookingImportResponse — the oven profile', () => {
  test('reads the profile the model extracted from the steps', () => {
    const result = parsedCooking({
      ...base,
      recipeFound: true,
      steps: [{ text: 'Enfourner', thermomix: {} }],
      oven: { program: 'convection', temperature: 180, duration: 30, core: null },
    })

    expect(result.oven).toEqual({ program: 'convection', temperature: 180, duration: 30 })
  })

  test('a recipe with no oven step carries no profile at all', () => {
    const result = parsedCooking({
      ...base,
      recipeFound: true,
      steps: [{ text: 'Mélanger', thermomix: {} }],
      oven: null,
    })

    expect(result.oven).toBeUndefined()
  })

  test('drops a hallucinated temperature instead of failing the whole import', () => {
    const result = parsedCooking({
      ...base,
      recipeFound: true,
      steps: [{ text: 'Enfourner', thermomix: {} }],
      oven: { program: 'convection', temperature: 1800 },
    })

    expect(result.oven).toBeUndefined()
  })

  test('drops a heating function this notebook has no word for', () => {
    const result = parsedCooking({
      ...base,
      recipeFound: true,
      steps: [{ text: 'Enfourner', thermomix: {} }],
      oven: { program: 'AIR_FRY_9000', temperature: 200 },
    })

    expect(result.oven).toBeUndefined()
  })

  test('keeps a probe cook, which has a core target and no duration', () => {
    const result = parsedCooking({
      ...base,
      recipeFound: true,
      steps: [{ text: 'Enfourner', thermomix: {} }],
      oven: { program: 'conventional', temperature: 160, duration: null, core: 63 },
    })

    expect(result.oven).toEqual({ program: 'conventional', temperature: 160, core: 63 })
  })
})

describe('parseCookingProposalResponse — the oven profile', () => {
  test('carries the profile an iteration moved', () => {
    const result = parseCookingProposalResponse(
      JSON.stringify({
        changeSummary: 'Cuisson 30 → 25 min',
        rationale: 'Trop cuit au dernier essai',
        ingredients: [],
        steps: [],
        tips: [],
        oven: { program: 'convection', temperature: 180, duration: 25 },
      }),
    )

    expect(result.oven).toEqual({ program: 'convection', temperature: 180, duration: 25 })
  })

  test('an iteration that touches nothing about the oven carries no profile', () => {
    const result = parseCookingProposalResponse(
      JSON.stringify({
        changeSummary: 'Sel 8 → 6 g',
        rationale: 'Trop salé',
        ingredients: [],
        steps: [],
        tips: [],
        oven: null,
      }),
    )

    expect(result.oven).toBeUndefined()
  })
})
