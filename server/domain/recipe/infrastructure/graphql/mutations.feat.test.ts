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
    contextValue: { userId, event: undefined as never, loaders: recipeSatelliteLoaders(userId) },
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

  test('saves a coffee with its brew method and its parameters — it has no steps', async () => {
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
          content: { coffee: { extraction: { grind: "fine" } } }
        }) { id }
      }
    `)
    expect(result.errors?.[0]?.extensions?.code).toBe('METHOD_MISMATCH')
  })
})

describe('copyVersion mutation', () => {
  test('detaches a version into a recipe of its own, verdict and cautions included', async () => {
    const id = await createdId()
    await execute(`
      mutation {
        updateWarnings(recipeId: "${id}", versionNumber: 1, warnings: ["Le fouet dès le début"]) {
          number
        }
      }
    `)
    await execute(`
      mutation {
        recordAttempt(input: { recipeId: "${id}", versionNumber: 1, rating: 4 }) { number }
      }
    `)

    const result = await execute(`
      mutation {
        copyVersion(recipeId: "${id}", number: 1, title: "Lasagnes de nonna") {
          id
          title
          category
          versionCount
          bestRating
          versionToOpen { number tried rating originDetail warnings }
        }
      }
    `)
    expect(result.errors).toBeUndefined()
    expect(result.data?.copyVersion).toMatchObject({
      title: 'Lasagnes de nonna',
      // The course of the recipe copied.
      category: 'MAIN',
      // A lineage of one, opening on the plate it was copied from — rating,
      // cautions and all.
      versionCount: 1,
      bestRating: 4,
      versionToOpen: {
        number: 1,
        tried: true,
        rating: 4,
        originDetail: 'Lasagnes de mamie v1',
        warnings: ['Le fouet dès le début'],
      },
    })

    const copyId = (result.data as { copyVersion: { id: string } }).copyVersion.id
    expect(copyId).not.toBe(id)
    // Nothing links the two lineages, and the recipe copied still owns its own.
    expect(fake.snapshot('recipe-versions').get(`${copyId}_1`)).not.toHaveProperty('basedOn')
    expect(fake.snapshot('recipe-versions').get(`${id}_1`)?.recipeId).toBe(id)
  })

  test('surfaces an unknown version as NOT_FOUND', async () => {
    const id = await createdId()
    const result = await execute(`
      mutation { copyVersion(recipeId: "${id}", number: 7, title: "Fantôme") { id } }
    `)
    expect(result.errors?.[0]?.extensions?.code).toBe('NOT_FOUND')
  })
})

describe('updateRecipe mutation', () => {
  test('renames and refiles in one call', async () => {
    const id = await createdId()
    const result = await execute(`
      mutation {
        updateRecipe(id: "${id}", input: { title: "Lasagnes de nonna", category: DESSERT }) {
          title
          category
        }
      }
    `)
    expect(result.errors).toBeUndefined()
    expect(result.data?.updateRecipe).toMatchObject({
      title: 'Lasagnes de nonna',
      category: 'DESSERT',
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

describe('updateFavorite mutation', () => {
  test('hearts a version, and the recipe follows into the favourites lens', async () => {
    const id = await createdId()
    const result = await execute(`
      mutation {
        updateFavorite(recipeId: "${id}", versionNumber: 1, favorite: true) {
          number
          favorite
        }
      }
    `)
    expect(result.errors).toBeUndefined()
    expect(result.data?.updateFavorite).toMatchObject({ number: 1, favorite: true })

    const listed = await execute(`query { recipes(favorite: true) { items { id } } }`)
    expect(listed.data?.recipes).toMatchObject({ items: [{ id }] })
  })

  test('un-hearting the last version takes the recipe out of the lens', async () => {
    const id = await createdId()
    await execute(
      `mutation { updateFavorite(recipeId: "${id}", versionNumber: 1, favorite: true) { number } }`,
    )

    await execute(
      `mutation { updateFavorite(recipeId: "${id}", versionNumber: 1, favorite: false) { number } }`,
    )

    const listed = await execute(`query { recipes(favorite: true) { items { id } } }`)
    expect(listed.data?.recipes).toMatchObject({ items: [] })
  })

  test('surfaces an unknown version as NOT_FOUND', async () => {
    const id = await createdId()
    const result = await execute(
      `mutation { updateFavorite(recipeId: "${id}", versionNumber: 9, favorite: true) { number } }`,
    )
    expect(result.errors?.[0]?.extensions?.code).toBe('NOT_FOUND')
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
  test('rewrites the version’s cautions in place, without touching the lineage', async () => {
    const id = await createdId()
    const result = await execute(`
      mutation {
        updateWarnings(recipeId: "${id}", versionNumber: 1, warnings: ["Mettre le fouet dès le début"]) {
          number
          warnings
        }
      }
    `)
    expect(result.errors).toBeUndefined()
    expect(result.data?.updateWarnings).toMatchObject({
      number: 1,
      warnings: ['Mettre le fouet dès le début'],
    })
    expect([...fake.snapshot('recipe-versions').keys()]).toEqual([`${id}_1`])
  })

  test('full-replacement: [] clears the banner', async () => {
    const id = await createdId()
    await execute(
      `mutation { updateWarnings(recipeId: "${id}", versionNumber: 1, warnings: ["Sortir le beurre avant"]) { warnings } }`,
    )
    const result = await execute(
      `mutation { updateWarnings(recipeId: "${id}", versionNumber: 1, warnings: []) { warnings } }`,
    )
    expect(result.errors).toBeUndefined()
    expect(result.data?.updateWarnings).toMatchObject({ warnings: [] })
  })

  test('surfaces an unknown recipe or version as NOT_FOUND', async () => {
    const unknown = await execute(`
      mutation { updateWarnings(recipeId: "11111111-1111-4111-8111-111111111111", versionNumber: 1, warnings: []) { warnings } }
    `)
    expect(unknown.errors?.[0]?.extensions?.code).toBe('NOT_FOUND')

    const id = await createdId()
    const missingVersion = await execute(
      `mutation { updateWarnings(recipeId: "${id}", versionNumber: 9, warnings: []) { warnings } }`,
    )
    expect(missingVersion.errors?.[0]?.extensions?.code).toBe('NOT_FOUND')
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
      },
    })
  })

  test('teaches the vocabulary what was typed', async () => {
    const id = await espressoId()

    await execute(`
      mutation {
        updateCoffeeParameters(recipeId: "${id}", versionNumber: 1, parameters: {
          beans: { roast: "Torréfaction claire" }
          water: { kind: "Volvic + minéralisation Lotus" }
          gear: { grinder: "Niche Zero" }
        }) { number }
      }
    `)

    const result = await execute(`{ coffeeVocabulary { waterKinds grinders machines roasts } }`)
    expect(result.data?.coffeeVocabulary).toEqual({
      waterKinds: ['Volvic + minéralisation Lotus'],
      grinders: ['Niche Zero'],
      machines: ['Rancilio Silvia'],
      roasts: ['Torréfaction claire'],
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

describe('the oven profile on a version', () => {
  test('a dish saved with an oven profile reads it back', async () => {
    const result = await execute(`
      mutation {
        createRecipe(input: {
          type: DISH
          category: MAIN
          title: "Quiche fine"
          content: { dish: {
            ingredients: [{ name: "Pâte brisée", quantity: "1 rouleau" }]
            steps: ["Enfourner"]
            oven: { program: CONVECTION, temperature: 180, duration: 30 }
          } }
        }) {
          versionToOpen { content { ... on DishContent { oven { program temperature duration core } } } }
        }
      }
    `)

    expect(result.errors).toBeUndefined()
    expect(result.data?.createRecipe).toMatchObject({
      versionToOpen: {
        content: {
          oven: { program: 'CONVECTION', temperature: 180, duration: 30, core: null },
        },
      },
    })
  })

  test('a dish that never bakes reads back no profile at all', async () => {
    const result = await execute(`
      mutation {
        createRecipe(input: {
          type: DISH
          category: STARTER
          title: "Salade"
          content: { dish: { ingredients: [], steps: ["Mélanger"] } }
        }) {
          versionToOpen { content { ... on DishContent { oven { program } } } }
        }
      }
    `)

    expect(result.errors).toBeUndefined()
    expect(result.data?.createRecipe).toMatchObject({
      versionToOpen: { content: { oven: null } },
    })
  })

  test('refuses a temperature no oven can reach, as bad input', async () => {
    const result = await execute(`
      mutation {
        createRecipe(input: {
          type: DISH
          category: MAIN
          title: "Gratin"
          content: { dish: {
            ingredients: []
            steps: ["Enfourner"]
            oven: { program: CONVECTION, temperature: 900 }
          } }
        }) { id }
      }
    `)

    expect(result.errors?.[0]?.extensions?.code).toBe('BAD_USER_INPUT')
  })
})

describe('updateOvenProfile mutation', () => {
  const bakedQuiche = `
    mutation {
      createRecipe(input: {
        type: DISH
        category: MAIN
        title: "Quiche fine"
        content: { dish: {
          ingredients: []
          steps: ["Enfourner"]
          oven: { program: CONVECTION, temperature: 180, duration: 40 }
        } }
      }) { id }
    }
  `

  const bakedId = async () => {
    const result = await execute(bakedQuiche)
    expect(result.errors).toBeUndefined()
    return (result.data as { createRecipe: { id: string } }).createRecipe.id
  }

  test('corrects the settings in place, creating no version', async () => {
    const id = await bakedId()

    const result = await execute(`
      mutation {
        updateOvenProfile(recipeId: "${id}", versionNumber: 1, oven: {
          program: CONVECTION, temperature: 180, duration: 30
        }) {
          number
          content { ... on DishContent { oven { duration } steps } }
        }
      }
    `)

    expect(result.errors).toBeUndefined()
    expect(result.data?.updateOvenProfile).toMatchObject({
      number: 1,
      // The steps are untouched: correcting what the recipe always said is not
      // iterating on it.
      content: { oven: { duration: 30 }, steps: ['Enfourner'] },
    })
    expect(fake.snapshot('recipes').get(id)?.lastVersionNumber).toBe(1)
  })

  test('a null profile says the dish never bakes, and clears it outright', async () => {
    const id = await bakedId()

    const result = await execute(`
      mutation {
        updateOvenProfile(recipeId: "${id}", versionNumber: 1, oven: null) {
          content { ... on DishContent { oven { temperature } } }
        }
      }
    `)

    expect(result.errors).toBeUndefined()
    expect(result.data?.updateOvenProfile).toMatchObject({ content: { oven: null } })
    const stored = fake.snapshot('recipe-versions').get(`${id}_1`)
    // Cleared means gone from the document, not stored as an empty profile.
    expect(stored?.content).not.toHaveProperty('oven')
  })

  test('answers NOT_A_COOKED_RECIPE on a coffee, which has no oven', async () => {
    const created = await execute(`
      mutation {
        createRecipe(input: {
          type: COFFEE
          category: DRINK
          method: ESPRESSO
          title: "Espresso"
          content: { coffee: { extraction: { grind: "Niveau 12" } } }
        }) { id }
      }
    `)
    const id = (created.data as { createRecipe: { id: string } }).createRecipe.id

    const result = await execute(`
      mutation {
        updateOvenProfile(recipeId: "${id}", versionNumber: 1, oven: {
          program: CONVECTION, temperature: 180
        }) { number }
      }
    `)

    expect(result.errors?.[0]?.extensions?.code).toBe('NOT_A_COOKED_RECIPE')
  })
})

describe('updateComponent mutation', () => {
  const ravioli = `
    mutation {
      createRecipe(input: {
        type: DISH
        category: MAIN
        title: "Ravioles aux champignons"
        content: { dish: {
          ingredients: [
            { name: "Pâte à ravioles", quantity: "400 g" }
            { name: "Champignons", quantity: "250 g" }
          ]
          steps: ["Garnir"]
        } }
      }) { id }
    }
  `

  const raviolId = async () => {
    const result = await execute(ravioli)
    expect(result.errors).toBeUndefined()
    return (result.data as { createRecipe: { id: string } }).createRecipe.id
  }

  const link = (recipeId: string, ingredient: number, component: string | null) => `
    mutation {
      updateComponent(
        recipeId: "${recipeId}"
        versionNumber: 1
        ingredient: ${ingredient}
        component: ${component === null ? 'null' : `"${component}"`}
      ) {
        number
        content { ... on DishContent { ingredients { name quantity component { title } } } }
      }
    }
  `

  test('says which recipe a line is, creating no version', async () => {
    const parent = await raviolId()
    const dough = await createdId()

    const result = await execute(link(parent, 0, dough))

    expect(result.errors).toBeUndefined()
    expect(result.data?.updateComponent).toMatchObject({
      number: 1,
      content: {
        ingredients: [
          // The line keeps its own name — the role the dough plays here — and gains
          // the live title of the recipe it is.
          { name: 'Pâte à ravioles', quantity: '400 g', component: { title: 'Lasagnes de mamie' } },
          { name: 'Champignons', quantity: '250 g', component: null },
        ],
      },
    })
    // Naming the dough that was already used is a correction, not an attempt.
    expect(fake.snapshot('recipes').get(parent)?.lastVersionNumber).toBe(1)
  })

  test('a null component unlinks the line, which stays a plain ingredient', async () => {
    const parent = await raviolId()
    const dough = await createdId()
    await execute(link(parent, 0, dough))

    const result = await execute(link(parent, 0, null))

    expect(result.errors).toBeUndefined()
    expect(result.data?.updateComponent).toMatchObject({
      content: { ingredients: [{ name: 'Pâte à ravioles', component: null }, { component: null }] },
    })
  })

  test('answers INGREDIENT_NOT_FOUND past the end of the list', async () => {
    const parent = await raviolId()
    const dough = await createdId()

    const result = await execute(link(parent, 7, dough))

    expect(result.errors?.[0]?.extensions?.code).toBe('INGREDIENT_NOT_FOUND')
  })

  test('answers SELF_REFERENCE on a recipe that is its own ingredient', async () => {
    const parent = await raviolId()

    const result = await execute(link(parent, 0, parent))

    expect(result.errors?.[0]?.extensions?.code).toBe('SELF_REFERENCE')
  })

  test('answers NOT_FOUND on an unknown linked recipe — never that it exists', async () => {
    const parent = await raviolId()

    const result = await execute(link(parent, 0, '11111111-1111-4111-8111-111111111111'))

    expect(result.errors?.[0]?.extensions?.code).toBe('NOT_FOUND')
  })

  test('answers NOT_A_COOKED_RECIPE on a coffee, which has no ingredients', async () => {
    const created = await execute(`
      mutation {
        createRecipe(input: {
          type: COFFEE
          category: DRINK
          method: ESPRESSO
          title: "Espresso"
          content: { coffee: { extraction: { grind: "Niveau 12" } } }
        }) { id }
      }
    `)
    const id = (created.data as { createRecipe: { id: string } }).createRecipe.id
    const dough = await createdId()

    const result = await execute(link(id, 0, dough))

    expect(result.errors?.[0]?.extensions?.code).toBe('NOT_A_COOKED_RECIPE')
  })
})

describe('updateIngredients mutation', () => {
  const lasagnaId = async () => {
    const result = await execute(createLasagna)
    expect(result.errors).toBeUndefined()
    return (result.data as { createRecipe: { id: string } }).createRecipe.id
  }

  test('replaces the list in place, creating no version and keeping the steps', async () => {
    const id = await lasagnaId()

    const result = await execute(`
      mutation {
        updateIngredients(recipeId: "${id}", versionNumber: 1, ingredients: [
          { name: "Farine", quantity: "200 g" }
          { name: "Beurre", quantity: "80 g" }
        ]) {
          number
          content { ... on DishContent { ingredients { name quantity } steps } }
        }
      }
    `)

    expect(result.errors).toBeUndefined()
    expect(result.data?.updateIngredients).toMatchObject({
      number: 1,
      content: {
        ingredients: [
          { name: 'Farine', quantity: '200 g' },
          { name: 'Beurre', quantity: '80 g' },
        ],
        steps: ['Monter les couches', 'Enfourner à 200°C'],
      },
    })
    expect(fake.snapshot('recipes').get(id)?.lastVersionNumber).toBe(1)
  })

  test('answers NOT_A_COOKED_RECIPE on a coffee, which has no shopping list', async () => {
    const created = await execute(`
      mutation {
        createRecipe(input: {
          type: COFFEE
          category: DRINK
          method: ESPRESSO
          title: "Espresso"
          content: { coffee: { extraction: { grind: "Niveau 12" } } }
        }) { id }
      }
    `)
    const id = (created.data as { createRecipe: { id: string } }).createRecipe.id

    const result = await execute(`
      mutation {
        updateIngredients(recipeId: "${id}", versionNumber: 1, ingredients: []) { number }
      }
    `)

    expect(result.errors?.[0]?.extensions?.code).toBe('NOT_A_COOKED_RECIPE')
  })

  test('answers NOT_FOUND on a version that is not there', async () => {
    const id = await lasagnaId()

    const result = await execute(`
      mutation {
        updateIngredients(recipeId: "${id}", versionNumber: 9, ingredients: []) { number }
      }
    `)

    expect(result.errors?.[0]?.extensions?.code).toBe('NOT_FOUND')
  })
})

describe('updateSteps mutation', () => {
  test('replaces a dish’s steps, leaving its ingredients alone', async () => {
    const created = await execute(createLasagna)
    const id = (created.data as { createRecipe: { id: string } }).createRecipe.id

    const result = await execute(`
      mutation {
        updateSteps(recipeId: "${id}", versionNumber: 1, steps: [
          { text: "Monter les couches" }
          { text: "Enfourner à 180°C" }
        ]) {
          number
          content { ... on DishContent { steps ingredients { name } } }
        }
      }
    `)

    expect(result.errors).toBeUndefined()
    expect(result.data?.updateSteps).toMatchObject({
      number: 1,
      content: {
        steps: ['Monter les couches', 'Enfourner à 180°C'],
        ingredients: [{ name: 'Farine' }],
      },
    })
  })

  test('keeps the machine settings on a Thermomix version', async () => {
    const created = await execute(`
      mutation {
        createRecipe(input: {
          type: THERMOMIX
          category: MAIN
          title: "Risotto"
          content: { thermomix: {
            ingredients: []
            steps: [{ text: "Mixer", settings: {} }]
          } }
        }) { id }
      }
    `)
    const id = (created.data as { createRecipe: { id: string } }).createRecipe.id

    const result = await execute(`
      mutation {
        updateSteps(recipeId: "${id}", versionNumber: 1, steps: [
          { text: "Mixer les oignons", settings: { time: "5 s", speed: "5" } }
          { text: "Laisser reposer" }
        ]) {
          content { ... on ThermomixContent { steps { text settings { time speed } } } }
        }
      }
    `)

    expect(result.errors).toBeUndefined()
    expect(result.data?.updateSteps).toMatchObject({
      content: {
        steps: [
          { text: 'Mixer les oignons', settings: { time: '5 s', speed: '5' } },
          { text: 'Laisser reposer', settings: { time: null, speed: null } },
        ],
      },
    })
  })
})
