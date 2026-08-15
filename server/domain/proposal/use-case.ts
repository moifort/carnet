import { EntitlementQuery } from '~/domain/entitlement/query'
import { allowsUrlImport } from '~/domain/quota/business-rules'
import { QuotaCommand } from '~/domain/quota/command'
import { QuotaQuery } from '~/domain/quota/query'
import { RecipeCommand } from '~/domain/recipe/command'
import type { VersionContent } from '~/domain/recipe/content/types'
import { VersionContent as brandVersionContent, Tip } from '~/domain/recipe/primitives'
import { RecipeQuery } from '~/domain/recipe/query'
import type {
  BrewMethod,
  DishCategory,
  Rating,
  RecipeId,
  Remarks,
  VersionNumber,
} from '~/domain/recipe/types'
import type { UserId } from '~/domain/shared/types'
import { Ai } from '~/system/ai'
import type {
  CoffeeProposal,
  CookingProposal,
  CookingRecipeType,
  ImportCoffeeParameters,
  ImportSource,
  ImportStep,
} from '~/system/ai/types'
import type { AcceptedProposal, Proposal } from './types'

// Turn the untrusted AI proposal into branded, discriminated content. A dish keeps
// plain-text steps, a Thermomix recipe its per-step settings — both normalized by
// the shared `VersionContent` constructor.
// Carried forward by the CODE, never by the model: the oven is set by hand, on the
// appliance or in the app, and an iteration is about the recipe rather than the
// heat. Without this the accepted version would silently lose the profile — the
// cook would find the oven section gone after saying yes to a change of seasoning.
const carriedOven = (content: VersionContent) =>
  content.kind === 'coffee' || !content.oven ? {} : { oven: content.oven }

const brandCookingProposal = (
  type: CookingRecipeType,
  current: VersionContent,
  proposal: Pick<CookingProposal, 'ingredients' | 'steps'>,
): VersionContent =>
  type === 'thermomix'
    ? brandVersionContent({
        kind: 'thermomix',
        ingredients: proposal.ingredients,
        steps: proposal.steps.map((s) => ({ text: s.text, settings: s.thermomix })),
        ...carriedOven(current),
      })
    : brandVersionContent({
        kind: 'dish',
        ingredients: proposal.ingredients,
        steps: proposal.steps.map((s) => s.text),
        ...carriedOven(current),
      })

// The same, for a coffee: the whole parameter set the model answered with, one dial
// moved. A proposal that returned none lands on the empty blocks rather than throwing.
const brandCoffeeProposal = (proposal: CoffeeProposal): VersionContent =>
  brandVersionContent({ kind: 'coffee', ...proposal.parameters })

// Rebuild the AI context ingredients from a stored version's content. A coffee has
// none — its dose, its water and its milk are parameters, handed over separately.
// A line that is a recipe of its own travels as a flag, so the model keeps it whole
// instead of unfolding it into the components of a recipe it was never shown.
const contextIngredients = (content: VersionContent) =>
  content.kind === 'coffee'
    ? []
    : content.ingredients.map((i) => ({
        name: i.name as string,
        quantity: i.quantity as string,
        component: i.component !== undefined,
      }))

// The coffee parameters the iteration starts from, as the model reads them: plain
// strings, the roast date in ISO.
const contextParameters = (
  content: VersionContent & { kind: 'coffee' },
): ImportCoffeeParameters => {
  const { roastedOn, ...beans } = content.beans
  return {
    beans: { ...beans, ...(roastedOn ? { roastedOn: roastedOn.toISOString() } : {}) },
    water: content.water,
    extraction: content.extraction,
    ...(content.milk ? { milk: content.milk } : {}),
    gear: content.gear,
  }
}

// Rebuild the AI context steps from a stored version's content: a dish exposes steps
// that set nothing, a Thermomix recipe its own per-step settings, always present
// (`{}` when the step sets nothing) so the wire never carries a hole. A coffee has
// no steps at all — it is wholly described by its parameters.
const contextSteps = (content: VersionContent): ImportStep[] => {
  if (content.kind === 'thermomix')
    return content.steps.map((s) => ({ text: s.text as string, thermomix: s.settings }))
  if (content.kind === 'coffee') return []
  return content.steps.map((text) => ({ text: text as string, thermomix: {} }))
}

// What asks for the next version: the cook that was run, or the improvement the cook
// described. Everything else about the proposal is the same either way.
type ProposalRequest =
  | { attempts: { rating: Rating; remarks: Remarks }[] }
  | { improvement: string }

// The same request, as both prompts read it: what was tasted (or asked for) and the
// tips the next version starts from.
type AskedFor = {
  currentTips: string[]
  attempts: { rating: number; remarks: string }[]
  improvement?: string
}

// One iteration of a coffee: the dials it starts from, the method it stays within.
const coffeeAnswer = async (
  asked: AskedFor,
  method: BrewMethod,
  content: VersionContent & { kind: 'coffee' },
) => {
  const proposal = await Ai.proposeNextCoffee({
    ...asked,
    method,
    currentParameters: contextParameters(content),
  })
  return {
    changeSummary: proposal.changeSummary,
    rationale: proposal.rationale,
    content: brandCoffeeProposal(proposal),
    tips: proposal.tips.map(Tip),
  }
}

// One iteration of something cooked: its ingredient list and its gestures.
const cookingAnswer = async (
  asked: AskedFor,
  category: DishCategory,
  content: VersionContent & { kind: CookingRecipeType },
) => {
  const proposal = await Ai.proposeNextCooking({
    ...asked,
    type: content.kind,
    category,
    currentIngredients: contextIngredients(content),
    currentSteps: contextSteps(content),
  })
  return {
    changeSummary: proposal.changeSummary,
    rationale: proposal.rationale,
    content: brandCookingProposal(content.kind, content, proposal),
    tips: proposal.tips.map(Tip),
  }
}

// The version a change is applied to, in the cook's own words. Its answer carries
// neither rationale nor tips — see `CookingChange`.
const coffeeChangeAnswer = async (
  change: string,
  method: BrewMethod,
  content: VersionContent & { kind: 'coffee' },
) => {
  const applied = await Ai.applyCoffeeChange({
    change,
    method,
    currentParameters: contextParameters(content),
  })
  return {
    changeSummary: applied.changeSummary,
    content: brandVersionContent({ kind: 'coffee', ...applied.parameters }),
  }
}

const cookingChangeAnswer = async (
  change: string,
  category: DishCategory,
  content: VersionContent & { kind: CookingRecipeType },
) => {
  const applied = await Ai.applyCookingChange({
    change,
    type: content.kind,
    category,
    currentIngredients: contextIngredients(content),
    currentSteps: contextSteps(content),
  })
  return {
    changeSummary: applied.changeSummary,
    content: brandCookingProposal(content.kind, content, applied),
  }
}

// Everything an iteration on an existing version starts with: the plan, the quota
// it is gated on, and the recipe/version pair it works from — two keyed doc reads,
// no lineage scan. Written once so the three flows can never gate differently.
const iterationOn = async (userId: UserId, recipeId: RecipeId, versionNumber: VersionNumber) => {
  const plan = await EntitlementQuery.planOf(userId)
  if (await QuotaQuery.exhaustedFor(userId, plan, 'iteration')) return 'quota-exhausted' as const
  const recipe = await RecipeQuery.byId(userId, recipeId)
  if (recipe === 'not-found') return 'not-found' as const
  const version = await RecipeQuery.versionBy(recipeId, versionNumber)
  if (version === 'not-found') return 'not-found' as const
  return { recipe, version }
}

export namespace ProposalUseCase {
  // Ask the AI for the next version. What motivates it comes from the caller, not
  // from storage: nothing is written until the proposal is accepted, so the cook (or
  // the improvement) exists only in the request. Feeds the loaded version to the AI,
  // brands the result into domain shapes and returns it stamped with
  // `basedOn = versionNumber`. Nothing is persisted beyond the quota spent.
  const nextVersion = async (
    userId: UserId,
    recipeId: RecipeId,
    versionNumber: VersionNumber,
    request: ProposalRequest,
  ) => {
    const loaded = await iterationOn(userId, recipeId, versionNumber)
    if (typeof loaded === 'string') return loaded
    const { recipe, version } = loaded

    // The question is the same in both worlds — what was cooked, what was asked —
    // but the answer is not, so each flow builds its own context and reads its own
    // prompt. Recorded only after the call went through: it is billed, so it counts.
    const asked = {
      currentTips: version.tips.map((tip) => tip as string),
      attempts: 'attempts' in request ? request.attempts : [],
      ...('improvement' in request ? { improvement: request.improvement } : {}),
    }
    const { content } = version
    const answered =
      content.kind === 'coffee'
        ? await coffeeAnswer(asked, recipe.method ?? 'other', content)
        : await cookingAnswer(asked, recipe.category, content)
    await QuotaCommand.record(userId, 'iteration')

    const branded: Proposal = { basedOn: version.number, ...answered }
    return branded
  }

  // The next version answering the cook that was just run.
  export const fromAttempt = async (
    userId: UserId,
    recipeId: RecipeId,
    versionNumber: VersionNumber,
    attempt: { rating: Rating; remarks: Remarks },
  ) => nextVersion(userId, recipeId, versionNumber, { attempts: [attempt] })

  // The next version answering an improvement asked for outright — no cook behind it,
  // so the version it produces is one to test.
  export const fromImprovement = async (
    userId: UserId,
    recipeId: RecipeId,
    versionNumber: VersionNumber,
    improvement: Remarks,
  ) => nextVersion(userId, recipeId, versionNumber, { improvement })

  // The version the cook already cooked: the change they made themselves, applied
  // to the version on screen by a model whose whole job is to transcribe it. Same
  // ephemeral shape as a proposal, so the same review screen accepts it — but with
  // no rationale (nobody asked why) and the tips of the version it starts from,
  // carried over untouched: a change rewrites the method, never the advice around
  // it. Accepting it creates a version that has already been made (`cooked`).
  export const fromChange = async (
    userId: UserId,
    recipeId: RecipeId,
    versionNumber: VersionNumber,
    change: Remarks,
  ) => {
    const loaded = await iterationOn(userId, recipeId, versionNumber)
    if (typeof loaded === 'string') return loaded
    const { recipe, version } = loaded

    const { content } = version
    const answered =
      content.kind === 'coffee'
        ? await coffeeChangeAnswer(change, recipe.method ?? 'other', content)
        : await cookingChangeAnswer(change, recipe.category, content)
    await QuotaCommand.record(userId, 'iteration')

    const branded: Proposal = {
      basedOn: version.number,
      rationale: '',
      tips: version.tips,
      ...answered,
    }
    return branded
  }

  // The complete tips list merging what the cook just typed into the version's
  // current tips — reworded and deduplicated by the AI. Ephemeral like the version
  // proposals: nothing is persisted until the cook accepts it, which rewrites the
  // SAME version's tips via `RecipeCommand.updateTips` (no new version at stake).
  // It is still a Gemini call on an existing version, so it spends an iteration.
  export const fromTips = async (
    userId: UserId,
    recipeId: RecipeId,
    versionNumber: VersionNumber,
    requested: Remarks,
  ) => {
    const loaded = await iterationOn(userId, recipeId, versionNumber)
    if (typeof loaded === 'string') return loaded
    const { version } = loaded

    const tips = await Ai.formatTips({
      currentIngredients: contextIngredients(version.content),
      currentSteps: contextSteps(version.content),
      // A coffee grounds the rewording on its dials — it has nothing else.
      ...(version.content.kind === 'coffee'
        ? { currentParameters: contextParameters(version.content) }
        : {}),
      currentTips: version.tips.map((tip) => tip as string),
      requested,
    })
    await QuotaCommand.record(userId, 'iteration')
    return tips.map(Tip)
  }

  // Analyze an import source (photos, a URL or raw text) into a structured preview.
  // The proposal domain is the sole caller of the import AI; confirming this preview
  // persists a brand-new recipe via `RecipeCommand.create` (the recipe domain's
  // `createRecipe` mutation) — nothing is saved here but the quota spent. The
  // analysis itself stays globally SHA-cached (keyed on the source and the flow, not
  // on the caller), and user-scoped only from the confirmed `create` onward; `userId`
  // is read for the plan and the quota alone. Reading a web page is what the
  // subscription pays for, so a free cook is turned away before any billing.
  //
  // Two flows, one gate: which one runs is decided by the tab the cook launched the
  // import from, never guessed from the source.
  export const importCoffee = async (userId: UserId, source: ImportSource) =>
    analyzed(userId, source, Ai.analyzeCoffeeImport)

  export const importCooking = async (userId: UserId, source: ImportSource) =>
    analyzed(userId, source, Ai.analyzeCookingImport)

  const analyzed = async <T>(
    userId: UserId,
    source: ImportSource,
    analyze: (source: ImportSource) => Promise<T | 'no-recipe-found'>,
  ) => {
    const plan = await EntitlementQuery.planOf(userId)
    if (source.kind === 'url' && !allowsUrlImport(plan)) return 'premium-required' as const
    if (await QuotaQuery.exhaustedFor(userId, plan, 'import')) return 'quota-exhausted' as const
    const analysis = await analyze(source)
    // A source the AI found nothing in costs the cook nothing: it is a miss, not an
    // import. A cache hit does count — the quota is a product promise, not a meter
    // on our Gemini bill.
    if (analysis !== 'no-recipe-found') await QuotaCommand.record(userId, 'import')
    return analysis
  }

  // Accept a proposal as an iteration: append version n+1 from the client-supplied
  // content, stamping the version it iterated on (`basedOn`, threaded back through the
  // payload so no lineage rescan is needed) and the attempt that asked for it, if a
  // cook did. This is the only moment that cook is written down. Without an attempt
  // (an improvement), nothing is recorded and the version created is one to test.
  // `cooked` flips the whole thing over: the version accepted is one the cook has
  // already made (a change of theirs, transcribed), so it owes no try and the attempt
  // lands on IT rather than on the version it iterates from.
  export const accept = async (userId: UserId, recipeId: RecipeId, proposal: AcceptedProposal) =>
    RecipeCommand.addVersion(userId, recipeId, {
      change: proposal.changeSummary,
      basedOn: proposal.basedOn,
      ...(proposal.rationale ? { why: proposal.rationale } : {}),
      content: proposal.content,
      tips: proposal.tips,
      ...(proposal.attempt ? { attempt: proposal.attempt } : {}),
      ...(proposal.cooked ? { cooked: true as const } : {}),
    })
}
