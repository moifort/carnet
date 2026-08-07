import { match, P } from 'ts-pattern'
import { RecipeCommand } from '~/domain/recipe/command'
import { CoffeeParameters as brandCoffeeParameters } from '~/domain/recipe/primitives'
import { RecipeUseCase } from '~/domain/recipe/use-case'
import { builder } from '~/domain/shared/graphql/builder'
import { domainError } from '~/domain/shared/graphql/errors'
import {
  CoffeeParametersInput,
  CreateRecipeInput,
  RecordAttemptInput,
  UpdateRecipeInput,
  versionContentInput,
} from './inputs'
import { RecipeType, VersionType } from './types'

builder.mutationField('createRecipe', (t) =>
  t.field({
    type: RecipeType,
    description: [
      'Save a new recipe. Turns a confirmed import preview into a real recipe with its first ' +
        'version (`v1`). Returns the freshly created recipe.',
      '',
      '```graphql',
      'createRecipe(input: {',
      '  type: DISH',
      '  category: MAIN',
      '  title: "Grandma\'s lasagna"',
      '  content: { dish: {',
      '    ingredients: [{ name: "Flour", quantity: "250 g" }]',
      '    steps: ["Layer the pasta", "Bake at 200°C"]',
      '  } }',
      '}) {',
      '  id',
      '  versionToOpen { number }',
      '}',
      '```',
    ].join('\n'),
    args: {
      input: t.arg({
        type: CreateRecipeInput,
        required: true,
        description: 'The recipe to create — name, category, and its content',
      }),
    },
    resolve: async (_root, { input }, { userId }) => {
      const result = await RecipeCommand.create(
        userId,
        {
          type: input.type,
          category: input.category,
          ...(input.method ? { method: input.method } : {}),
          title: input.title,
          content: versionContentInput(input.content),
          tips: input.tips,
        },
        input.sourceLabel ?? undefined,
      )
      return match(result)
        .with('content-type-mismatch', domainError)
        .with('method-mismatch', domainError)
        .with(P.not(P.string), (recipe) => recipe)
        .exhaustive()
    },
  }),
)

builder.mutationField('updateRecipe', (t) =>
  t.field({
    type: RecipeType,
    description: [
      'Retouch a recipe: rename it, refile it under another course, mark it as a favourite, or ' +
        'any combination. Returns the updated recipe.',
      '',
      '```graphql',
      'updateRecipe(id: "9f1c-a3b2", input: { title: "Nonna\'s lasagna", category: MAIN, favorite: true }) {',
      '  id',
      '  title',
      '  category',
      '  favorite',
      '}',
      '```',
    ].join('\n'),
    args: {
      id: t.arg({ type: 'RecipeId', required: true, description: 'Which recipe to update' }),
      input: t.arg({
        type: UpdateRecipeInput,
        required: true,
        description: 'What to change (leave a field out to change nothing)',
      }),
    },
    resolve: async (_root, { id, input }, { userId }) => {
      const result = await RecipeCommand.update(userId, id, {
        ...(input.title ? { title: input.title } : {}),
        ...(input.category ? { category: input.category } : {}),
        ...(input.method ? { method: input.method } : {}),
        ...(input.favorite !== null && input.favorite !== undefined
          ? { favorite: input.favorite }
          : {}),
      })
      return match(result)
        .with('not-found', domainError)
        .with('method-mismatch', domainError)
        .with(P.not(P.string), (recipe) => recipe)
        .exhaustive()
    },
  }),
)

builder.mutationField('deleteRecipe', (t) =>
  t.field({
    type: 'Boolean',
    description: [
      'Delete a recipe for good, along with every version and attempt on it. Returns `true` on ' +
        'success.',
      '',
      '```graphql',
      'deleteRecipe(id: "9f1c-a3b2")',
      '```',
    ].join('\n'),
    args: {
      id: t.arg({ type: 'RecipeId', required: true, description: 'Which recipe to delete' }),
    },
    resolve: async (_root, { id }, { userId }) => {
      const result = await RecipeUseCase.removeCompletely(userId, id)
      return match(result)
        .with('not-found', domainError)
        .with(P.not(P.string), () => true)
        .exhaustive()
    },
  }),
)

builder.mutationField('deleteVersion', (t) =>
  t.field({
    type: 'Boolean',
    description: [
      'Delete one version from a recipe, attempt included. The versions built on it are re-based ' +
        'onto the one it iterated on, and its number is never reused by a later iteration. ' +
        'Deleting the sole version deletes the recipe with it. Returns `true` on success.',
      '',
      '```graphql',
      'deleteVersion(recipeId: "9f1c-a3b2", number: 2)',
      '```',
    ].join('\n'),
    args: {
      recipeId: t.arg({
        type: 'RecipeId',
        required: true,
        description: 'Which recipe the version belongs to',
      }),
      number: t.arg({
        type: 'VersionNumber',
        required: true,
        description: 'Which version to delete',
      }),
    },
    resolve: async (_root, { recipeId, number }, { userId }) => {
      const result = await RecipeCommand.removeVersion(userId, recipeId, number)
      return match(result)
        .with('not-found', domainError)
        .with(P.not(P.string), () => true)
        .exhaustive()
    },
  }),
)

builder.mutationField('updateTips', (t) =>
  t.field({
    type: VersionType,
    description: [
      'Replace one version’s cooking tips with this complete list — typically the accepted ' +
        'requestTips proposal, after your edits. Rewrites the tips in place: no new version is ' +
        'created, the content and outcome are left untouched. Returns the updated version.',
      '',
      '```graphql',
      'updateTips(recipeId: "9f1c-a3b2", versionNumber: 2, tips: ["Serve over rice"]) {',
      '  number',
      '  tips',
      '}',
      '```',
    ].join('\n'),
    args: {
      recipeId: t.arg({
        type: 'RecipeId',
        required: true,
        description: 'Which recipe the version belongs to',
      }),
      versionNumber: t.arg({
        type: 'VersionNumber',
        required: true,
        description: 'Which version’s tips to replace, e.g. `2`',
      }),
      tips: t.arg({
        type: ['Tip'],
        required: true,
        description: 'The complete new tips list (send `[]` to clear the section)',
      }),
    },
    resolve: async (_root, { recipeId, versionNumber, tips }, { userId }) => {
      const result = await RecipeCommand.updateTips(userId, recipeId, versionNumber, [...tips])
      return match(result)
        .with('not-found', domainError)
        .with(P.not(P.string), (version) => version)
        .exhaustive()
    },
  }),
)

builder.mutationField('updateCoffeeParameters', (t) =>
  t.field({
    type: VersionType,
    description: [
      'Correct one coffee version’s parameters — the roast date you read wrong, the grinder you ' +
        'forgot. Full replacement: no version is created, and the brewing steps and the outcome ' +
        'are left untouched (correcting what you logged is not iterating on the recipe). Every ' +
        'free-text value you send is also remembered for that field’s suggestions — see ' +
        '`coffeeVocabulary`. Returns the updated version.',
      '',
      '```graphql',
      'updateCoffeeParameters(recipeId: "9f1c-a3b2", versionNumber: 1, parameters: {',
      '  beans: { name: "Belleville — Guji", dose: "18 g" }',
      '  extraction: { grind: "Niveau 12", time: "28 s", yield: "36 g" }',
      '}) { number restDays }',
      '```',
    ].join('\n'),
    args: {
      recipeId: t.arg({
        type: 'RecipeId',
        required: true,
        description: 'Which recipe the version belongs to',
      }),
      versionNumber: t.arg({
        type: 'VersionNumber',
        required: true,
        description: 'Which version to correct, e.g. `1`',
      }),
      parameters: t.arg({
        type: CoffeeParametersInput,
        required: true,
        description:
          'The complete new parameters — a block left out is cleared, and leaving `milk` out ' +
          'says the drink has none',
      }),
    },
    resolve: async (_root, { recipeId, versionNumber, parameters }, { userId }) => {
      const result = await RecipeCommand.updateCoffeeParameters(
        userId,
        recipeId,
        versionNumber,
        brandCoffeeParameters(parameters),
      )
      return match(result)
        .with('not-found', domainError)
        .with('not-a-coffee', domainError)
        .with(P.not(P.string), (version) => version)
        .exhaustive()
    },
  }),
)

builder.mutationField('updateWarnings', (t) =>
  t.field({
    type: RecipeType,
    description: [
      'Replace a recipe’s cautions with this complete list — what the banner atop its sheet ' +
        'shows before anything else, e.g. `"The whisk must go in from the very start"`. ' +
        'Recipe-level, so the cautions outlive every version; rewritten in place, no version is ' +
        'created. Returns the updated recipe.',
      '',
      '```graphql',
      'updateWarnings(recipeId: "9f1c-a3b2", warnings: ["The whisk must go in from the very start"]) {',
      '  id',
      '  warnings',
      '}',
      '```',
    ].join('\n'),
    args: {
      recipeId: t.arg({
        type: 'RecipeId',
        required: true,
        description: 'Which recipe to pin the cautions on',
      }),
      warnings: t.arg({
        type: ['Warning'],
        required: true,
        description: 'The complete new cautions list (send `[]` to clear the banner)',
      }),
    },
    resolve: async (_root, { recipeId, warnings }, { userId }) => {
      const result = await RecipeCommand.updateWarnings(userId, recipeId, [...warnings])
      return match(result)
        .with('not-found', domainError)
        .with(P.not(P.string), (recipe) => recipe)
        .exhaustive()
    },
  }),
)

builder.mutationField('recordAttempt', (t) =>
  t.field({
    type: VersionType,
    description: [
      'Save what happened when you cooked a version: its rating, optionally a photo. Overwritable ' +
        '— recording again on the same version simply updates it. Fast and does not call the AI. ' +
        'Use this when the cook asks for nothing more. To iterate on what you noticed, ask for a ' +
        'proposal instead (see requestProposal): your remarks then land on the version they ' +
        'produce, and this one is left untouched. Returns the version, now updated with its outcome.',
      '',
      '```graphql',
      'recordAttempt(input: {',
      '  recipeId: "9f1c-a3b2"',
      '  versionNumber: 2',
      '  rating: 4',
      '}) {',
      '  number',
      '  rating',
      '}',
      '```',
    ].join('\n'),
    args: {
      input: t.arg({
        type: RecordAttemptInput,
        required: true,
        description: 'The attempt to record — which version, the rating, optionally a photo',
      }),
    },
    resolve: async (_root, { input }, { userId }) => {
      const result = await RecipeCommand.recordAttempt(userId, {
        recipeId: input.recipeId,
        versionNumber: input.versionNumber,
        rating: input.rating,
        ...(input.remarks ? { remarks: input.remarks } : {}),
      })
      return match(result)
        .with('not-found', domainError)
        .with(P.not(P.string), (recorded) => recorded)
        .exhaustive()
    },
  }),
)
