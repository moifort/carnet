import type { Attempt } from '~/domain/recipe/command'
import type { VersionContent } from '~/domain/recipe/content/types'
import type { Tip, VersionNumber } from '~/domain/recipe/types'

// An ephemeral next-version proposal, already validated into branded domain
// shapes — either freshly branded from the AI (`fromAttempt`) or the user's inline
// edits from iOS. Never persisted: it is generated, returned, and handed straight
// back on accept, which appends it as version n+1 based on `basedOn`.
export type Proposal = {
  basedOn: VersionNumber
  changeSummary: string
  rationale: string
  content: VersionContent
  // The complete tips list of the proposed version — the current tips carried
  // over, advice found in the remarks folded in.
  tips: Tip[]
}

// The client-supplied proposal to accept: everything that becomes version n+1,
// including the `basedOn` it iterates on (threaded back so accept never rescans
// the lineage to recover it) and — when a cook asked for it — the attempt whose
// remarks the AI answered. Absent when the proposal answers an improvement instead:
// nothing was cooked, and the version created is the one to test.
export type AcceptedProposal = Proposal & {
  attempt?: Attempt
  // The version being accepted has ALREADY been made: it transcribes a change the
  // cook applied at the stove and ate (`fromChange`). It is therefore born executed
  // rather than owing a try, and the attempt — the verdict on that very plate —
  // lands on it instead of on the version it iterates from.
  cooked?: true
}
