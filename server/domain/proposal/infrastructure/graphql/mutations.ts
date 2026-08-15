import { GraphQLError } from 'graphql'
import { match, P } from 'ts-pattern'
import type { AcceptedProposal } from '~/domain/proposal/types'
import { ProposalUseCase } from '~/domain/proposal/use-case'
import { versionContentInput } from '~/domain/recipe/infrastructure/graphql/inputs'
import { RecipeType } from '~/domain/recipe/infrastructure/graphql/types'
import type { Recipe, VersionNumber } from '~/domain/recipe/types'
import { builder } from '~/domain/shared/graphql/builder'
import { domainError } from '~/domain/shared/graphql/errors'
import { imageWithinSizeLimit, MAX_IMPORT_PHOTOS } from '~/system/ai/limits'
import type { ImportSource } from '~/system/ai/types'
import { ProposalInput } from './inputs'
import {
  CoffeeImportAnalysisType,
  CookingImportAnalysisType,
  ProposalType,
  TipsProposalType,
} from './types'

type AcceptResult = {
  recipe: Recipe
  createdVersion: VersionNumber | null
}

const AcceptProposalResultType = builder.objectRef<AcceptResult>('AcceptProposalResult').implement({
  description:
    'What you get back after accepting an AI suggestion, e.g. the new `v3` added to the chain',
  fields: (t) => ({
    recipe: t.field({
      type: RecipeType,
      description:
        'The recipe, now with the accepted version added to its chain, e.g. ' +
        '`"Grandma’s lasagna"` now up to `v3`',
      resolve: (r) => r.recipe,
    }),
    createdVersion: t.expose('createdVersion', {
      type: 'VersionNumber',
      nullable: true,
      description: 'The number of the version that was just created, e.g. `3`',
    }),
  }),
})

builder.mutationField('requestProposal', (t) =>
  t.field({
    type: ProposalType,
    description: [
      'Ask the AI for a suggested next version. It looks at the version you just cooked and at ' +
        'how the cook went — the rating and remarks you send here — and proposes one ' +
        'improvement. Nothing is saved yet, not even your rating: it is recorded on the version ' +
        'you cooked when you accept the proposal (see acceptProposal). Spends one iteration of ' +
        'your monthly AI allowance (see quota) — `QUOTA_EXHAUSTED` once it is used up.',
      '',
      '```graphql',
      'requestProposal(',
      '  recipeId: "9f1c-a3b2"',
      '  versionNumber: 2',
      '  rating: 3',
      '  remarks: "Still a touch too sweet"',
      ') {',
      '  basedOn',
      '  changeSummary',
      '  rationale',
      '}',
      '```',
    ].join('\n'),
    args: {
      recipeId: t.arg({
        type: 'RecipeId',
        required: true,
        description: 'The recipe to get a suggestion for, e.g. the id of `"Grandma’s lasagna"`',
      }),
      versionNumber: t.arg({
        type: 'VersionNumber',
        required: true,
        description: 'The version you just cooked and want to iterate on, e.g. `2`',
      }),
      rating: t.arg({
        type: 'Rating',
        required: true,
        description: 'How that cook turned out, `1` to `5`, e.g. `3`',
      }),
      remarks: t.arg({
        type: 'Remarks',
        required: true,
        description:
          'What you noticed and want fixed, e.g. `"Still a touch too sweet"` — this is what ' +
          'the proposal answers',
      }),
    },
    resolve: async (_root, { recipeId, versionNumber, rating, remarks }, { userId }) => {
      const result = await ProposalUseCase.fromAttempt(userId, recipeId, versionNumber, {
        rating,
        remarks,
      })
      return match(result)
        .with('not-found', domainError)
        .with('quota-exhausted', domainError)
        .with(P.not(P.string), (proposal) => proposal)
        .exhaustive()
    },
  }),
)

builder.mutationField('requestImprovement', (t) =>
  t.field({
    type: ProposalType,
    description: [
      'Ask the AI for a next version answering something you want changed — no cook needed, ' +
        'just say what to improve. Nothing is saved yet: you get a proposal to review, and ' +
        'accepting it (see acceptProposal) creates the version, which lands on your to-cook ' +
        'list. Spends one iteration of your monthly AI allowance (see quota) — ' +
        '`QUOTA_EXHAUSTED` once it is used up.',
      '',
      '```graphql',
      'requestImprovement(',
      '  recipeId: "9f1c-a3b2"',
      '  versionNumber: 2',
      '  improvement: "A vegetarian version, for 6"',
      ') {',
      '  changeSummary',
      '  rationale',
      '}',
      '```',
    ].join('\n'),
    args: {
      recipeId: t.arg({
        type: 'RecipeId',
        required: true,
        description: 'The recipe to improve, e.g. the id of `"Grandma’s lasagna"`',
      }),
      versionNumber: t.arg({
        type: 'VersionNumber',
        required: true,
        description: 'The version to improve on, e.g. `2`',
      }),
      improvement: t.arg({
        type: 'Remarks',
        required: true,
        description:
          'What you want changed, in your own words, e.g. `"A vegetarian version, for 6"` — ' +
          'this is what the proposal answers',
      }),
    },
    resolve: async (_root, { recipeId, versionNumber, improvement }, { userId }) => {
      const result = await ProposalUseCase.fromImprovement(
        userId,
        recipeId,
        versionNumber,
        improvement,
      )
      return match(result)
        .with('not-found', domainError)
        .with('quota-exhausted', domainError)
        .with(P.not(P.string), (proposal) => proposal)
        .exhaustive()
    },
  }),
)

builder.mutationField('requestChange', (t) =>
  t.field({
    type: ProposalType,
    description: [
      'Write down a change you have ALREADY made: you cooked this recipe, changed something on ' +
        'the way (10 g of sugar instead of 20) and ate the result. The AI applies exactly that ' +
        'to the version you name — it invents nothing and improves nothing — and hands back the ' +
        'complete version to review. Nothing is saved yet: accepting it (see acceptProposal, ' +
        'with `cooked: true`) creates a version that has already been cooked, which is never on ' +
        'your to-cook list, unlike requestImprovement. Spends one iteration of your monthly AI ' +
        'allowance (see quota) — `QUOTA_EXHAUSTED` once it is used up.',
      '',
      '```graphql',
      'requestChange(',
      '  recipeId: "9f1c-a3b2"',
      '  versionNumber: 2',
      '  change: "j’ai mis 10 g de sucre au lieu de 20"',
      ') {',
      '  changeSummary',
      '}',
      '```',
    ].join('\n'),
    args: {
      recipeId: t.arg({
        type: 'RecipeId',
        required: true,
        description: 'The recipe you cooked, e.g. the id of `"Grandma’s lasagna"`',
      }),
      versionNumber: t.arg({
        type: 'VersionNumber',
        required: true,
        description: 'The version you started from — the one on screen, e.g. `2`',
      }),
      change: t.arg({
        type: 'Remarks',
        required: true,
        description:
          'What you changed, in your own words, e.g. `"j’ai mis 10 g de sucre au lieu de 20"`',
      }),
    },
    resolve: async (_root, { recipeId, versionNumber, change }, { userId }) => {
      const result = await ProposalUseCase.fromChange(userId, recipeId, versionNumber, change)
      return match(result)
        .with('not-found', domainError)
        .with('quota-exhausted', domainError)
        .with(P.not(P.string), (proposal) => proposal)
        .exhaustive()
    },
  }),
)

builder.mutationField('requestTips', (t) =>
  t.field({
    type: TipsProposalType,
    description: [
      'Ask the AI to fold the tips you just typed into one version’s tips list — reworded, ' +
        'merged with the tips it already has, deduplicated. Nothing is saved: you get the ' +
        'complete list back to review, and accepting it goes through updateTips (no new version ' +
        'is ever created for tips). Spends one iteration of your monthly AI allowance (see ' +
        'quota) — `QUOTA_EXHAUSTED` once it is used up.',
      '',
      '```graphql',
      'requestTips(',
      '  recipeId: "9f1c-a3b2"',
      '  versionNumber: 2',
      '  tips: "servir avec du riz, se congèle bien"',
      ') {',
      '  tips',
      '}',
      '```',
    ].join('\n'),
    args: {
      recipeId: t.arg({
        type: 'RecipeId',
        required: true,
        description: 'The recipe whose tips to extend, e.g. the id of `"Grandma’s lasagna"`',
      }),
      versionNumber: t.arg({
        type: 'VersionNumber',
        required: true,
        description: 'The version whose tips to extend — the one on screen, e.g. `2`',
      }),
      tips: t.arg({
        type: 'Remarks',
        required: true,
        description:
          'The tips to add, in your own words, e.g. `"servir avec du riz, se congèle bien"`',
      }),
    },
    resolve: async (_root, { recipeId, versionNumber, tips }, { userId }) => {
      const result = await ProposalUseCase.fromTips(userId, recipeId, versionNumber, tips)
      return match(result)
        .with('not-found', domainError)
        .with('quota-exhausted', domainError)
        .with(P.not(P.string), (merged) => ({ tips: merged }))
        .exhaustive()
    },
  }),
)

builder.mutationField('acceptProposal', (t) =>
  t.field({
    type: AcceptProposalResultType,
    description: [
      'Accept a proposal (optionally after editing it). It becomes the next version in the ' +
        'chain. Coming from a cook (requestProposal), it lands on your to-cook list — nobody ' +
        'has made it — and the attempt you just gave (rating, remarks, photo) is recorded on ' +
        'the version you cooked (`basedOn`), which stops owing a try. Coming from an ' +
        'improvement (requestImprovement), it lands there too and nothing is recorded. Coming ' +
        'from a change you already made (requestChange, `cooked: true`), it is saved as ' +
        'already cooked, the attempt is recorded ON IT, and `basedOn` is left untouched.',
      '',
      '```graphql',
      'acceptProposal(recipeId: "9f1c-a3b2", proposal: {',
      '  basedOn: 2',
      '  changeSummary: "Less sugar"',
      '  rationale: "You noted it was too sweet"',
      '  rating: 3',
      '  remarks: "Still a touch too sweet"',
      '  content: { dish: {',
      '    ingredients: [{ name: "Sugar", quantity: "80 g" }]',
      '    steps: ["Rest the dough for 2 h", "Bake at 180°C"]',
      '  } }',
      '}) {',
      '  createdVersion',
      '}',
      '```',
    ].join('\n'),
    args: {
      recipeId: t.arg({
        type: 'RecipeId',
        required: true,
        description: 'The recipe being iterated on, e.g. the id of `"Grandma’s lasagna"`',
      }),
      proposal: t.arg({
        type: ProposalInput,
        required: true,
        description: 'The full suggested version to save (with any edits you made)',
      }),
    },
    resolve: async (_root, { recipeId, proposal }, { userId }) => {
      const accepted: AcceptedProposal = {
        basedOn: proposal.basedOn,
        changeSummary: proposal.changeSummary,
        rationale: proposal.rationale,
        content: versionContentInput(proposal.content),
        tips: [...proposal.tips],
        ...(proposal.cooked ? { cooked: true as const } : {}),
        // The cook that came with it, when there was one — an improvement has none,
        // and the version created is then the one to test. The remarks are optional:
        // a change already eaten can be rated without a word written about it.
        ...(proposal.rating !== null && proposal.rating !== undefined
          ? {
              attempt: {
                rating: proposal.rating,
                ...(proposal.remarks ? { remarks: proposal.remarks } : {}),
                // photo stays a placeholder, as on recordAttempt: accepted on the
                // contract, not stored until GCS photo storage is provisioned.
              },
            }
          : {}),
      }
      const result = await ProposalUseCase.accept(userId, recipeId, accepted)
      const recipe = ensureRecipe(result)
      // addVersion appends n+1 and bumps lastVersionNumber to it, so the newly
      // created version is the recipe's latest (highest) number.
      return { recipe, createdVersion: recipe.lastVersionNumber }
    },
  }),
)

const badInput = (message: string) =>
  new GraphQLError(message, { extensions: { code: 'BAD_USER_INPUT' } })

// The two import flows. Which one runs is decided by the tab the cook launched the
// import from — never guessed from the source — so each has its own mutation, its
// own prompt and its own result shape. Everything else is shared: the sources, the
// cache, the quota and the refusals.
builder.mutationField('analyzeCoffeeImport', (t) =>
  t.field({
    type: CoffeeImportAnalysisType,
    description:
      'Analyze an import source (photos, a URL or raw text) into a structured coffee preview: ' +
      'its brew method and its parameters, never an ingredient list nor steps. Use it for the ' +
      'coffee tab; anything cooked goes through `analyzeCookingImport`. `photos` and `text` may ' +
      'be sent TOGETHER — the bag plus what the cook typed to complete it, read as one source; ' +
      'a `url` stands alone. Results are cached server-side by SHA-256. Spends one import of ' +
      'your monthly AI allowance (see quota) — `QUOTA_EXHAUSTED` once it is used up; importing ' +
      'from a URL is a Premium feature and answers `PREMIUM_REQUIRED` otherwise.',
    args: {
      photos: t.arg.stringList({
        required: true,
        defaultValue: [],
        description:
          'Base64 JPEGs (no data-URL prefix), up to 6 — `[]` when importing from a URL or text alone',
      }),
      url: t.arg.string({
        description: 'A web page to read — never combined with the rest',
      }),
      text: t.arg.string({
        description: 'Raw text, on its own or alongside `photos` to complete what they show',
      }),
    },
    resolve: (_root, { photos, url, text }, { userId }) => {
      // Assembled before the analysis, so a malformed request answers
      // BAD_USER_INPUT rather than being reported as a failed Gemini call.
      const source = pickSource(photos, url, text)
      return analyzed(() => ProposalUseCase.importCoffee(userId, source))
    },
  }),
)

builder.mutationField('analyzeCookingImport', (t) =>
  t.field({
    type: CookingImportAnalysisType,
    description:
      'Analyze an import source (photos, a URL or raw text) into a structured recipe preview: ' +
      'a dish or a Thermomix recipe, with its ingredients and its steps. Use it for the ' +
      'notebook tab; a brewed coffee goes through `analyzeCoffeeImport` and is never answered ' +
      'here. `photos` and `text` may be sent TOGETHER — the pages of a book plus what the cook ' +
      'typed to complete them, read as one recipe; a `url` stands alone. Results are cached ' +
      'server-side by SHA-256. Spends one import of your monthly AI allowance (see quota) — ' +
      '`QUOTA_EXHAUSTED` once it is used up; importing from a URL is a Premium feature and ' +
      'answers `PREMIUM_REQUIRED` otherwise.',
    args: {
      photos: t.arg.stringList({
        required: true,
        defaultValue: [],
        description:
          'Base64 JPEGs (no data-URL prefix), up to 6 — `[]` when importing from a URL or text alone',
      }),
      url: t.arg.string({
        description: 'A recipe web page to read — never combined with the rest',
      }),
      text: t.arg.string({
        description: 'Raw recipe text, on its own or alongside `photos` to complete what they show',
      }),
    },
    resolve: (_root, { photos, url, text }, { userId }) => {
      const source = pickSource(photos, url, text)
      return analyzed(() => ProposalUseCase.importCooking(userId, source))
    },
  }),
)

// The refusals both flows answer with, and the one error they turn a failed Gemini
// call into. Written once so the two can never drift apart.
type ImportRefusal = 'no-recipe-found' | 'quota-exhausted' | 'premium-required'

const analyzed = async <T extends object>(run: () => Promise<T | ImportRefusal>): Promise<T> => {
  let result: T | ImportRefusal
  try {
    result = await run()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Import analysis failed'
    throw new GraphQLError(message, { extensions: { code: 'IMPORT_FAILED' } })
  }
  return typeof result === 'string' ? domainError(result) : result
}

// Photos and text combine into a single source — the cook photographs the pages
// and types what they leave out. A URL never combines with either: reading a web
// page is its own capability, and mixing it with a photo would be two recipes.
const pickSource = (
  photos: string[],
  url: string | null | undefined,
  text: string | null | undefined,
): ImportSource => {
  if (url && (photos.length || text)) throw badInput('A URL cannot be combined with photos or text')
  if (!photos.length && !url && !text) throw badInput('Provide photos, a URL or text')
  if (photos.length) {
    if (photos.length > MAX_IMPORT_PHOTOS)
      throw badInput(`At most ${MAX_IMPORT_PHOTOS} photos are allowed`)
    if (!photos.every((photo) => imageWithinSizeLimit(photo.length)))
      throw badInput('A photo exceeds the 10 MB size limit')
    return { kind: 'photos', photos, ...(text ? { text } : {}) }
  }
  if (url) return { kind: 'url', url }
  return { kind: 'text', text: text as string }
}

// Turn the use-case's discriminated error strings into GraphQL errors.
const ensureRecipe = (result: Recipe | 'not-found' | 'content-type-mismatch') =>
  match(result)
    .with('not-found', domainError)
    .with('content-type-mismatch', domainError)
    .with(P.not(P.string), (recipe) => recipe)
    .exhaustive()
