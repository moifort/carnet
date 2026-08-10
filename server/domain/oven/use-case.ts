import type { OvenProfile } from '~/domain/recipe/content/oven'
import { AssistedProgram } from '~/domain/recipe/primitives'
import { RecipeQuery } from '~/domain/recipe/query'
import type { RecipeId, VersionNumber } from '~/domain/recipe/types'
import type { UserId } from '~/domain/shared/types'
import { config } from '~/system/config'
import { applianceState, findOven, startCooking } from '~/system/electrolux'
import type { OvenState, StartRefusal } from './types'

// An oven this account cannot reach at all — what a configured owner sees when the
// appliance is off, and the shape the sheet renders without a button.
const OFFLINE: OvenState = { reachable: false, remoteControlEnabled: false, settings: {} }

// The oven belongs to exactly one account. Everybody else is told nothing exists,
// rather than shown a button that would always refuse — and an unconfigured
// deployment has no owner, so nobody passes.
const ownsTheOven = (userId: UserId) => config().electrolux?.ownerId === userId

// The profile a version bakes at, if it has one. A coffee never does, and that is a
// fact of the content union rather than a check.
const profileOf = (content: { kind: string; oven?: OvenProfile }): OvenProfile | undefined =>
  content.kind === 'coffee' ? undefined : content.oven

export const OvenUseCase = {
  state: async (userId: UserId): Promise<OvenState | 'oven-unavailable'> => {
    if (!ownsTheOven(userId)) return 'oven-unavailable'

    const oven = await findOven()
    if (oven === 'no-oven') return OFFLINE

    const state = await applianceState(oven.id)
    return {
      reachable: state.reachable,
      remoteControlEnabled: state.remoteControlEnabled,
      settings: {
        ...(state.program ? { program: state.program } : {}),
        ...(state.assisted ? { assisted: AssistedProgram(state.assisted) } : {}),
        ...(state.temperature !== undefined ? { temperature: state.temperature } : {}),
        ...(state.duration !== undefined ? { duration: state.duration } : {}),
        ...(state.core !== undefined ? { core: state.core } : {}),
      },
      ...(state.busy
        ? { running: { ...(state.remaining !== undefined ? { remaining: state.remaining } : {}) } }
        : {}),
    }
  },

  // The profile sent is the one the version carries — never one the caller passes.
  // Correcting a setting before cooking means editing the version, so what the oven
  // does and what the notebook says can never disagree.
  start: async (
    userId: UserId,
    recipeId: RecipeId,
    version: VersionNumber,
  ): Promise<OvenState | StartRefusal> => {
    if (!ownsTheOven(userId)) return 'oven-unavailable'

    // Owning the oven is not owning the recipe: both are checked.
    const recipe = await RecipeQuery.byId(userId, recipeId)
    if (recipe === 'not-found') return 'no-oven-profile'
    const found = await RecipeQuery.versionBy(recipeId, version)
    if (found === 'not-found') return 'no-oven-profile'

    const profile = profileOf(found.content)
    if (!profile) return 'no-oven-profile'

    const oven = await findOven()
    if (oven === 'no-oven') return 'oven-offline'

    const outcome = await startCooking(oven.id, profile)
    if (outcome !== 'started') return outcome
    const state = await OvenUseCase.state(userId)
    return state === 'oven-unavailable' ? 'oven-offline' : state
  },
}
