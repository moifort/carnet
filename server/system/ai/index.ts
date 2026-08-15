import { createHash } from 'node:crypto'
import type { DocumentData } from 'firebase-admin/firestore'
import * as coffeeChange from '~/system/ai/change/coffee'
import * as cookingChange from '~/system/ai/change/cooking'
import * as coffeeImport from '~/system/ai/import/coffee'
import * as cookingImport from '~/system/ai/import/cooking'
import { ImportHash } from '~/system/ai/primitives'
import * as coffeeProposal from '~/system/ai/proposal/coffee'
import * as cookingProposal from '~/system/ai/proposal/cooking'
import * as repository from '~/system/ai/repository'
import * as tips from '~/system/ai/tips'
import type {
  CoffeeChange,
  CoffeeChangeContext,
  CoffeeImportAnalysis,
  CoffeeProposal,
  CoffeeProposalContext,
  CookingChange,
  CookingChangeContext,
  CookingImportAnalysis,
  CookingProposal,
  CookingProposalContext,
  ImportHash as ImportHashType,
  ImportSource,
  TipsContext,
} from '~/system/ai/types'

// Which world an import belongs to. The tab the cook launched it from decides it —
// it is never guessed from the source — and it salts the cache, since the same
// photo read as a coffee or as a dish are two different analyses.
type ImportFlow = 'coffee' | 'cooking'

export namespace Ai {
  export const analyzeCoffeeImport = (source: ImportSource) =>
    cached<CoffeeImportAnalysis>('coffee', source, coffeeImport.analyze)

  export const analyzeCookingImport = (source: ImportSource) =>
    cached<CookingImportAnalysis>('cooking', source, cookingImport.analyze)

  export const proposeNextCoffee = (context: CoffeeProposalContext): Promise<CoffeeProposal> =>
    coffeeProposal.propose(context)

  export const proposeNextCooking = (context: CookingProposalContext): Promise<CookingProposal> =>
    cookingProposal.propose(context)

  // Transcribe a change the cook already made and already ate. Same two worlds as
  // the proposals, and the same rule: never one prompt for both — but the opposite
  // job, since the model applies an opinion instead of having one.
  export const applyCoffeeChange = (context: CoffeeChangeContext): Promise<CoffeeChange> =>
    coffeeChange.apply(context)

  export const applyCookingChange = (context: CookingChangeContext): Promise<CookingChange> =>
    cookingChange.apply(context)

  export const formatTips = (context: TipsContext): Promise<string[]> => tips.format(context)

  // Analyses are memoized globally by a hash of the source (never by the caller):
  // two cooks importing the same page pay for one Gemini call. A "nothing found"
  // outcome is not stored — it must re-scan on the next attempt rather than serve
  // a memoized miss.
  const cached = async <T extends DocumentData>(
    flow: ImportFlow,
    source: ImportSource,
    analyze: (source: ImportSource) => Promise<T | 'no-recipe-found'>,
  ): Promise<T | 'no-recipe-found'> => {
    const importHash = hashSource(flow, source)
    const hit = await repository.findBy<T>(importHash)
    if (hit) return hit.result

    const result = await analyze(source)
    if (result === 'no-recipe-found') return result
    // Best-effort cache: a failed write only costs a re-analysis on the next hit.
    repository.save({ importHash, result, cachedAt: new Date() }).catch(() => {})
    return result
  }

  const hashSource = (flow: ImportFlow, source: ImportSource): ImportHashType => {
    // 'v12' salts the cache: bumped from 'v11' because the import split in two
    // flows — a coffee lost its steps, the cooking prompt lost its coffee — so
    // previously-analysed sources re-run instead of serving a result shaped for a
    // model that no longer exists. The flow itself is part of the key: the same
    // source read as a coffee and as a dish are two analyses, not one.
    // The text typed alongside photos is part of what was analysed, so it is part
    // of the key — two identical photo sets with different notes are two analyses.
    const material =
      source.kind === 'photos'
        ? `v12|${flow}|${source.photos.join('|')}${source.text ? `|note:${source.text}` : ''}`
        : source.kind === 'url'
          ? `v12|${flow}|url:${source.url}`
          : `v12|${flow}|text:${source.text}`
    return ImportHash(createHash('sha256').update(material).digest('hex'))
  }
}
