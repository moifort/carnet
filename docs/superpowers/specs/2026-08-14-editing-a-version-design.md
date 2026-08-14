# Editing a version — design

Date: 2026-08-14

## The problem

An imported `v1` lands wrong — a quantity misread off a photo, a step the model split in two,
a tip worded badly. Today there is no way to fix it. `content` is declared immutable, so the only
escape is to re-import the recipe from scratch and lose the lineage, or to iterate — which writes
a `v2` whose whole purpose is a typo.

Three sections of the recipe sheet are affected: **ingredients**, **steps** and **tips**. Tips are
a different case from the other two: `RecipeCommand.updateTips` already exists and already rewrites
them in place — it is simply unreachable by hand, offered only at the end of the AI flow
(`requestTips` → proposal → `updateTips`). So tips need no backend at all.

## The rule that changes

[business-rules.md](../../business-rules.md) currently reads: *"a version IS an attempt: its
`content` (the `VersionContent` union — `ingredients` + `steps`) and lineage
(`origin`/`change`/`basedOn`) are immutable; its outcome and its `tips` are overwritable."*

It becomes:

> **A version is an attempt: what describes it is correctable, what links it is not.** The
> `content` (ingredients, steps, oven profile, coffee parameters), the `tips` and the outcome are
> rewritten in place. The **lineage** — `number`, `basedOn`, `change`, `why`, `origin` — is
> immutable: it is what makes the notebook a notebook.

**The rating survives a correction, deliberately.** A rating is a verdict on the plate the cook
says they made, and only the cook knows whether their edit restores the transcription or changes
the plate. When it changes the plate, they iterate — `addVersion` is what that is for. The
notebook belongs to the cook, not to the model. This is the same border `updateCoffeeParameters`
and `updateOvenProfile` already draw, now drawn around the ingredients and the steps too.

Two corollaries already hold and do not move:

- **`updatedAt` advances** on the version and on the recipe. It is a cook's own rewrite, like
  `updateTips` — the bookkeeping exception (a child re-based by a deletion) is unaffected.
- **Components are carried by name**, through the existing `carriedComponents`: correcting a
  quantity keeps the dough linked, renaming the line drops the link, and one tap puts it back. A
  lost link costs nothing, a wrong one costs a recipe.

## Domain — two commands, one per slice

In `server/domain/recipe/command.ts`, on the exact skeleton of `updateOvenProfile`:

```ts
updateIngredients(userId, recipeId, versionNumber, ingredients)
updateSteps(userId, recipeId, versionNumber, steps)
  → RecipeVersion | 'not-found' | 'not-a-cooked-recipe'
```

- **Full replacement of its own list**, like `updateTips` and `updateCoffeeParameters`. Adding,
  deleting and reordering fall out of it for free — there is no per-line command to write.
- **A coffee answers `'not-a-cooked-recipe'`** — it has neither ingredients nor steps, it has
  parameters. Same code `updateOvenProfile` returns, same reason.
- **`updateIngredients` runs the new content through `carriedComponents(next, version.content)`**
  before saving, so a corrected quantity does not unlink the dough.
- **`updateSteps` takes one shape, `{ text, settings }[]`, and the version's `kind` decides**: a
  `dish` keeps the texts alone, a `thermomix` goes through the existing `thermomixSteps(texts,
  settings)`. That function stays the single home of the alignment rule — the GraphQL and AI paths
  can still never diverge from it.
- One `atomically` batch: `saveVersion` + `save(recipe)` (restamped through
  `lastWorkedOn(written(lineage, updated))`) + `teachVocabulary`.

`updateOvenProfile` and `updateComponent` keep their commands and neither new command touches
their slice: there is still exactly one write path per concept.

## GraphQL

```graphql
updateIngredients(
  recipeId: RecipeId!
  versionNumber: VersionNumber!
  ingredients: [IngredientInput!]!
): Version!

updateSteps(
  recipeId: RecipeId!
  versionNumber: VersionNumber!
  steps: [VersionStepInput!]!
): Version!
```

A new `VersionStepInput { text: StepText!, settings: ThermomixSettingsInput }` — `settings` is
optional and **ignored on a dish**, which has no machine; the description says so. It is
deliberately not `ThermomixStepInput`, whose `settings` is required: one input serves both worlds
here, and a dish must not be made to send `settings: {}` on every line.

Both answer `NOT_A_COOKED_RECIPE` on a coffee and `NOT_FOUND` on a version that is not the caller's.

## iOS — three sections, one pattern

Each affected section grows an `onEdit: (() -> Void)?` in its header, exactly like
`OvenProfileSection`:

| Section                                  | Sheet                  | Mutation                    |
| ---------------------------------------- | ---------------------- | --------------------------- |
| `IngredientsSection`                     | `IngredientsEditSheet` | `updateIngredients`         |
| `ReferenceVersionSection` (the steps)    | `StepsEditSheet`       | `updateSteps`               |
| `TipsSection`                            | `TipsEditSheet`        | `updateTips` *(existing)*   |

- **An empty section becomes editable.** All three render nothing at all when their list is empty,
  so the first tip could never be added by hand. When `onEdit` is passed, the section renders its
  header and an empty-state row; without it (execution mode, previews) it disappears as before.
- **The sheets follow `CoffeeParametersEditSheet`**: a `Form`, ✕ / ✓ toolbar with `ActionIcon`,
  `ErrorPresenter`, `interactiveDismissDisabled` while the write is in flight. Rows are deletable
  (`onDelete`), reorderable (`onMove`) and appendable; blank rows are dropped on save, the way the
  import preview already drops them.
- **One genuinely new molecule: `ThermomixSettingsFields`** (time / temperature / speed / reverse).
  The import preview shows those settings as read-only badges; this molecule is what will unblock
  editing them there later. The import flow is not touched in this work.
- **Wiring in `RecipeDetailView`**: three more `.sheet`s on the `showOvenProfile` pattern, acting
  on `displayedVersion(recipe)`. Editing therefore works both on the plain recipe sheet and on a
  version focused from the history — which is exactly where a botched `v1` is read.
- `DebugGallery` gets one case per sheet.
- The comment at `RecipeDetailView.swift:52` ("the content of a version is immutable, so the list
  cannot shift under the sheet") becomes false and is rewritten: the index is stable because the
  picker and the editor are never open at once.

## Tests

- **Integration** (`command.int.test.ts`): correcting a rated version keeps `rating`, `executedAt`
  and `photoPath`; a component is carried by name and dropped on a rename; a coffee is refused;
  `updatedAt` advances on both the version and the recipe; one batch, all-or-nothing.
- **Feature** (`mutations.feat.test.ts`): both mutations end to end, `NOT_A_COOKED_RECIPE` on a
  coffee, another cook's version → `NOT_FOUND`.
- **Unit**: the `dish` vs `thermomix` normalization of incoming steps.

## Docs to update

- `docs/business-rules.md` — the rule above, and the list of writes that move `updatedAt`.
- `server/domain/recipe/infrastructure/graphql/types.ts:488` — the `tips` description still says
  "Unlike the content, they are rewritable in place", which stops being true.

## Deployment surfaces

The **backend** (domain + GraphQL schema, so the iOS API is regenerated) and the **iOS app**. Not
the database: no stored shape changes, so there is no migration.

## Out of scope

Deliberately left out, and each is its own decision later:

- Editing the outcome beyond the rating (`remarks`, `executedAt`, the photo) — `updateRating` is
  the only correction offered on an attempt today.
- Editing the lineage (`change`, `why`, `origin`) — immutable by the rule above.
- Editing the Thermomix settings inside the import preview, even though this work builds the
  molecule that would allow it.
