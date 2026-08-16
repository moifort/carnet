import type { VersionContent } from '~/domain/recipe/content/types'
import type {
  Rating,
  RecipeId,
  Remarks,
  Tip,
  VersionNumber,
  VersionOrigin,
  Warning,
} from '~/domain/recipe/types'
import type { UserId } from '~/domain/shared/types'

// One entry in a recipe's linear lineage (v1 → v2 → …). The type-agnostic
// versioning envelope: its lineage (origin/change/basedOn/why) and its `content`
// (the discriminated recipe body) are immutable, but a version *is* an attempt —
// it is a planned attempt while `executedAt` is absent, then carries its outcome
// (rating/remarks/photo). The outcome is overwritable — recording again re-cooks
// the same version in place rather than forcing a new one — and so are the `tips`
// and the `warnings`, the only three parts of a version that can be rewritten
// without creating one.
export type RecipeVersion = {
  userId: UserId
  recipeId: RecipeId
  number: VersionNumber
  createdAt: Date
  // When the version was last rewritten in place — its outcome re-recorded, its tips
  // or its coffee parameters corrected. Equal to `createdAt` until the cook touches
  // it, and it is the date the app reads: what matters about a version is when it was
  // last worked on, not when the lineage grew it. Only the cook's own edits bump it;
  // the bookkeeping writes (a child re-based by a deletion, a `toTest` flag dropped)
  // change nothing the cook wrote, so they leave it alone.
  updatedAt: Date
  origin: VersionOrigin
  change?: string // human summary of what changed ("Bouillon 700 → 650 ml"); absent on v1
  // The version this one iterates on — set to the attempt it was proposed from
  // (`versionToOpen` at proposal time); absent on the original v1, which iterates
  // on nothing. Records the lineage; it never decides which version opens.
  basedOn?: VersionNumber
  why?: string // AI rationale, for proposed versions
  // The recipe body, discriminated by `kind` (mirrors the recipe type): ingredients
  // plus steps, plain-text for a dish, each carrying Thermomix settings otherwise.
  content: VersionContent
  // The version's cooking tips ("Servir avec du riz", "Se congèle bien") — advice
  // that is neither an ingredient nor a step. Type-agnostic, so it lives on the
  // envelope, not in `content`; and unlike the content it is overwritable in place
  // (`updateTips` rewrites the whole list without creating a version). `[]` = none.
  tips: Tip[]
  // The cook's cautions on this attempt ("Le fouet doit être mis dès le début") —
  // the banner atop the recipe sheet, so a critical gesture is read before cooking
  // starts. Versioned like everything that describes the plate, and carried onto the
  // next iteration by `addVersion`: a caution the cook wrote must not evaporate
  // because they said yes to a change of seasoning. Overwritable in place
  // (`updateWarnings`), like `tips`. `[]` = none.
  warnings: Warning[]
  // Waiting to be cooked, and listed as such. Only an improvement raises it — the
  // cook asked for this version, so it owes it a try; it drops as soon as the version
  // is cooked (a rating, a photo, remarks). Absent rather than false.
  toTest?: true
  // The attempt outcome, written once when the version is executed. All absent
  // while the version is still a planned attempt (no `executedAt`).
  executedAt?: Date
  rating?: Rating
  remarks?: Remarks
  photoPath?: string // GCS object path; never exposed raw (see photoUrl)
}
