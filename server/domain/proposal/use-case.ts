import { EntitlementQuery } from '~/domain/entitlement/query'
import { allowsUrlImport } from '~/domain/quota/business-rules'
import { QuotaCommand } from '~/domain/quota/command'
import { QuotaQuery } from '~/domain/quota/query'
import { RecipeCommand } from '~/domain/recipe/command'
import type { VersionContent } from '~/domain/recipe/content/types'
import { VersionContent as brandVersionContent, Tip } from '~/domain/recipe/primitives'
import { RecipeQuery } from '~/domain/recipe/query'
import type { Rating, RecipeId, RecipeType, Remarks, VersionNumber } from '~/domain/recipe/types'
import type { UserId } from '~/domain/shared/types'
import { Ai } from '~/system/ai'
import type {
  Proposal as AiProposal,
  ImportCoffeeParameters,
  ImportSource,
  ImportStep,
  ProposalContext,
} from '~/system/ai/types'
import type { AcceptedProposal, Proposal } from './types'

// Turn the untrusted AI proposal into branded, discriminated content. A dish keeps
// plain-text steps; a Thermomix recipe and a coffee each keep their own per-step
// settings, paired and normalized by the shared `VersionContent` constructor
// (misaligned or empty settings collapse to steps that set nothing).
const brandProposal = (type: RecipeType, proposal: AiProposal): VersionContent => {
  const ingredients = proposal.ingredients
  if (type === 'thermomix')
    return brandVersionContent({
      kind: 'thermomix',
      ingredients,
      steps: proposal.steps.map((s) => ({ text: s.text, settings: s.thermomix })),
    })
  if (type === 'coffee')
    return brandVersionContent({
      kind: 'coffee',
      // The parameters the model answered with — the whole set, one dial moved. A
      // proposal that returned none lands on the empty blocks rather than throwing.
      ...(proposal.coffee ?? {}),
    })
  return brandVersionContent({
    kind: 'dish',
    ingredients,
    steps: proposal.steps.map((s) => s.text),
  })
}

// Rebuild the AI context ingredients from a stored version's content. A coffee has
// none — its dose, its water and its milk are parameters, handed over separately.
const contextIngredients = (content: VersionContent) =>
  content.kind === 'coffee'
    ? []
    : content.ingredients.map((i) => ({ name: i.name as string, quantity: i.quantity as string }))

// The coffee parameters the iteration starts from, as the model reads them: plain
// strings, the roast date in ISO. Absent on anything that is not a coffee.
const contextCoffee = (content: VersionContent): ImportCoffeeParameters | undefined => {
  if (content.kind !== 'coffee') return undefined
  const { roastedOn, ...beans } = content.beans
  return {
    beans: { ...beans, ...(roastedOn ? { roastedOn: roastedOn.toISOString() } : {}) },
    water: content.water,
    extraction: content.extraction,
    ...(content.milk ? { milk: content.milk } : {}),
    gear: content.gear,
  }
}

// Rebuild the AI context steps from a stored version's content: a dish exposes
// steps that set nothing, a Thermomix recipe and a coffee their own per-step
// settings. Both settings objects are always present — `{}` when the step sets
// nothing — so the wire never carries a hole.
const contextSteps = (content: VersionContent): ImportStep[] => {
  if (content.kind === 'thermomix')
    return content.steps.map((s) => ({
      text: s.text as string,
      thermomix: s.settings,
      coffee: {},
    }))
  // A coffee has no steps at all: it is wholly described by its parameters.
  if (content.kind === 'coffee') return []
  return content.steps.map((text) => ({ text: text as string, thermomix: {}, coffee: {} }))
}

// What asks for the next version: the cook that was run, or the improvement the cook
// described. Everything else about the proposal is the same either way.
type ProposalRequest =
  | { attempts: { rating: Rating; remarks: Remarks }[] }
  | { improvement: string }

export namespace ProposalUseCase {
  // Ask the AI for the next version. What motivates it comes from the caller, not
  // from storage: nothing is written until the proposal is accepted, so the cook (or
  // the improvement) exists only in the request. Loads the version iterated on by key
  // — recipe + version, two keyed doc reads, no lineage scan — feeds both to the AI,
  // brands the result into domain shapes and returns it stamped with
  // `basedOn = versionNumber`. Nothing is persisted beyond the quota spent.
  const nextVersion = async (
    userId: UserId,
    recipeId: RecipeId,
    versionNumber: VersionNumber,
    request: ProposalRequest,
  ) => {
    const plan = await EntitlementQuery.planOf(userId)
    if (await QuotaQuery.exhaustedFor(userId, plan, 'iteration')) return 'quota-exhausted'
    const recipe = await RecipeQuery.byId(userId, recipeId)
    if (recipe === 'not-found') return 'not-found'
    const version = await RecipeQuery.versionBy(recipeId, versionNumber)
    if (version === 'not-found') return 'not-found'

    const context: ProposalContext = {
      type: recipe.type,
      category: recipe.category,
      // A coffee iterates within its brewing method; it never changes it.
      ...(recipe.method ? { method: recipe.method } : {}),
      currentIngredients: contextIngredients(version.content),
      ...(contextCoffee(version.content) ? { currentCoffee: contextCoffee(version.content) } : {}),
      currentSteps: contextSteps(version.content),
      currentTips: version.tips.map((tip) => tip as string),
      attempts: 'attempts' in request ? request.attempts : [],
      ...('improvement' in request ? { improvement: request.improvement } : {}),
    }
    const proposal = await Ai.proposeNext(context)
    // Recorded only now: the call went through, so it is billed and it counts.
    await QuotaCommand.record(userId, 'iteration')

    const branded: Proposal = {
      basedOn: version.number,
      changeSummary: proposal.changeSummary,
      rationale: proposal.rationale,
      content: brandProposal(recipe.type, proposal),
      tips: proposal.tips.map(Tip),
    }
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
    const plan = await EntitlementQuery.planOf(userId)
    if (await QuotaQuery.exhaustedFor(userId, plan, 'iteration')) return 'quota-exhausted'
    const recipe = await RecipeQuery.byId(userId, recipeId)
    if (recipe === 'not-found') return 'not-found'
    const version = await RecipeQuery.versionBy(recipeId, versionNumber)
    if (version === 'not-found') return 'not-found'

    const tips = await Ai.formatTips({
      type: recipe.type,
      currentIngredients: contextIngredients(version.content),
      currentSteps: contextSteps(version.content),
      currentTips: version.tips.map((tip) => tip as string),
      requested,
    })
    await QuotaCommand.record(userId, 'iteration')
    return tips.map(Tip)
  }

  // Analyze an import source (photos, a URL or raw text) into a structured recipe
  // preview. The proposal domain is the sole caller of the import AI; confirming
  // this preview persists a brand-new recipe via `RecipeCommand.create` (the recipe
  // domain's `createRecipe` mutation) — nothing is saved here but the quota spent.
  // The analysis itself stays globally SHA-cached (keyed on the source, not the
  // caller), and user-scoped only from the confirmed `create` onward; `userId` is
  // read for the plan and the quota alone. Reading a web page is what the
  // subscription pays for, so a free cook is turned away before any billing.
  export const fromPhoto = async (userId: UserId, source: ImportSource) => {
    const plan = await EntitlementQuery.planOf(userId)
    if (source.kind === 'url' && !allowsUrlImport(plan)) return 'premium-required'
    if (await QuotaQuery.exhaustedFor(userId, plan, 'import')) return 'quota-exhausted'
    const analysis = await Ai.analyzeImport(source)
    // A source the AI found no recipe in costs the cook nothing: it is a miss, not
    // an import. A cache hit does count — the quota is a product promise, not a
    // meter on our Gemini bill.
    if (analysis !== 'no-recipe-found') await QuotaCommand.record(userId, 'import')
    return analysis
  }

  // Accept a proposal as an iteration: append version n+1 from the client-supplied
  // content, stamping the version it iterated on (`basedOn`, threaded back through the
  // payload so no lineage rescan is needed) and the attempt that asked for it, if a
  // cook did. This is the only moment that cook is written down — on the version it
  // produced, never on the one it iterates from, which keeps whatever outcome it
  // already had. Without an attempt (an improvement), the version created is one to
  // test.
  export const accept = async (userId: UserId, recipeId: RecipeId, proposal: AcceptedProposal) =>
    RecipeCommand.addVersion(userId, recipeId, {
      change: proposal.changeSummary,
      basedOn: proposal.basedOn,
      ...(proposal.rationale ? { why: proposal.rationale } : {}),
      content: proposal.content,
      tips: proposal.tips,
      ...(proposal.attempt ? { attempt: proposal.attempt } : {}),
    })
}
