import { beforeEach, describe, expect, mock, test } from 'bun:test'
import { graphql } from 'graphql'
import type { UserId } from '~/domain/shared/types'
import { fakeFirebase, resetFakeFirestore } from '~/test/fake-firestore'

mock.module('~/system/firebase', fakeFirebase)

const { schema } = await import('~/domain/shared/graphql/schema')
const { recipeSatelliteLoaders } = await import('~/domain/shared/graphql/loaders')

const userId = 'user-1' as UserId

let fake = resetFakeFirestore()
beforeEach(() => {
  fake = resetFakeFirestore()
})

// One request = one loader set, exactly as routes/graphql.ts builds it.
const execute = (source: string) =>
  graphql({
    schema,
    source,
    contextValue: { userId, event: undefined as never, loaders: recipeSatelliteLoaders() },
  })

const createLasagna = `
  mutation {
    createRecipe(input: {
      type: DISH
      category: MAIN
      title: "Lasagnes de mamie"
      sourceLabel: "Marmiton"
      content: { dish: {
        ingredients: [{ name: "Farine", quantity: "250 g" }]
        steps: ["Monter les couches", "Enfourner à 200°C"]
      } }
    }) {
      id
      title
      category
      versionCount
      bestRating
      versionToOpen { number tried rating }
    }
  }
`

const createdId = async () => {
  const result = await execute(createLasagna)
  expect(result.errors).toBeUndefined()
  return (result.data as { createRecipe: { id: string } }).createRecipe.id
}

describe('createRecipe mutation', () => {
  test('turns an import into a recipe opened on its untried v1', async () => {
    const result = await execute(createLasagna)
    expect(result.errors).toBeUndefined()
    expect(result.data?.createRecipe).toMatchObject({
      title: 'Lasagnes de mamie',
      category: 'MAIN',
      versionCount: 1,
      // Nothing cooked yet: no rating anywhere, and v1 is the version to open.
      bestRating: null,
      versionToOpen: { number: 1, tried: false, rating: null },
    })

    const id = (result.data as { createRecipe: { id: string } }).createRecipe.id
    expect(fake.snapshot('recipes').get(id)?.type).toBe('dish')
    expect(fake.snapshot('recipe-versions').get(`${id}_1`)?.origin).toEqual({
      kind: 'import',
      detail: 'Marmiton',
    })
  })

  test('refuses a body that does not match the recipe type', async () => {
    const result = await execute(`
      mutation {
        createRecipe(input: {
          type: DISH
          category: MAIN
          title: "Lasagnes de mamie"
          content: { thermomix: { ingredients: [], steps: [{ text: "Mixer", settings: {} }] } }
        }) { id }
      }
    `)
    expect(result.errors?.[0]?.extensions?.code).toBe('CONTENT_TYPE_MISMATCH')
  })

  test('saves a coffee with its brew method, its parameters and its per-step settings', async () => {
    const result = await execute(`
      mutation {
        createRecipe(input: {
          type: COFFEE
          category: DRINK
          method: V60
          title: "V60 Éthiopie Guji"
          content: { coffee: {
            beans: { name: "Belleville — Guji", country: "Éthiopie", dose: "18 g" }
            water: { kind: "Robinet (dureté 3/5)", amount: "300 g", temperature: "93°C" }
            extraction: { grind: "moyenne", time: "2 min 30" }
            gear: { machine: "Hario V60 02", grinder: "Niche Zero" }
            steps: [
              { text: "Moudre", settings: { grind: "moyenne" } }
              { text: "Verser l’eau de pré-infusion", settings: { water: "50 g", temperature: "93°C", time: "45 s" } }
            ]
          } }
        }) {
          method
          category
          versionToOpen {
            restDays
            content {
              ... on CoffeeContent {
                beans { name country producer roastedOn dose }
                water { kind amount temperature }
                extraction { grind time yield }
                milk { kind }
                gear { machine grinder }
                steps { text settings { grind water temperature time yield } }
              }
            }
          }
        }
      }
    `)
    expect(result.errors).toBeUndefined()
    expect(result.data?.createRecipe).toMatchObject({
      method: 'V60',
      category: 'DRINK',
      versionToOpen: {
        // No roast date was given, so nothing says how long the beans rested.
        restDays: null,
        content: {
          beans: {
            name: 'Belleville — Guji',
            country: 'Éthiopie',
            producer: null,
            roastedOn: null,
            dose: '18 g',
          },
          water: { kind: 'Robinet (dureté 3/5)', amount: '300 g', temperature: '93°C' },
          extraction: { grind: 'moyenne', time: '2 min 30', yield: null },
          // A V60 has no milk: the block is absent, not empty.
          milk: null,
          gear: { machine: 'Hario V60 02', grinder: 'Niche Zero' },
          steps: [
            {
              text: 'Moudre',
              settings: {
                grind: 'moyenne',
                water: null,
                temperature: null,
                time: null,
                yield: null,
              },
            },
            {
              text: 'Verser l’eau de pré-infusion',
              settings: {
                grind: null,
                water: '50 g',
                temperature: '93°C',
                time: '45 s',
                yield: null,
              },
            },
          ],
        },
      },
    })
  })

  test('refuses a coffee with no brew method', async () => {
    const result = await execute(`
      mutation {
        createRecipe(input: {
          type: COFFEE
          category: DRINK
          title: "Espresso"
          content: { coffee: { steps: [{ text: "Extraire", settings: {} }] } }
        }) { id }
      }
    `)
    expect(result.errors?.[0]?.extensions?.code).toBe('METHOD_MISMATCH')
  })
})

describe('updateRecipe mutation', () => {
  test('renames, refiles and marks as favourite in one call', async () => {
    const id = await createdId()
    const result = await execute(`
      mutation {
        updateRecipe(id: "${id}", input: { title: "Lasagnes de nonna", category: DESSERT, favorite: true }) {
          title
          category
          favorite
        }
      }
    `)
    expect(result.errors).toBeUndefined()
    expect(result.data?.updateRecipe).toMatchObject({
      title: 'Lasagnes de nonna',
      category: 'DESSERT',
      favorite: true,
    })
  })

  test('surfaces an unknown recipe as NOT_FOUND', async () => {
    const result = await execute(`
      mutation { updateRecipe(id: "11111111-1111-4111-8111-111111111111", input: { title: "Rien" }) { title } }
    `)
    expect(result.errors?.[0]?.extensions?.code).toBe('NOT_FOUND')
  })

  test('refuses to hang a brew method on a recipe that is not a coffee', async () => {
    const id = await createdId()
    const result = await execute(`
      mutation { updateRecipe(id: "${id}", input: { method: CHEMEX }) { method } }
    `)
    expect(result.errors?.[0]?.extensions?.code).toBe('METHOD_MISMATCH')
  })
})

describe('recordAttempt mutation', () => {
  test('lands the outcome on the version that was cooked', async () => {
    const id = await createdId()
    const result = await execute(`
      mutation {
        recordAttempt(input: { recipeId: "${id}", versionNumber: 1, rating: 4 }) {
          number
          rating
          tried
        }
      }
    `)
    expect(result.errors).toBeUndefined()
    expect(result.data?.recordAttempt).toMatchObject({ number: 1, rating: 4, tried: true })
    expect(fake.snapshot('recipe-versions').get(`${id}_1`)?.rating).toBe(4)
  })

  test('rejects a rating outside 1..5 before it reaches the domain', async () => {
    const id = await createdId()
    const result = await execute(`
      mutation {
        recordAttempt(input: { recipeId: "${id}", versionNumber: 1, rating: 9 }) { number }
      }
    `)
    expect(result.errors?.[0]?.extensions?.code).toBe('BAD_USER_INPUT')
  })
})

describe('updateRating mutation', () => {
  test('corrects the note without re-cooking the version', async () => {
    const id = await createdId()
    await execute(
      `mutation { recordAttempt(input: { recipeId: "${id}", versionNumber: 1, rating: 2, remarks: "Trop cuit" }) { number } }`,
    )
    const result = await execute(`
      mutation {
        updateRating(recipeId: "${id}", versionNumber: 1, rating: 5) {
          number
          rating
          tried
          remarks
        }
      }
    `)
    expect(result.errors).toBeUndefined()
    expect(result.data?.updateRating).toMatchObject({
      number: 1,
      rating: 5,
      tried: true,
      remarks: 'Trop cuit',
    })
    expect([...fake.snapshot('recipe-versions').keys()]).toEqual([`${id}_1`])
  })

  test('rates a version that was never cooked, and stops it owing a try', async () => {
    const id = await createdId()
    const result = await execute(`
      mutation {
        updateRating(recipeId: "${id}", versionNumber: 1, rating: 3) { number rating tried }
      }
    `)
    expect(result.errors).toBeUndefined()
    expect(result.data?.updateRating).toMatchObject({ number: 1, rating: 3, tried: true })
  })

  test('rejects a rating outside 1..5 before it reaches the domain', async () => {
    const id = await createdId()
    const result = await execute(`
      mutation { updateRating(recipeId: "${id}", versionNumber: 1, rating: 0) { number } }
    `)
    expect(result.errors?.[0]?.extensions?.code).toBe('BAD_USER_INPUT')
  })

  test('surfaces an unknown recipe as NOT_FOUND', async () => {
    const result = await execute(`
      mutation {
        updateRating(recipeId: "11111111-1111-4111-8111-111111111111", versionNumber: 1, rating: 3) {
          number
        }
      }
    `)
    expect(result.errors?.[0]?.extensions?.code).toBe('NOT_FOUND')
  })
})

describe('updateTips mutation', () => {
  test('rewrites the tips in place, without creating a version', async () => {
    const id = await createdId()
    const result = await execute(`
      mutation {
        updateTips(recipeId: "${id}", versionNumber: 1, tips: ["Servir avec du riz"]) {
          number
          tips
        }
      }
    `)
    expect(result.errors).toBeUndefined()
    expect(result.data?.updateTips).toMatchObject({ number: 1, tips: ['Servir avec du riz'] })
    expect([...fake.snapshot('recipe-versions').keys()]).toEqual([`${id}_1`])
  })
})

describe('updateWarnings mutation', () => {
  test('rewrites the cautions in place, without touching the lineage', async () => {
    const id = await createdId()
    const result = await execute(`
      mutation {
        updateWarnings(recipeId: "${id}", warnings: ["Mettre le fouet dès le début"]) {
          warnings
        }
      }
    `)
    expect(result.errors).toBeUndefined()
    expect(result.data?.updateWarnings).toMatchObject({
      warnings: ['Mettre le fouet dès le début'],
    })
    expect([...fake.snapshot('recipe-versions').keys()]).toEqual([`${id}_1`])
  })

  test('full-replacement: [] clears the banner', async () => {
    const id = await createdId()
    await execute(
      `mutation { updateWarnings(recipeId: "${id}", warnings: ["Sortir le beurre avant"]) { warnings } }`,
    )
    const result = await execute(
      `mutation { updateWarnings(recipeId: "${id}", warnings: []) { warnings } }`,
    )
    expect(result.errors).toBeUndefined()
    expect(result.data?.updateWarnings).toMatchObject({ warnings: [] })
  })

  test('surfaces an unknown recipe as NOT_FOUND', async () => {
    const result = await execute(`
      mutation { updateWarnings(recipeId: "11111111-1111-4111-8111-111111111111", warnings: []) { warnings } }
    `)
    expect(result.errors?.[0]?.extensions?.code).toBe('NOT_FOUND')
  })
})

describe('deleteRecipe mutation', () => {
  test('erases the recipe and its whole lineage', async () => {
    const id = await createdId()
    const result = await execute(`mutation { deleteRecipe(id: "${id}") }`)
    expect(result.errors).toBeUndefined()
    expect(result.data?.deleteRecipe).toBe(true)
    expect(fake.snapshot('recipes').size).toBe(0)
    expect(fake.snapshot('recipe-versions').size).toBe(0)
  })

  test('surfaces an unknown recipe as NOT_FOUND', async () => {
    const result = await execute(
      `mutation { deleteRecipe(id: "11111111-1111-4111-8111-111111111111") }`,
    )
    expect(result.errors?.[0]?.extensions?.code).toBe('NOT_FOUND')
  })
})

describe('updateCoffeeParameters mutation', () => {
  const createEspresso = `
    mutation {
      createRecipe(input: {
        type: COFFEE
        category: DRINK
        method: ESPRESSO
        title: "Espresso du matin"
        content: { coffee: {
          beans: { name: "Belleville — Guji", dose: "18 g" }
          gear: { machine: "Rancilio Silvia" }
          steps: []
        } }
      }) { id }
    }
  `

  const espressoId = async () => {
    const result = await execute(createEspresso)
    expect(result.errors).toBeUndefined()
    return (result.data as { createRecipe: { id: string } }).createRecipe.id
  }

  test('corrects the parameters and answers how long the beans rested', async () => {
    // Roasted well before this version was created, so the rest is a real count —
    // dated BEFORE the create, otherwise the version's `createdAt` falls a
    // millisecond short of the fourteenth day and the count reads 13.
    const roastedOn = new Date(Date.now() - 14 * 86_400_000).toISOString()
    const id = await espressoId()

    const result = await execute(`
      mutation {
        updateCoffeeParameters(recipeId: "${id}", versionNumber: 1, parameters: {
          beans: { name: "Belleville — Sidamo", country: "Éthiopie", roastedOn: "${roastedOn}", dose: "18 g" }
          water: { kind: "Robinet (dureté 3/5)", amount: "36 g", temperature: "93°C" }
          extraction: { grind: "Niveau 10", time: "30 s", yield: "36 g" }
          gear: { machine: "Rancilio Silvia", grinder: "Niche Zero" }
        }) {
          number
          restDays
          content {
            ... on CoffeeContent {
              beans { name country dose }
              water { kind amount temperature }
              extraction { grind time yield }
              milk { kind }
              gear { machine grinder }
              steps { text }
            }
          }
        }
      }
    `)

    expect(result.errors).toBeUndefined()
    expect(result.data?.updateCoffeeParameters).toEqual({
      number: 1,
      restDays: 14,
      content: {
        beans: { name: 'Belleville — Sidamo', country: 'Éthiopie', dose: '18 g' },
        water: { kind: 'Robinet (dureté 3/5)', amount: '36 g', temperature: '93°C' },
        extraction: { grind: 'Niveau 10', time: '30 s', yield: '36 g' },
        // An espresso has no milk: the block stays absent, not empty.
        milk: null,
        gear: { machine: 'Rancilio Silvia', grinder: 'Niche Zero' },
        steps: [],
      },
    })
  })

  test('teaches the vocabulary what was typed', async () => {
    const id = await espressoId()

    await execute(`
      mutation {
        updateCoffeeParameters(recipeId: "${id}", versionNumber: 1, parameters: {
          water: { kind: "Volvic + minéralisation Lotus" }
          gear: { grinder: "Niche Zero" }
        }) { number }
      }
    `)

    const result = await execute(`{ coffeeVocabulary { waterKinds grinders machines } }`)
    expect(result.data?.coffeeVocabulary).toEqual({
      waterKinds: ['Volvic + minéralisation Lotus'],
      grinders: ['Niche Zero'],
      machines: ['Rancilio Silvia'],
    })
  })

  test('refuses a version that is not a coffee', async () => {
    const id = await createdId()
    const result = await execute(`
      mutation {
        updateCoffeeParameters(recipeId: "${id}", versionNumber: 1, parameters: {
          beans: { dose: "18 g" }
        }) { number }
      }
    `)
    expect(result.errors?.[0]?.extensions?.code).toBe('NOT_A_COFFEE')
  })

  test('surfaces an unknown recipe as NOT_FOUND', async () => {
    const result = await execute(`
      mutation {
        updateCoffeeParameters(
          recipeId: "11111111-1111-4111-8111-111111111111"
          versionNumber: 1
          parameters: {}
        ) { number }
      }
    `)
    expect(result.errors?.[0]?.extensions?.code).toBe('NOT_FOUND')
  })
})
