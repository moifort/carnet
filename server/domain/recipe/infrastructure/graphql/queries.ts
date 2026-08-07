import { match, P } from 'ts-pattern'
import { RecipeQuery } from '~/domain/recipe/query'
import { builder } from '~/domain/shared/graphql/builder'
import {
  BrewMethodEnum,
  DishCategoryEnum,
  RecipeSortEnum,
  RecipeTypeEnum,
  SortOrderEnum,
} from './enums'
import { CoffeeVocabularyType, RecipesType, RecipeType } from './types'

builder.queryField('recipes', (t) =>
  t.field({
    type: RecipesType,
    description: [
      'One page of your recipe library, loaded a few at a time for infinite scroll. You can ' +
        'narrow it (e.g. only `THERMOMIX` recipes, or only `DESSERT`) and choose the order. For ' +
        'example: the 20 most recently updated dishes, then pass the last id as `after` to load ' +
        'the next 20. The app’s cooking notebook asks for `[DISH, THERMOMIX]` and its coffee tab ' +
        'for `[COFFEE]`.',
      '',
      '```graphql',
      'recipes(types: [THERMOMIX], sort: UPDATED_AT, order: DESC, limit: 20) {',
      '  items { id title bestRating }',
      '  hasMore',
      '}',
      '```',
    ].join('\n'),
    args: {
      types: t.arg({
        type: [RecipeTypeEnum],
        description:
          'Facet: keep only these recipe types, e.g. `[DISH, THERMOMIX]` for the cooking ' +
          'notebook. Leave out for every type.',
      }),
      method: t.arg({
        type: BrewMethodEnum,
        description:
          'Facet: keep only coffees brewed this way, e.g. `V60`. Like `category`, it coerces the ' +
          'page to updatedAt desc',
      }),
      category: t.arg({
        type: DishCategoryEnum,
        description:
          'Facet: keep only this dish category, e.g. `DESSERT`. When set, the page is coerced to ' +
          'updatedAt desc — the sort/order args are ignored (ranking within one ' +
          'category is meaningless, and it keeps the composite-index surface bounded)',
      }),
      favorite: t.arg.boolean({
        description:
          'Facet: keep only the recipes you marked as favourites, e.g. `true`. Mixes every type — ' +
          'pair it with the category sort to read them course by course',
      }),
      sort: t.arg({
        type: RecipeSortEnum,
        defaultValue: 'updatedAt',
        description: 'Field the page is ordered by, e.g. `UPDATED_AT`',
      }),
      order: t.arg({
        type: SortOrderEnum,
        defaultValue: 'desc',
        description: 'Sort direction, e.g. `DESC` (ignored for the category sort, which is fixed)',
      }),
      limit: t.arg.int({
        defaultValue: 20,
        description: 'Maximum recipes returned in the page, e.g. `20`',
      }),
      after: t.arg({
        type: 'RecipeId',
        description: 'Cursor: return the page following this recipe id, e.g. `"9f1c-a3b2"`',
      }),
    },
    resolve: async (_root, args, { userId }) =>
      RecipeQuery.library(userId, {
        types: args.types ?? undefined,
        category: args.category ?? undefined,
        method: args.method ?? undefined,
        ...(args.favorite ? { favorite: true as const } : {}),
        sort: args.sort ?? 'updatedAt',
        order: args.order ?? 'desc',
        limit: args.limit ?? 20,
        after: args.after ?? undefined,
      }),
  }),
)

builder.queryField('recipe', (t) =>
  t.field({
    type: RecipeType,
    nullable: true,
    description: [
      'Fetch one recipe by its id, with everything on it. Returns `null` if no such recipe ' +
        'exists.',
      '',
      '```graphql',
      'recipe(id: "9f1c-a3b2") {',
      '  title',
      '  versionToOpen { number rating }',
      '  versions { number change }',
      '}',
      '```',
    ].join('\n'),
    args: {
      id: t.arg({
        type: 'RecipeId',
        required: true,
        description: 'The id of the recipe to fetch, e.g. `"9f1c-a3b2"`',
      }),
    },
    resolve: async (_root, { id }, { userId }) => {
      const recipe = await RecipeQuery.byId(userId, id)
      return match(recipe)
        .with('not-found', () => null)
        .with(P.not(P.string), (found) => found)
        .exhaustive()
    },
  }),
)

builder.queryField('coffeeVocabulary', (t) =>
  t.field({
    type: CoffeeVocabularyType,
    description: [
      'What to suggest in each free-text coffee field — the values you have already used, most ' +
        'recent first. One document, so it costs the same whether you have three coffees or ' +
        'three hundred.',
      '',
      '```graphql',
      '{ coffeeVocabulary { machines grinders waterKinds } }',
      '```',
    ].join('\n'),
    resolve: (_root, _args, { userId }) => RecipeQuery.coffeeVocabulary(userId),
  }),
)
