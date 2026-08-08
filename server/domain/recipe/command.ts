import type { WriteBatch } from 'firebase-admin/firestore'
import { lastWorkedOn, methodMatchesType, nextVersionNumber } from '~/domain/recipe/business-rules'
import type { CoffeeParameters } from '~/domain/recipe/content/coffee'
import type { VersionContent } from '~/domain/recipe/content/types'
import * as repository from '~/domain/recipe/infrastructure/repository'
import { randomRecipeId, VersionNumber } from '~/domain/recipe/primitives'
import type {
  BrewMethod,
  DishCategory,
  Rating,
  Recipe,
  RecipeId,
  RecipeTitle,
  RecipeType,
  RecipeVersion,
  Remarks,
  Tip,
  VersionNumber as VersionNumberT,
  VersionOrigin,
  Warning,
} from '~/domain/recipe/types'
import { learnedVocabulary } from '~/domain/recipe/vocabulary'
import type { UserId } from '~/domain/shared/types'
import { atomically } from '~/utils/firestore'

const FIRST_VERSION = VersionNumber(1)

// A coffee version teaches the cook's vocabulary — the waters, machines and beans
// its free-text fields carry. Folded into the caller's batch so the two land
// together; a version of any other type teaches nothing.
const teachVocabulary = async (userId: UserId, content: VersionContent, batch: WriteBatch) => {
  if (content.kind !== 'coffee') return
  const current = await repository.findVocabulary(userId)
  await repository.saveVocabulary(learnedVocabulary(current, content), batch)
}

export type NewRecipeInput = {
  type: RecipeType
  category: DishCategory
  // Required on a coffee, rejected on anything else — see `methodMatchesType`.
  method?: BrewMethod
  title: RecipeTitle
  content: VersionContent
  tips: Tip[]
}

// The cook that produced a version: the rating, remarks and photo of the attempt
// whose remarks the AI answered. It rides along with the version it gave birth to.
export type Attempt = {
  rating: Rating
  remarks: Remarks
  photoPath?: string
}

export type NewVersionInput = {
  change: string
  basedOn?: VersionNumberT
  why?: string
  content: VersionContent
  tips: Tip[]
  // The attempt that produced this version — absent when an improvement asked for it
  // instead, in which case the version created is one to test.
  attempt?: Attempt
}

// What can be retouched on the aggregate after creation. Anything left out stays as
// it was; `favorite: false` un-favourites.
export type UpdateRecipeInput = {
  title?: RecipeTitle
  category?: DishCategory
  // Refiling a coffee under another brew method. Rejected on a recipe that is not
  // one — the type itself is never editable.
  method?: BrewMethod
  favorite?: boolean
}

export type RecordAttemptInput = {
  recipeId: RecipeId
  versionNumber: VersionNumberT
  rating: Rating
  // Absent when the cook was rated without a word written about it — a bare rating
  // ends the flow, it never asks the AI for anything.
  remarks?: Remarks
  photoPath?: string
}

export namespace RecipeCommand {
  // Create → recipe + its v1, written atomically. v1 is the original planned attempt
  // (no `basedOn`, it iterates on nothing) and awaits its first cook.
  export const create = async (userId: UserId, input: NewRecipeInput, sourceLabel?: string) => {
    // The body's discriminant must mirror the recipe type — a dish recipe cannot
    // carry Thermomix content and vice versa. Enforced here, no throw.
    if (input.content.kind !== input.type) return 'content-type-mismatch' as const
    // A brew method belongs to a coffee and to nothing else.
    if (!methodMatchesType(input)) return 'method-mismatch' as const
    const now = new Date()
    const recipe: Recipe = {
      id: randomRecipeId(),
      userId,
      type: input.type,
      // A coffee is a drink, whatever the AI guessed: the course axis says nothing
      // about it, its `method` is what the coffee tab reads on.
      category: input.type === 'coffee' ? 'drink' : input.category,
      ...(input.method ? { method: input.method } : {}),
      title: input.title,
      warnings: [],
      lastVersionNumber: FIRST_VERSION,
      createdAt: now,
      // `lastWorkedOn` of a lineage of one: the v1 born with it, this instant. No
      // lineage to read — there is nothing else in it yet.
      updatedAt: now,
    }
    const origin: VersionOrigin = {
      kind: 'import',
      ...(sourceLabel ? { detail: sourceLabel } : {}),
    }
    return atomically(async (batch) => {
      await repository.save(recipe, batch)
      await repository.saveVersion(firstVersion(recipe, origin, input), batch)
      await teachVocabulary(userId, input.content, batch)
      return recipe
    })
  }

  // Accepted AI iteration → append version n+1 to the lineage, stamping the version
  // it was proposed from (`basedOn`). No reference/pending pointer to maintain: the
  // recipe just bumps its `lastVersionNumber` and restamps its date. The attempt that
  // asked for this version lands on it, never on the version it iterates on — that one
  // only loses its `toTest` flag, since the cook that answers it is the cook it owed.
  // Born of an improvement instead (no attempt), the version is the one waiting to be
  // cooked: it is the sole way a version becomes `toTest`.
  export const addVersion = async (userId: UserId, recipeId: RecipeId, input: NewVersionInput) => {
    const recipe = await repository.findBy(userId, recipeId)
    if (!recipe) return 'not-found' as const
    // The body's discriminant must mirror the recipe type (see `create`).
    if (input.content.kind !== recipe.type) return 'content-type-mismatch' as const
    const lineage = await repository.findVersionsOf(recipeId)
    const number = nextVersionNumber(recipe.lastVersionNumber)
    const now = new Date()
    const version: RecipeVersion = {
      userId,
      recipeId,
      number,
      createdAt: now,
      // Born untouched: a version is last modified when it is created.
      updatedAt: now,
      origin: { kind: 'ai-proposal' },
      change: input.change,
      ...(input.basedOn !== undefined ? { basedOn: input.basedOn } : {}),
      ...(input.why ? { why: input.why } : {}),
      content: input.content,
      tips: input.tips,
      // The outcome of the attempt that produced it, when there was one; without it
      // the version is what the cook asked for and still owes a try.
      ...(input.attempt
        ? {
            executedAt: new Date(),
            rating: input.attempt.rating,
            remarks: input.attempt.remarks,
            ...(input.attempt.photoPath ? { photoPath: input.attempt.photoPath } : {}),
          }
        : { toTest: true as const }),
    }
    // The version this one answers has been cooked: it owes nothing anymore.
    const cooked = input.attempt ? cookedBase(lineage, input.basedOn) : undefined
    const updated: Recipe = {
      ...recipe,
      lastVersionNumber: number,
      updatedAt: lastWorkedOn(written(lineage, cooked, version)),
    }
    return atomically(async (batch) => {
      await repository.saveVersion(version, batch)
      if (cooked) await repository.saveVersion(cooked, batch)
      await repository.save(updated, batch)
      await teachVocabulary(userId, input.content, batch)
      return updated
    })
  }

  // Record the attempt outcome onto a version — the cook that asks for nothing more
  // (a rating, maybe a photo, no remarks). Overwritable: re-cooking the same version
  // simply rewrites its rating/remarks/executedAt in place. The outcome and the
  // recipe's restamped date land in one batch (all-or-nothing).
  export const recordAttempt = async (
    userId: UserId,
    input: RecordAttemptInput,
  ): Promise<RecipeVersion | 'not-found'> => {
    const recipe = await repository.findBy(userId, input.recipeId)
    if (!recipe) return 'not-found' as const
    // The whole lineage, not just the version cooked: the rating may hand the
    // reference over to another version, and the recipe is dated by that one.
    const lineage = await repository.findVersionsOf(input.recipeId)
    const version = lineage.find(({ number }) => number === input.versionNumber)
    if (!version) return 'not-found' as const
    // Drop the previous photo and remarks before spreading: a re-cook that leaves
    // them out must erase what the earlier attempt left behind, not inherit it. The
    // `toTest` flag goes too — the version has just been cooked.
    const {
      photoPath: _replacedPhoto,
      remarks: _replacedRemarks,
      toTest: _cooked,
      ...rest
    } = version
    const now = new Date()
    const executed: RecipeVersion = {
      ...rest,
      updatedAt: now,
      executedAt: now,
      rating: input.rating,
      ...(input.remarks ? { remarks: input.remarks } : {}),
      ...(input.photoPath ? { photoPath: input.photoPath } : {}),
    }
    const updatedRecipe: Recipe = {
      ...recipe,
      updatedAt: lastWorkedOn(written(lineage, executed)),
    }
    return atomically(async (batch) => {
      await repository.saveVersion(executed, batch)
      await repository.save(updatedRecipe, batch)
      return executed
    })
  }

  // Correct a version's rating in place — the cook is fixing the verdict they gave
  // (or giving one to a version they cooked without logging it), not re-cooking it:
  // the photo and the remarks of the attempt are left exactly as they were, unlike
  // `recordAttempt`, which replaces the whole outcome. A version that had never been
  // cooked becomes one that has: it gains its `executedAt` and stops owing a try, so
  // a rating and "still to test" are never both true.
  export const updateRating = async (
    userId: UserId,
    recipeId: RecipeId,
    versionNumber: VersionNumberT,
    rating: Rating,
  ): Promise<RecipeVersion | 'not-found'> => {
    const recipe = await repository.findBy(userId, recipeId)
    if (!recipe) return 'not-found' as const
    // The whole lineage: correcting a note can hand the reference over (see
    // `recordAttempt`).
    const lineage = await repository.findVersionsOf(recipeId)
    const version = lineage.find((candidate) => candidate.number === versionNumber)
    if (!version) return 'not-found' as const
    const now = new Date()
    const { toTest: _cooked, ...rest } = version
    const updated: RecipeVersion = {
      ...rest,
      rating,
      executedAt: version.executedAt ?? now,
      updatedAt: now,
    }
    const updatedRecipe: Recipe = { ...recipe, updatedAt: lastWorkedOn(written(lineage, updated)) }
    return atomically(async (batch) => {
      await repository.saveVersion(updated, batch)
      await repository.save(updatedRecipe, batch)
      return updated
    })
  }

  // Rewrite a version's tips in place — the second overwritable part of the
  // envelope, beside the attempt outcome. No new version: the cook is refining the
  // advice on the version they have, not iterating on it. Full-replacement (the
  // accepted tips proposal is the complete list), plus the recipe's restamped date,
  // in one batch.
  export const updateTips = async (
    userId: UserId,
    recipeId: RecipeId,
    versionNumber: VersionNumberT,
    tips: Tip[],
  ): Promise<RecipeVersion | 'not-found'> => {
    const recipe = await repository.findBy(userId, recipeId)
    if (!recipe) return 'not-found' as const
    const lineage = await repository.findVersionsOf(recipeId)
    const version = lineage.find((candidate) => candidate.number === versionNumber)
    if (!version) return 'not-found' as const
    const updated: RecipeVersion = { ...version, tips, updatedAt: new Date() }
    const updatedRecipe: Recipe = { ...recipe, updatedAt: lastWorkedOn(written(lineage, updated)) }
    return atomically(async (batch) => {
      await repository.saveVersion(updated, batch)
      await repository.save(updatedRecipe, batch)
      return updated
    })
  }

  // Correct a coffee version's parameters in place — the cook is fixing what they
  // logged (a roast date read wrong, the grinder they forgot), not iterating on the
  // recipe: no version is created, and the brewing steps are left exactly as they
  // were. Full replacement, like `updateTips`: the edited parameters ARE the
  // complete set. Every free-text value typed also teaches the vocabulary, in the
  // same batch.
  export const updateCoffeeParameters = async (
    userId: UserId,
    recipeId: RecipeId,
    versionNumber: VersionNumberT,
    parameters: CoffeeParameters,
  ): Promise<RecipeVersion | 'not-found' | 'not-a-coffee'> => {
    const recipe = await repository.findBy(userId, recipeId)
    if (!recipe) return 'not-found' as const
    const lineage = await repository.findVersionsOf(recipeId)
    const version = lineage.find((candidate) => candidate.number === versionNumber)
    if (!version) return 'not-found' as const
    // Parameters belong to a coffee and to nothing else — a dish has ingredients.
    if (version.content.kind !== 'coffee') return 'not-a-coffee' as const
    const content: VersionContent = {
      ...parameters,
      kind: 'coffee',
      steps: version.content.steps,
    }
    const updated: RecipeVersion = { ...version, content, updatedAt: new Date() }
    const updatedRecipe: Recipe = { ...recipe, updatedAt: lastWorkedOn(written(lineage, updated)) }
    return atomically(async (batch) => {
      await repository.saveVersion(updated, batch)
      await repository.save(updatedRecipe, batch)
      await teachVocabulary(userId, content, batch)
      return updated
    })
  }

  // Rewrite the recipe's warnings in place — the aggregate-level counterpart of
  // `updateTips`: the cook is pinning cautions on the recipe, not iterating on it,
  // so no version is created and no batch is needed (a single document).
  // Full-replacement (the edited list is the complete one), `[]` clears the banner.
  // The recipe's date does not move: no version was worked on.
  export const updateWarnings = async (
    userId: UserId,
    recipeId: RecipeId,
    warnings: Warning[],
  ): Promise<Recipe | 'not-found'> => {
    const recipe = await repository.findBy(userId, recipeId)
    if (!recipe) return 'not-found' as const
    return repository.save({ ...recipe, warnings })
  }

  // The touches a cook can make to the aggregate itself: its name, its course or its
  // brew method, and whether it is a favourite. Each is optional — what is left out
  // stays as it was. `favorite: false` drops the field entirely (the full-document
  // write erases it), so absence is the single spelling of "not a favourite". A
  // category or method change keeps the library's sort honest on its own:
  // `repository.save` re-derives `categoryRank` and `methodRank`. None of these is
  // cooking, so none of them moves the recipe's date: hearting a recipe must not
  // shuffle the notebook.
  export const update = async (userId: UserId, recipeId: RecipeId, input: UpdateRecipeInput) => {
    const recipe = await repository.findBy(userId, recipeId)
    if (!recipe) return 'not-found' as const
    // A brew method belongs to a coffee: a dish never grows one, since the type
    // itself is not editable.
    if (input.method && recipe.type !== 'coffee') return 'method-mismatch' as const
    // Spread without the flag, then put it back only if it holds — otherwise the
    // rewritten document simply has no `favorite` field.
    const { favorite: _dropped, ...rest } = recipe
    const favorite = input.favorite ?? recipe.favorite === true
    const updated: Recipe = {
      ...rest,
      ...(input.title ? { title: input.title } : {}),
      // A coffee stays a drink — refiling it means changing its method.
      ...(input.category && recipe.type !== 'coffee' ? { category: input.category } : {}),
      ...(input.method ? { method: input.method } : {}),
      ...(favorite ? { favorite: true as const } : {}),
    }
    return repository.save(updated)
  }

  // Delete one version from the lineage. Its children are re-based onto the version
  // it iterated on (deleting a root leaves them iterating on nothing), so the chain
  // stays linear around the hole; the allocator (`lastVersionNumber`) never rolls
  // back, a deleted number is never reused. Deleting the sole version is deleting
  // the recipe — a recipe without a version does not exist.
  export const removeVersion = async (
    userId: UserId,
    recipeId: RecipeId,
    number: VersionNumberT,
  ) => {
    const recipe = await repository.findBy(userId, recipeId)
    if (!recipe) return 'not-found' as const
    const versions = await repository.findVersionsOf(recipeId)
    const target = versions.find((version) => version.number === number)
    if (!target) return 'not-found' as const
    if (versions.length === 1) {
      await repository.remove(recipeId)
      return undefined
    }
    // The children iterate on what the deleted version iterated on — its own base,
    // or nothing when it was a root. Bookkeeping, not an edit: their `updatedAt`
    // stays put, so the history does not move a version the cook never touched.
    const rebased = versions
      .filter((version) => version.basedOn === number)
      .map(({ basedOn: _deleted, ...rest }) => ({
        ...rest,
        ...(target.basedOn !== undefined ? { basedOn: target.basedOn } : {}),
      }))
    // Losing a version can hand the reference over to another one — deleting the
    // best-rated attempt re-dates the recipe by whatever now answers for it.
    const remaining = written(versions, ...rebased).filter((version) => version.number !== number)
    const updated: Recipe = { ...recipe, updatedAt: lastWorkedOn(remaining) }
    return atomically(async (batch) => {
      for (const child of rebased) await repository.saveVersion(child, batch)
      await repository.removeVersion(recipeId, number, batch)
      await repository.save(updated, batch)
      return undefined
    })
  }

  export const remove = async (userId: UserId, recipeId: RecipeId) => {
    const recipe = await repository.findBy(userId, recipeId)
    if (!recipe) return 'not-found' as const
    await repository.remove(recipeId)
    return undefined
  }

  // Portability: the cook's recipes and versions become exactly what the backup
  // carried. The restore writes before it deletes — see the repository: the
  // notebook is never emptied first, because a restore that dies halfway through
  // must not be what destroys the data it was recovering.
  export const replaceAllForUser = async (
    userId: UserId,
    recipes: Recipe[],
    versions: RecipeVersion[],
  ) => repository.replaceAllByUser(userId, recipes, versions)

  // Everything this domain holds on one cook, erased: the notebook and every
  // version in it. Called only when the account itself goes.
  export const forget = (userId: UserId): Promise<void> => repository.removeAllByUser(userId)

  // The lineage as it will read once the pending writes land — the list the recipe's
  // date is computed from, since those documents are not saved yet. A written version
  // replaces the stored one of the same number, or joins the chain when it is new.
  const written = (lineage: RecipeVersion[], ...pending: (RecipeVersion | undefined)[]) => {
    const byNumber = new Map(lineage.map((version) => [version.number, version]))
    for (const version of pending) if (version) byNumber.set(version.number, version)
    return [...byNumber.values()]
  }

  // The version an attempt-born iteration is based on, stripped of its `toTest` flag —
  // or nothing when there is no base, or it was not waiting to be cooked. Bookkeeping
  // again: the outcome landed on the new version, so the base keeps its `updatedAt`.
  const cookedBase = (lineage: RecipeVersion[], basedOn?: VersionNumberT) => {
    if (basedOn === undefined) return undefined
    const base = lineage.find((version) => version.number === basedOn)
    if (!base?.toTest) return undefined
    const { toTest: _cooked, ...rest } = base
    return rest
  }

  const firstVersion = (
    recipe: Recipe,
    origin: VersionOrigin,
    input: NewRecipeInput,
  ): RecipeVersion => ({
    userId: recipe.userId,
    recipeId: recipe.id,
    number: FIRST_VERSION,
    createdAt: recipe.createdAt,
    updatedAt: recipe.createdAt,
    origin,
    // No `change`/`basedOn`: v1 is the original, it iterates on nothing and
    // changes nothing. No outcome either — it awaits its first cook.
    content: input.content,
    tips: input.tips,
  })
}
