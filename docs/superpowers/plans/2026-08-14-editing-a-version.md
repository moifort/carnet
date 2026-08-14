# Editing a version — implementation plan

> **Execution:** inline, in the main conversation, task by task
> ([collaboration.md](../../collaboration.md#work-inline-never-through-subagents) forbids
> subagents — this overrides the `writing-plans` skill's subagent option). Steps use checkbox
> (`- [ ]`) syntax for tracking. One task = one commit.

**Spec:** [2026-08-14-editing-a-version-design.md](../specs/2026-08-14-editing-a-version-design.md)

**Goal:** Let the cook correct a version's ingredients, steps and tips in place — no version
created, the rating left alone.

**Architecture:** Two new slice commands (`updateIngredients`, `updateSteps`) on the exact skeleton
of `updateOvenProfile`, each a full replacement of its own list, each refusing a coffee. Tips need
no backend: `updateTips` already exists and is merely unreachable by hand. On iOS, the three
sections of the recipe sheet grow an `onEdit` action opening a dedicated sheet, on the
`OvenProfileSection` / `CoffeeParametersEditSheet` pattern.

**Tech stack:** Bun + Nitro + Pothos 4 + Zod + ts-brand, `bun:test`; SwiftUI (iOS 26, Swift 6),
Apollo iOS codegen.

## Domaines impactés

- **Créés :** aucun domaine. Trois organisms iOS (`IngredientsEditSheet`, `StepsEditSheet`,
  `TipsEditSheet`) et une molecule (`ThermomixSettingsFields`) dans `ios/Shuhari/Features/Recipe/`.
- **Modifiés :** `server/domain/recipe` (`primitives.ts`, `command.ts`,
  `infrastructure/graphql/{inputs,mutations,types}.ts`), `docs/business-rules.md`,
  `ios/Shuhari/Features/Recipe` (sections, page, view, API, opérations GraphQL),
  `ios/Shuhari/Shared/DebugGallery.swift`.
- **Supprimés :** aucun.

## Global constraints

- **Language:** everything versioned is English — code, comments, commits, GraphQL descriptions,
  test names. The only French: on-screen iOS copy and French data quoted as examples. Control:
  `grep -rnP '[\x{00C0}-\x{00FF}]' server/` must return only the known exceptions.
- **Runtime:** `bun` / `bunx`, never `npm` / `npx`.
- **Style:** Biome — 2 spaces, single quotes, no semicolons, width 100. `ts-pattern`
  `match().exhaustive()` at the GraphQL boundary.
- **Domain:** no `null` in the domain (absence is `field?: T`), no exceptions for control flow —
  discriminated results (`'not-found' as const`). Branded scalars only, built in `primitives.ts`.
- **Commits:** Conventional Commits, English, `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
  trailer, explicit paths in `git add` (never `-A`, never `commit -a`).
- **Never push.** No PR. The user says when.
- **iOS build:**
  `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild -project ios/Shuhari.xcodeproj -scheme Shuhari -destination 'platform=iOS Simulator,name=iPhone 17,OS=26.2' build`

## File structure

| File | Responsibility |
| --- | --- |
| `server/domain/recipe/primitives.ts` | +`Ingredients()` and `VersionSteps()` boundary constructors |
| `server/domain/recipe/command.ts` | +`updateIngredients`, +`updateSteps` |
| `server/domain/recipe/command.int.test.ts` | Their integration tests |
| `server/domain/recipe/infrastructure/graphql/inputs.ts` | +`VersionStepInput` |
| `server/domain/recipe/infrastructure/graphql/mutations.ts` | +the two mutations |
| `server/domain/recipe/infrastructure/graphql/types.ts` | The `tips` description that stops being true |
| `docs/business-rules.md` | The rule that authorises all of it |
| `ios/.../Recipe/components/molecules/ThermomixSettingsFields.swift` | The 4 machine fields, primitive-first |
| `ios/.../Recipe/components/organisms/IngredientsEditSheet.swift` | The shopping-list editor |
| `ios/.../Recipe/components/organisms/StepsEditSheet.swift` | The steps editor |
| `ios/.../Recipe/components/organisms/TipsEditSheet.swift` | The tips editor |
| `ios/.../Recipe/components/organisms/{Ingredients,Tips}Section.swift`, `ReferenceVersionSection.swift` | +`onEdit`, + the empty state |
| `ios/.../Recipe/components/pages/RecipeDetailPage.swift` | Three more coordinator hooks |
| `ios/.../Recipe/RecipeDetailView.swift` | Three more sheets, wired to the API |
| `ios/.../Recipe/RecipeAPI.swift`, `GraphQL/RecipeMutations.graphql` | The two new calls |
| `ios/Shuhari/Shared/DebugGallery.swift` | One case per sheet |

---

## Task 1: The rule

Docs are the spec: the rule changes first, the code aligns to it afterwards.

**Files:**
- Modify: `docs/business-rules.md:125-129` and `docs/business-rules.md:147-153`

- [ ] **Step 1: Rewrite the immutability rule**

Replace the bullet that currently starts with `**A version *is* an attempt**` (line 125) with:

```markdown
- **A version *is* an attempt: what describes it is correctable, what links it is not.** Its
  `content` (the `VersionContent` union — `ingredients` + `steps`, the oven profile, a coffee's
  parameters) and its `tips` are **overwritable in place**, like its outcome; its **lineage**
  (`number`, `origin`, `change`, `why`, `basedOn`) is immutable — that is what makes the chain a
  notebook. An attempt is not an entity. A version with no outcome yet is a *planned* attempt: no
  `executedAt`, no `rating` (the fields are **absent**, never `null`).
- **A correction keeps the rating, deliberately.** Correcting a quantity misread off a photo is
  fixing what the recipe ALWAYS said, not iterating on it: no version is created and the verdict
  stays valid, because it is a verdict on the same plate. Only the cook knows whether an edit
  restores the transcription or changes the plate, and when it changes the plate they iterate —
  `addVersion` is what that is for. The notebook belongs to the cook, not to the model. Same
  border `updateCoffeeParameters` and `updateOvenProfile` already draw, now drawn around the
  ingredients (`RecipeCommand.updateIngredients`) and the steps (`RecipeCommand.updateSteps`) too.
  Both are full replacements of their own list — adding, deleting and reordering all come through
  them — and both answer `'not-a-cooked-recipe'` on a coffee, which has neither.
```

- [ ] **Step 2: Add the two new writes to the `updatedAt` list**

In the bullet `**A version is dated by its last edit**` (line ~147), replace the sentence listing
the writes that move it with:

```markdown
  Only the cook's own rewrites move it — `recordAttempt`, `updateRating`, `updateTips`,
  `updateIngredients`, `updateSteps`, `updateCoffeeParameters`, `updateOvenProfile`, and the cook
  `addVersion` writes on the version it iterates on.
```

- [ ] **Step 3: Check no French slipped into the doc**

Run: `grep -nP '[\x{00C0}-\x{00FF}]' docs/business-rules.md`
Expected: only pre-existing French data examples (recipe titles, ingredient names) — no new prose.

- [ ] **Step 4: Commit**

```bash
git add docs/business-rules.md && git commit -m "docs(recipe): a version's content is correctable, its lineage is not

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: Boundary constructors

**Files:**
- Modify: `server/domain/recipe/primitives.ts`
- Test: `server/domain/recipe/primitives.unit.test.ts`

**Interfaces:**
- Consumes: the existing private `looseIngredientSchema`, `looseSettingsSchema`, `brandIngredient`,
  `brandLooseSettings`, `StepText` — all already in this file.
- Produces:
  - `Ingredients(value: unknown): Ingredient[]`
  - `type LooseVersionStep = { text: StepText; settings: LooseThermomixSettings }`
  - `VersionSteps(value: unknown): LooseVersionStep[]`

- [ ] **Step 1: Write the failing tests**

Append to `server/domain/recipe/primitives.unit.test.ts`:

```ts
describe('Ingredients', () => {
  test('brands a whole list, order kept', () => {
    expect(Ingredients([{ name: ' Farine ', quantity: '250 g' }])).toEqual([
      { name: 'Farine', quantity: '250 g' },
    ])
  })

  test('refuses a line with an empty name', () => {
    expect(() => Ingredients([{ name: '  ', quantity: '250 g' }])).toThrow()
  })

  test('accepts an empty list — a recipe with nothing measurable', () => {
    expect(Ingredients([])).toEqual([])
  })
})

describe('VersionSteps', () => {
  test('brands the text and the machine settings that come with it', () => {
    expect(VersionSteps([{ text: 'Mixer', settings: { time: '10 min', reverse: true } }])).toEqual([
      { text: 'Mixer', settings: { time: '10 min', reverse: true } },
    ])
  })

  test('a step with no settings at all is a plain step', () => {
    expect(VersionSteps([{ text: 'Enfourner' }])).toEqual([{ text: 'Enfourner', settings: {} }])
  })

  test('reverse false carries no information and is dropped', () => {
    expect(VersionSteps([{ text: 'Mixer', settings: { reverse: false } }])).toEqual([
      { text: 'Mixer', settings: {} },
    ])
  })

  test('refuses an empty step text', () => {
    expect(() => VersionSteps([{ text: '   ' }])).toThrow()
  })
})
```

Add `Ingredients` and `VersionSteps` to the existing `import { … } from '~/domain/recipe/primitives'`
at the top of that test file.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test server/domain/recipe/primitives.unit.test.ts`
Expected: FAIL — `Ingredients is not a function` / `VersionSteps is not a function`.

- [ ] **Step 3: Implement**

In `server/domain/recipe/primitives.ts`, add to the type import block from `~/domain/recipe/types`
(alphabetical order, Biome sorts it):

```ts
  type Ingredient as IngredientType,
```

Then, right after `export const OvenProfile = …` (the existing profile-alone constructor, ~line 305):

```ts
// Boundary branding for an ingredient list alone — what the in-place correction
// (`updateIngredients`) passes through, the steps and the oven untouched.
export const Ingredients = (value: unknown): IngredientType[] =>
  z.array(looseIngredientSchema).parse(value).map(brandIngredient)
```

And after `brandLooseSettings` (~line 313):

```ts
// One step as the boundaries hand it over: its text plus the machine settings only a
// Thermomix version keeps. The single shape `updateSteps` speaks, whichever world the
// version belongs to — the command is what knows its kind and drops what does not
// apply.
export type LooseVersionStep = { text: StepTextType; settings: LooseThermomixSettings }

// Boundary branding for a step list alone — what the in-place correction
// (`updateSteps`) passes through, the ingredients and the oven untouched.
export const VersionSteps = (value: unknown): LooseVersionStep[] =>
  z
    .array(z.object({ text: z.unknown(), settings: looseSettingsSchema.nullish() }))
    .parse(value)
    .map((step) => ({
      text: StepText(step.text),
      settings: brandLooseSettings(step.settings ?? {}),
    }))
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test server/domain/recipe/primitives.unit.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck and lint**

Run: `bun tsc --noEmit && bun run lint`
Expected: no error.

- [ ] **Step 6: Commit**

```bash
git add server/domain/recipe/primitives.ts server/domain/recipe/primitives.unit.test.ts && git commit -m "feat(recipe): brand an ingredient list and a step list on their own

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: `RecipeCommand.updateIngredients`

**Files:**
- Modify: `server/domain/recipe/command.ts`
- Test: `server/domain/recipe/command.int.test.ts`

**Interfaces:**
- Consumes: `carriedComponents(content, base)`, `lastWorkedOn`, the file-local `written(lineage,
  …pending)`, `repository.{findBy,findVersionsOf,saveVersion,save}`, `atomically`.
- Produces: `RecipeCommand.updateIngredients(userId: UserId, recipeId: RecipeId, versionNumber:
  VersionNumber, ingredients: Ingredient[]): Promise<RecipeVersion | 'not-found' |
  'not-a-cooked-recipe'>`

- [ ] **Step 1: Write the failing tests**

Append to `server/domain/recipe/command.int.test.ts`, right after the `updateCoffeeParameters`
describe block. `newInput()` (a dish) and `userId` are already defined at the top of the file;
reuse them.

```ts
describe('updateIngredients', () => {
  const V1 = 1 as VersionNumber
  const stored = (recipeId: RecipeId) =>
    fake.snapshot('recipe-versions').get(`${recipeId}_1`)?.content as DishContent | undefined

  const line = (name: string, quantity: string) => ({
    name: name as IngredientName,
    quantity: quantity as IngredientQuantity,
  })

  test('replaces the list in place, creating no version', async () => {
    const recipe = await RecipeCommand.create(userId, newInput())
    if (typeof recipe === 'string') throw new Error('expected a recipe')

    const updated = await RecipeCommand.updateIngredients(userId, recipe.id, V1, [
      line('Farine', '200 g'),
      line('Beurre', '80 g'),
    ])
    if (typeof updated === 'string') throw new Error(`expected a version, got ${updated}`)

    expect(updated.content).toMatchObject({
      ingredients: [
        { name: 'Farine', quantity: '200 g' },
        { name: 'Beurre', quantity: '80 g' },
      ],
    })
    expect(stored(recipe.id)?.ingredients).toEqual(updated.content.ingredients)
    // Correcting is not iterating: the chain does not grow.
    expect(fake.snapshot('recipes').get(recipe.id)?.lastVersionNumber).toBe(1)
  })

  test('leaves the steps, the oven and the outcome of a rated version alone', async () => {
    const recipe = await RecipeCommand.create(userId, newInput())
    if (typeof recipe === 'string') throw new Error('expected a recipe')
    await RecipeCommand.recordAttempt(userId, {
      recipeId: recipe.id,
      versionNumber: V1,
      rating: 4 as Rating,
    })

    const updated = await RecipeCommand.updateIngredients(userId, recipe.id, V1, [
      line('Farine', '200 g'),
    ])
    if (typeof updated === 'string') throw new Error(`expected a version, got ${updated}`)

    // A rating is a verdict on the same plate: the correction does not clear it.
    expect(updated.rating).toBe(4 as Rating)
    expect(updated.executedAt).toBeDefined()
    expect(updated.content.steps).toEqual(newInput().content.steps)
  })

  test('carries a component by name, and loses it on a rename', async () => {
    const dough = await RecipeCommand.create(userId, { ...newInput(), title: 'Pâte' as RecipeTitle })
    const recipe = await RecipeCommand.create(userId, newInput())
    if (typeof dough === 'string' || typeof recipe === 'string') throw new Error('expected recipes')
    const first = newInput().content.ingredients[0]
    await RecipeCommand.updateComponent(userId, recipe.id, V1, 0, dough.id)

    const kept = await RecipeCommand.updateIngredients(userId, recipe.id, V1, [
      { name: first.name, quantity: '999 g' as IngredientQuantity },
    ])
    if (typeof kept === 'string') throw new Error(`expected a version, got ${kept}`)
    expect(kept.content.ingredients[0]?.component).toBe(dough.id)

    const renamed = await RecipeCommand.updateIngredients(userId, recipe.id, V1, [
      line('Pâte maison', '999 g'),
    ])
    if (typeof renamed === 'string') throw new Error(`expected a version, got ${renamed}`)
    // A lost link costs nothing, a wrong one costs a recipe: one tap puts it back.
    expect(renamed.content.ingredients[0]?.component).toBeUndefined()
  })

  test('restamps the version and the recipe, in one batch', async () => {
    const recipe = await RecipeCommand.create(userId, newInput())
    if (typeof recipe === 'string') throw new Error('expected a recipe')
    const before = recipe.updatedAt
    const batchesBefore = fake.batches.length

    const updated = await RecipeCommand.updateIngredients(userId, recipe.id, V1, [
      line('Farine', '200 g'),
    ])
    if (typeof updated === 'string') throw new Error(`expected a version, got ${updated}`)

    expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime())
    expect(fake.snapshot('recipes').get(recipe.id)?.updatedAt).toEqual(updated.updatedAt)
    expect(fake.batches.length).toBe(batchesBefore + 1)
    expect(fake.directWrites).toEqual([])
  })

  test('refuses a coffee, which has no shopping list', async () => {
    const recipe = await RecipeCommand.create(userId, {
      type: 'coffee' as const,
      category: 'drink' as const,
      method: 'espresso' as const,
      title: 'Espresso du matin' as RecipeTitle,
      content: coffeeContent(),
      tips: [],
    })
    if (typeof recipe === 'string') throw new Error('expected a recipe')

    expect(await RecipeCommand.updateIngredients(userId, recipe.id, V1, [])).toBe(
      'not-a-cooked-recipe',
    )
  })

  test('returns not-found for an unknown recipe, another cook’s, or an unknown version', async () => {
    expect(await RecipeCommand.updateIngredients(userId, 'nope' as RecipeId, V1, [])).toBe(
      'not-found',
    )

    const recipe = await RecipeCommand.create(userId, newInput())
    if (typeof recipe === 'string') throw new Error('expected a recipe')
    expect(await RecipeCommand.updateIngredients('user-2' as UserId, recipe.id, V1, [])).toBe(
      'not-found',
    )
    expect(
      await RecipeCommand.updateIngredients(userId, recipe.id, 9 as VersionNumber, []),
    ).toBe('not-found')
  })
})
```

If `IngredientName` / `IngredientQuantity` / `DishContent` are not already imported in that test
file, add them (`~/domain/recipe/types` for the first two, `~/domain/recipe/content/dish` for the
third).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test server/domain/recipe/command.int.test.ts -t updateIngredients`
Expected: FAIL — `RecipeCommand.updateIngredients is not a function`.

- [ ] **Step 3: Implement**

In `server/domain/recipe/command.ts`, right after `updateCoffeeParameters` (~line 377):

```ts
  // Correct one cooked version's shopping list in place — a quantity misread off a
  // photo, a line the import split in two. The counterpart of `updateOvenProfile` on
  // the ingredients: no version is created, because fixing what the recipe ALWAYS
  // said is not iterating on it, and the rating stays a verdict on the same plate.
  // Deliberately full-replacement, which is what makes adding, deleting and
  // reordering one operation instead of three.
  export const updateIngredients = async (
    userId: UserId,
    recipeId: RecipeId,
    versionNumber: VersionNumberT,
    ingredients: Ingredient[],
  ): Promise<RecipeVersion | 'not-found' | 'not-a-cooked-recipe'> => {
    const recipe = await repository.findBy(userId, recipeId)
    if (!recipe) return 'not-found' as const
    const lineage = await repository.findVersionsOf(recipeId)
    const version = lineage.find((candidate) => candidate.number === versionNumber)
    if (!version) return 'not-found' as const
    // A coffee has no shopping list — its dose, its water and its milk are parameters.
    if (version.content.kind === 'coffee') return 'not-a-cooked-recipe' as const

    // The links survive the rewrite, matched on the name they were set on: correcting
    // a quantity must not unlink the dough. Same rule an iteration applies, same code.
    const content = carriedComponents({ ...version.content, ingredients }, version.content)
    const updated: RecipeVersion = { ...version, content, updatedAt: new Date() }
    const updatedRecipe: Recipe = { ...recipe, updatedAt: lastWorkedOn(written(lineage, updated)) }
    return atomically(async (batch) => {
      await repository.saveVersion(updated, batch)
      await repository.save(updatedRecipe, batch)
      return updated
    })
  }
```

No `teachVocabulary` call: it teaches from a coffee's free text only, and this command refuses a
coffee — calling it would be dead code.

Add `Ingredient` to the type import from `~/domain/recipe/types` at the top of the file.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test server/domain/recipe/command.int.test.ts -t updateIngredients`
Expected: PASS, 6 tests.

- [ ] **Step 5: Run the whole backend suite and the typecheck**

Run: `bun test && bun tsc --noEmit && bun run lint`
Expected: everything green — including `server/architecture.unit.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add server/domain/recipe/command.ts server/domain/recipe/command.int.test.ts && git commit -m "feat(recipe): correct a version's ingredient list in place

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: `RecipeCommand.updateSteps`

**Files:**
- Modify: `server/domain/recipe/command.ts`
- Test: `server/domain/recipe/command.int.test.ts`

**Interfaces:**
- Consumes: `LooseVersionStep` (Task 2), `thermomixSteps(texts, settings)` from
  `~/domain/recipe/content/thermomix`, the same repository/batch helpers as Task 3.
- Produces: `RecipeCommand.updateSteps(userId: UserId, recipeId: RecipeId, versionNumber:
  VersionNumber, steps: LooseVersionStep[]): Promise<RecipeVersion | 'not-found' |
  'not-a-cooked-recipe'>`

- [ ] **Step 1: Write the failing tests**

Append to `server/domain/recipe/command.int.test.ts`, after the `updateIngredients` block. Reuse
the file's existing Thermomix input helper if there is one; otherwise define `thermomixInput()` as
below.

```ts
describe('updateSteps', () => {
  const V1 = 1 as VersionNumber
  const step = (text: string, settings: LooseThermomixSettings = {}) => ({
    text: text as StepText,
    settings,
  })

  const thermomixInput = () => ({
    type: 'thermomix' as const,
    category: 'main' as const,
    title: 'Risotto' as RecipeTitle,
    content: {
      kind: 'thermomix' as const,
      ingredients: [],
      steps: [{ text: 'Mixer' as StepText, settings: {} }],
    },
    tips: [],
  })

  test('replaces a dish’s steps in place, dropping settings it has no machine for', async () => {
    const recipe = await RecipeCommand.create(userId, newInput())
    if (typeof recipe === 'string') throw new Error('expected a recipe')

    const updated = await RecipeCommand.updateSteps(userId, recipe.id, V1, [
      step('Monter les couches'),
      step('Enfourner à 180°C', { time: '40 min' as ThermomixTime }),
    ])
    if (typeof updated === 'string') throw new Error(`expected a version, got ${updated}`)

    // A dish has no machine: its steps are plain text, settings and all.
    expect(updated.content).toMatchObject({
      kind: 'dish',
      steps: ['Monter les couches', 'Enfourner à 180°C'],
    })
    expect(fake.snapshot('recipes').get(recipe.id)?.lastVersionNumber).toBe(1)
  })

  test('keeps a Thermomix step’s machine settings', async () => {
    const recipe = await RecipeCommand.create(userId, thermomixInput())
    if (typeof recipe === 'string') throw new Error('expected a recipe')

    const updated = await RecipeCommand.updateSteps(userId, recipe.id, V1, [
      step('Mixer les oignons', { time: '5 s' as ThermomixTime, speed: '5' as ThermomixSpeed }),
      step('Laisser reposer'),
    ])
    if (typeof updated === 'string') throw new Error(`expected a version, got ${updated}`)

    expect(updated.content).toMatchObject({
      kind: 'thermomix',
      steps: [
        { text: 'Mixer les oignons', settings: { time: '5 s', speed: '5' } },
        { text: 'Laisser reposer', settings: {} },
      ],
    })
  })

  test('leaves the ingredients and a rated outcome alone', async () => {
    const recipe = await RecipeCommand.create(userId, newInput())
    if (typeof recipe === 'string') throw new Error('expected a recipe')
    await RecipeCommand.recordAttempt(userId, {
      recipeId: recipe.id,
      versionNumber: V1,
      rating: 5 as Rating,
    })

    const updated = await RecipeCommand.updateSteps(userId, recipe.id, V1, [step('Enfourner')])
    if (typeof updated === 'string') throw new Error(`expected a version, got ${updated}`)

    expect(updated.rating).toBe(5 as Rating)
    expect(updated.content.ingredients).toEqual(newInput().content.ingredients)
  })

  test('restamps the version and the recipe, in one batch', async () => {
    const recipe = await RecipeCommand.create(userId, newInput())
    if (typeof recipe === 'string') throw new Error('expected a recipe')
    const batchesBefore = fake.batches.length

    const updated = await RecipeCommand.updateSteps(userId, recipe.id, V1, [step('Enfourner')])
    if (typeof updated === 'string') throw new Error(`expected a version, got ${updated}`)

    expect(fake.snapshot('recipes').get(recipe.id)?.updatedAt).toEqual(updated.updatedAt)
    expect(fake.batches.length).toBe(batchesBefore + 1)
    expect(fake.directWrites).toEqual([])
  })

  test('refuses a coffee, which has no steps', async () => {
    const recipe = await RecipeCommand.create(userId, {
      type: 'coffee' as const,
      category: 'drink' as const,
      method: 'espresso' as const,
      title: 'Espresso du matin' as RecipeTitle,
      content: coffeeContent(),
      tips: [],
    })
    if (typeof recipe === 'string') throw new Error('expected a recipe')

    expect(await RecipeCommand.updateSteps(userId, recipe.id, V1, [])).toBe('not-a-cooked-recipe')
  })

  test('returns not-found for an unknown recipe or another cook’s recipe', async () => {
    expect(await RecipeCommand.updateSteps(userId, 'nope' as RecipeId, V1, [])).toBe('not-found')

    const recipe = await RecipeCommand.create(userId, newInput())
    if (typeof recipe === 'string') throw new Error('expected a recipe')
    expect(await RecipeCommand.updateSteps('user-2' as UserId, recipe.id, V1, [])).toBe('not-found')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test server/domain/recipe/command.int.test.ts -t updateSteps`
Expected: FAIL — `RecipeCommand.updateSteps is not a function`.

- [ ] **Step 3: Implement**

In `server/domain/recipe/command.ts`, right after `updateIngredients`:

```ts
  // Correct one cooked version's method in place — a step the import split in two,
  // an instruction read wrong. The steps arrive in one shape, text plus machine
  // settings, and the VERSION's kind decides what is kept: a dish is plain text and
  // has no machine, a Thermomix version pairs each text with its settings through
  // `thermomixSteps`, which stays the single home of that alignment rule.
  export const updateSteps = async (
    userId: UserId,
    recipeId: RecipeId,
    versionNumber: VersionNumberT,
    steps: LooseVersionStep[],
  ): Promise<RecipeVersion | 'not-found' | 'not-a-cooked-recipe'> => {
    const recipe = await repository.findBy(userId, recipeId)
    if (!recipe) return 'not-found' as const
    const lineage = await repository.findVersionsOf(recipeId)
    const version = lineage.find((candidate) => candidate.number === versionNumber)
    if (!version) return 'not-found' as const
    // A coffee has no method to write down — its dials say everything.
    if (version.content.kind === 'coffee') return 'not-a-cooked-recipe' as const

    const texts = steps.map(({ text }) => text)
    const content: VersionContent =
      version.content.kind === 'dish'
        ? { ...version.content, steps: texts }
        : { ...version.content, steps: thermomixSteps(texts, steps.map(({ settings }) => settings)) }
    const updated: RecipeVersion = { ...version, content, updatedAt: new Date() }
    const updatedRecipe: Recipe = { ...recipe, updatedAt: lastWorkedOn(written(lineage, updated)) }
    return atomically(async (batch) => {
      await repository.saveVersion(updated, batch)
      await repository.save(updatedRecipe, batch)
      return updated
    })
  }
```

Add to the imports at the top of the file: `thermomixSteps` from `~/domain/recipe/content/thermomix`
and `type LooseVersionStep` from `~/domain/recipe/primitives`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test server/domain/recipe/command.int.test.ts -t updateSteps`
Expected: PASS, 6 tests.

- [ ] **Step 5: Full backend check**

Run: `bun test && bun tsc --noEmit && bun run lint`
Expected: green.

- [ ] **Step 6: Commit**

```bash
git add server/domain/recipe/command.ts server/domain/recipe/command.int.test.ts && git commit -m "feat(recipe): correct a version's steps in place, machine settings included

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: The two mutations

**Files:**
- Modify: `server/domain/recipe/infrastructure/graphql/inputs.ts`
- Modify: `server/domain/recipe/infrastructure/graphql/mutations.ts`
- Modify: `server/domain/recipe/infrastructure/graphql/types.ts:488`
- Modify: `shared/schema.graphql` (generated)
- Test: `server/domain/recipe/infrastructure/graphql/mutations.feat.test.ts`

**Interfaces:**
- Consumes: `RecipeCommand.updateIngredients` / `updateSteps` (Tasks 3-4), `Ingredients` /
  `VersionSteps` (Task 2), the existing `ThermomixSettingsInput` and `IngredientInput`.
- Produces: GraphQL `updateIngredients(recipeId, versionNumber, ingredients): Version!` and
  `updateSteps(recipeId, versionNumber, steps): Version!`, plus the input
  `VersionStepInput { text: StepText!, settings: ThermomixSettingsInput }`.

- [ ] **Step 1: Write the failing tests**

Append to `server/domain/recipe/infrastructure/graphql/mutations.feat.test.ts`. `execute`,
`createLasagna` and `fake` are already defined at the top of the file.

```ts
describe('updateIngredients mutation', () => {
  const lasagnaId = async () => {
    const result = await execute(createLasagna)
    expect(result.errors).toBeUndefined()
    return (result.data as { createRecipe: { id: string } }).createRecipe.id
  }

  test('replaces the list in place, creating no version and keeping the steps', async () => {
    const id = await lasagnaId()

    const result = await execute(`
      mutation {
        updateIngredients(recipeId: "${id}", versionNumber: 1, ingredients: [
          { name: "Farine", quantity: "200 g" }
          { name: "Beurre", quantity: "80 g" }
        ]) {
          number
          content { ... on DishContent { ingredients { name quantity } steps } }
        }
      }
    `)

    expect(result.errors).toBeUndefined()
    expect(result.data?.updateIngredients).toMatchObject({
      number: 1,
      content: {
        ingredients: [
          { name: 'Farine', quantity: '200 g' },
          { name: 'Beurre', quantity: '80 g' },
        ],
        steps: ['Monter les couches', 'Enfourner à 200°C'],
      },
    })
    expect(fake.snapshot('recipes').get(id)?.lastVersionNumber).toBe(1)
  })

  test('answers NOT_A_COOKED_RECIPE on a coffee, which has no shopping list', async () => {
    const created = await execute(`
      mutation {
        createRecipe(input: {
          type: COFFEE
          category: DRINK
          method: ESPRESSO
          title: "Espresso"
          content: { coffee: { extraction: { grind: "Niveau 12" } } }
        }) { id }
      }
    `)
    const id = (created.data as { createRecipe: { id: string } }).createRecipe.id

    const result = await execute(`
      mutation {
        updateIngredients(recipeId: "${id}", versionNumber: 1, ingredients: []) { number }
      }
    `)

    expect(result.errors?.[0]?.extensions?.code).toBe('NOT_A_COOKED_RECIPE')
  })

  test('answers NOT_FOUND on a version that is not there', async () => {
    const id = await lasagnaId()

    const result = await execute(`
      mutation {
        updateIngredients(recipeId: "${id}", versionNumber: 9, ingredients: []) { number }
      }
    `)

    expect(result.errors?.[0]?.extensions?.code).toBe('NOT_FOUND')
  })
})

describe('updateSteps mutation', () => {
  test('replaces a dish’s steps, leaving its ingredients alone', async () => {
    const created = await execute(createLasagna)
    const id = (created.data as { createRecipe: { id: string } }).createRecipe.id

    const result = await execute(`
      mutation {
        updateSteps(recipeId: "${id}", versionNumber: 1, steps: [
          { text: "Monter les couches" }
          { text: "Enfourner à 180°C" }
        ]) {
          number
          content { ... on DishContent { steps ingredients { name } } }
        }
      }
    `)

    expect(result.errors).toBeUndefined()
    expect(result.data?.updateSteps).toMatchObject({
      number: 1,
      content: {
        steps: ['Monter les couches', 'Enfourner à 180°C'],
        ingredients: [{ name: 'Farine' }],
      },
    })
  })

  test('keeps the machine settings on a Thermomix version', async () => {
    const created = await execute(`
      mutation {
        createRecipe(input: {
          type: THERMOMIX
          category: MAIN
          title: "Risotto"
          content: { thermomix: {
            ingredients: []
            steps: [{ text: "Mixer", settings: {} }]
          } }
        }) { id }
      }
    `)
    const id = (created.data as { createRecipe: { id: string } }).createRecipe.id

    const result = await execute(`
      mutation {
        updateSteps(recipeId: "${id}", versionNumber: 1, steps: [
          { text: "Mixer les oignons", settings: { time: "5 s", speed: "5" } }
          { text: "Laisser reposer" }
        ]) {
          content { ... on ThermomixContent { steps { text settings { time speed } } } }
        }
      }
    `)

    expect(result.errors).toBeUndefined()
    expect(result.data?.updateSteps).toMatchObject({
      content: {
        steps: [
          { text: 'Mixer les oignons', settings: { time: '5 s', speed: '5' } },
          { text: 'Laisser reposer', settings: { time: null, speed: null } },
        ],
      },
    })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test server/domain/recipe/infrastructure/graphql/mutations.feat.test.ts -t updateIngredients`
Expected: FAIL — `Cannot query field "updateIngredients" on type "Mutation"`.

- [ ] **Step 3: Add the input**

In `server/domain/recipe/infrastructure/graphql/inputs.ts`, right after `ThermomixStepInput`:

```ts
export const VersionStepInput = builder.inputType('VersionStepInput', {
  description:
    'One step to write onto an existing version: its instruction, plus the machine settings that ' +
    'go with it. `settings` is read on a Thermomix version and IGNORED on a dish, which has no ' +
    'machine — one shape serves both, so a plain recipe never has to send an empty object.',
  fields: (t) => ({
    text: t.field({
      type: 'StepText',
      required: true,
      description: 'The step instruction, e.g. `"Mix the onions"`',
    }),
    settings: t.field({
      type: ThermomixSettingsInput,
      description: 'Its Thermomix settings, e.g. `"10 min / 100°C / speed 2"` — omit for a plain step',
    }),
  }),
})
```

- [ ] **Step 4: Add the mutations**

In `server/domain/recipe/infrastructure/graphql/mutations.ts`, right after the `updateOvenProfile`
block (~line 404):

```ts
builder.mutationField('updateIngredients', (t) =>
  t.field({
    type: VersionType,
    description: [
      'Correct one cooked version’s shopping list — a quantity misread off a photo, a line the ' +
        'import split in two. Full replacement, in place: no version is created, the steps, the ' +
        'oven and the outcome are untouched, and the rating stays (correcting what the recipe ' +
        'always said is not iterating on it — a changed plate is a new version). Adding, ' +
        'deleting and reordering all go through this one list. A line that IS a recipe keeps ' +
        'its link as long as its name does not change (see updateComponent). Returns the ' +
        'updated version.',
      '',
      'Answers `NOT_A_COOKED_RECIPE` on a coffee, which has no shopping list — it has parameters.',
      '',
      '```graphql',
      'updateIngredients(recipeId: "9f1c-a3b2", versionNumber: 1, ingredients: [',
      '  { name: "Flour", quantity: "200 g" }',
      ']) { number }',
      '```',
    ].join('\n'),
    args: {
      recipeId: t.arg({
        type: 'RecipeId',
        required: true,
        description: 'Which recipe the version belongs to',
      }),
      versionNumber: t.arg({
        type: 'VersionNumber',
        required: true,
        description: 'Which version to correct, e.g. `1`',
      }),
      ingredients: t.arg({
        type: [IngredientInput],
        required: true,
        description: 'The complete new list, in order (send `[]` to clear it)',
      }),
    },
    resolve: async (_root, { recipeId, versionNumber, ingredients }, { userId }) => {
      const result = await RecipeCommand.updateIngredients(
        userId,
        recipeId,
        versionNumber,
        brandIngredients(ingredients),
      )
      return match(result)
        .with('not-found', domainError)
        .with('not-a-cooked-recipe', domainError)
        .with(P.not(P.string), (version) => version)
        .exhaustive()
    },
  }),
)

builder.mutationField('updateSteps', (t) =>
  t.field({
    type: VersionType,
    description: [
      'Correct one cooked version’s method — a step the import split in two, an instruction read ' +
        'wrong. Full replacement, in place: no version is created, the ingredients, the oven and ' +
        'the outcome are untouched, and the rating stays. Each step may carry its Thermomix ' +
        'settings; they are read on a Thermomix version and ignored on a dish, which has no ' +
        'machine. Returns the updated version.',
      '',
      'Answers `NOT_A_COOKED_RECIPE` on a coffee, which has no steps — its dials say everything.',
      '',
      '```graphql',
      'updateSteps(recipeId: "9f1c-a3b2", versionNumber: 1, steps: [',
      '  { text: "Mix the onions", settings: { time: "5 s", speed: "5" } }',
      '  { text: "Let it rest" }',
      ']) { number }',
      '```',
    ].join('\n'),
    args: {
      recipeId: t.arg({
        type: 'RecipeId',
        required: true,
        description: 'Which recipe the version belongs to',
      }),
      versionNumber: t.arg({
        type: 'VersionNumber',
        required: true,
        description: 'Which version to correct, e.g. `1`',
      }),
      steps: t.arg({
        type: [VersionStepInput],
        required: true,
        description: 'The complete new method, in order (send `[]` to clear it)',
      }),
    },
    resolve: async (_root, { recipeId, versionNumber, steps }, { userId }) => {
      const result = await RecipeCommand.updateSteps(
        userId,
        recipeId,
        versionNumber,
        brandVersionSteps(steps),
      )
      return match(result)
        .with('not-found', domainError)
        .with('not-a-cooked-recipe', domainError)
        .with(P.not(P.string), (version) => version)
        .exhaustive()
    },
  }),
)
```

Extend the two import blocks at the top of the file:

```ts
import {
  CoffeeParameters as brandCoffeeParameters,
  Ingredients as brandIngredients,
  OvenProfile as brandOvenProfile,
  VersionSteps as brandVersionSteps,
} from '~/domain/recipe/primitives'
import {
  CoffeeParametersInput,
  CreateRecipeInput,
  IngredientInput,
  OvenProfileInput,
  RecordAttemptInput,
  UpdateRecipeInput,
  versionContentInput,
  VersionStepInput,
} from './inputs'
```

- [ ] **Step 5: Fix the description that stops being true**

In `server/domain/recipe/infrastructure/graphql/types.ts:486-490`, the `tips` field description
says the tips are rewritable *unlike the content*. Replace that clause:

```ts
        'rice"`. Empty list when it has none. Rewritable in place (see updateTips) — refining ' +
        'the advice never creates a version.',
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `bun test server/domain/recipe/infrastructure/graphql/mutations.feat.test.ts`
Expected: PASS, the whole file.

- [ ] **Step 7: Regenerate the schema and check the whole backend**

Run: `bun run generate:graphql && bun test && bun tsc --noEmit && bun run lint`
Expected: `shared/schema.graphql` gains `updateIngredients`, `updateSteps` and `VersionStepInput`;
everything green.

- [ ] **Step 8: Regenerate the iOS API**

Run: `bun run generate:ios`
Expected: `ios/Shuhari/Generated/GraphQL/Schema/InputObjects/VersionStepInput.graphql.swift` appears.

- [ ] **Step 9: Commit**

```bash
git add server/domain/recipe/infrastructure/graphql shared/schema.graphql ios/Shuhari/Generated && git commit -m "feat(graphql): expose correcting a version's ingredients and steps

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: iOS — the ingredients editor

**Files:**
- Create: `ios/Shuhari/Features/Recipe/components/organisms/IngredientsEditSheet.swift`
- Modify: `ios/Shuhari/Features/Recipe/components/organisms/IngredientsSection.swift`
- Modify: `ios/Shuhari/Features/Recipe/components/pages/RecipeDetailPage.swift`
- Modify: `ios/Shuhari/Features/Recipe/RecipeDetailView.swift`
- Modify: `ios/Shuhari/Features/Recipe/RecipeAPI.swift`
- Modify: `ios/Shuhari/Features/Recipe/GraphQL/RecipeMutations.graphql`
- Modify: `ios/Shuhari/Shared/DebugGallery.swift`

**Interfaces:**
- Consumes: the `updateIngredients` mutation (Task 5), `Ingredient { name, quantity, component }`
  from `ios/Shuhari/Shared/RecipeModels.swift`, `ErrorPresenter`, `ActionIcon`.
- Produces: `IngredientsEditSheet(initial: [Ingredient], onSave: ([Ingredient]) async throws ->
  Void)`; `IngredientsSection.onEdit: (() -> Void)?`;
  `RecipeDetailPage.onEditIngredients: (() -> Void)?`; `RecipeAPI.updateIngredients(recipeId:
  String, versionNumber: Int, ingredients: [Ingredient]) async throws`.

- [ ] **Step 1: Add the GraphQL operation**

Append to `ios/Shuhari/Features/Recipe/GraphQL/RecipeMutations.graphql`:

```graphql
mutation UpdateIngredients(
  $recipeId: RecipeId!
  $versionNumber: VersionNumber!
  $ingredients: [IngredientInput!]!
) {
  updateIngredients(recipeId: $recipeId, versionNumber: $versionNumber, ingredients: $ingredients) {
    number
  }
}
```

Run: `bun run generate:ios`
Expected: `UpdateIngredientsMutation.graphql.swift` appears under `ios/Shuhari/Generated`.

- [ ] **Step 2: Add the API call**

In `ios/Shuhari/Features/Recipe/RecipeAPI.swift`, next to `updateOvenProfile`:

```swift
    /// Correct one version's shopping list — in place, no version created: the plate
    /// cooked is the same one, so its rating stays valid. Full replacement, so this
    /// is also how a line is added, deleted or moved.
    static func updateIngredients(
        recipeId: String,
        versionNumber: Int,
        ingredients: [Ingredient]
    ) async throws {
        _ = try await GraphQLHelpers.perform(
            GraphQLClient.shared.apollo,
            mutation: ShuhariGraphQL.UpdateIngredientsMutation(
                recipeId: recipeId,
                versionNumber: versionNumber,
                ingredients: ingredients.map {
                    ShuhariGraphQL.IngredientInput(name: $0.name, quantity: $0.quantity)
                }
            )
        )
    }
```

- [ ] **Step 3: Write the sheet**

Create `ios/Shuhari/Features/Recipe/components/organisms/IngredientsEditSheet.swift`:

```swift
import SwiftUI

/// Correcting one version's shopping list — a quantity misread off a photo, a line
/// the import split in two. Full replacement: what the sheet saves IS the new list,
/// so adding, deleting and reordering all happen here. Nothing is created: the plate
/// cooked is the same one, and its rating stays.
struct IngredientsEditSheet: View {
    let initial: [Ingredient]
    let onSave: ([Ingredient]) async throws -> Void

    /// An editable row with an identity of its own — the name cannot be one while it
    /// is being typed, and rows must survive an edit or a deletion.
    private struct Row: Identifiable {
        let id = UUID()
        var name: String
        var quantity: String
    }

    @Environment(\.dismiss) private var dismiss
    @State private var rows: [Row]
    @State private var error = ErrorPresenter()

    init(initial: [Ingredient], onSave: @escaping ([Ingredient]) async throws -> Void) {
        self.initial = initial
        self.onSave = onSave
        _rows = State(initialValue: initial.map { Row(name: $0.name, quantity: $0.quantity) })
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    ForEach($rows) { $row in
                        HStack {
                            TextField("Ingrédient", text: $row.name)
                                .frame(maxWidth: .infinity, alignment: .leading)
                            TextField("Quantité", text: $row.quantity)
                                .fixedSize()
                                .multilineTextAlignment(.trailing)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .onDelete { rows.remove(atOffsets: $0) }
                    .onMove { rows.move(fromOffsets: $0, toOffset: $1) }
                    Button {
                        rows.append(Row(name: "", quantity: ""))
                    } label: {
                        Label("Ajouter un ingrédient", systemImage: "plus")
                    }
                    .accessibilityIdentifier("ingredient-add")
                } footer: {
                    Text("Une ligne qui est une recette garde son lien tant que son nom ne change pas.")
                }
            }
            .scrollDismissesKeyboard(.interactively)
            .navigationTitle("Ingrédients")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: {
                        Image(systemName: "xmark")
                    }
                    .disabled(error.isRunning)
                    .accessibilityLabel("Annuler")
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        Task {
                            await error.run { try await onSave(edited) } onSuccess: { dismiss() }
                        }
                    } label: {
                        ActionIcon(systemImage: "checkmark", isRunning: error.isRunning)
                    }
                    .disabled(error.isRunning)
                    .accessibilityLabel("Enregistrer")
                }
                // Reordering and multi-deletion need the edit mode; typing does not.
                ToolbarItem(placement: .bottomBar) { EditButton() }
            }
            .errorAlert(error)
        }
        .interactiveDismissDisabled(error.isRunning)
    }

    /// The list as it will be stored: blank rows dropped (the server refuses an empty
    /// name or quantity), the rest in the order shown.
    private var edited: [Ingredient] {
        rows.compactMap { row in
            let name = row.name.trimmingCharacters(in: .whitespacesAndNewlines)
            let quantity = row.quantity.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !name.isEmpty, !quantity.isEmpty else { return nil }
            return Ingredient(name: name, quantity: quantity)
        }
    }
}

#if DEBUG
#Preview("Liste existante") {
    Text("Fond")
        .sheet(isPresented: .constant(true)) {
            IngredientsEditSheet(initial: Fixtures.bourguignonV3.ingredients) { _ in }
        }
}

#Preview("Liste vide") {
    Text("Fond")
        .sheet(isPresented: .constant(true)) {
            IngredientsEditSheet(initial: []) { _ in }
        }
}
#endif
```

- [ ] **Step 4: Give the section its edit action and its empty state**

In `IngredientsSection.swift`, add the property next to `onLink`:

```swift
    /// Opens the shopping-list editor. Nil (the default) keeps the list read-only —
    /// the execution mode and the previews.
    var onEdit: (() -> Void)?
```

Replace the body:

```swift
    var body: some View {
        // The section survives an empty list as soon as it is editable: otherwise the
        // first ingredient of a recipe imported without one could never be added.
        if !ingredients.isEmpty || onEdit != nil {
            Section {
                if ingredients.isEmpty {
                    Text("Aucun ingrédient")
                        .foregroundStyle(.secondary)
                } else {
                    grid
                }
            } header: {
                header
            }
        }
    }
```

And in `header`, add the action after the reset button, inside the same `HStack`:

```swift
            if let onEdit {
                Spacer()
                Button("Modifier", action: onEdit)
                    .font(.caption)
                    .textCase(nil)
                    .accessibilityIdentifier("ingredients-edit")
            }
```

Note: the existing `Spacer()` in the scale branch is conditional; keep exactly one `Spacer()` on
the path where both appear — put `onEdit`'s button after the reset button and drop its own
`Spacer()` when `scale?.wrappedValue != 1` already inserted one.

- [ ] **Step 5: Pass it down the page**

In `RecipeDetailPage.swift`, add next to `onLinkComponent`:

```swift
    /// Opens the editor of the displayed version's shopping list. Nil leaves it
    /// read-only.
    var onEditIngredients: (() -> Void)? = nil
```

and pass `onEdit: onEditIngredients` to `IngredientsSection(...)`.

- [ ] **Step 6: Wire the sheet**

In `RecipeDetailView.swift`, add `@State private var showIngredients = false` next to the other
sheet flags, pass `onEditIngredients: { showIngredients = true }` to **both** `RecipeDetailPage`
calls (the focused one and the plain one), and add the sheet after `.sheet(isPresented:
$showOvenProfile)`:

```swift
                // Correcting the shopping list of the displayed version: in place, no
                // version created, the steps and the rating untouched.
                .sheet(isPresented: $showIngredients) {
                    let version = displayedVersion(recipe)
                    IngredientsEditSheet(initial: version.ingredients) { ingredients in
                        try await RecipeAPI.updateIngredients(
                            recipeId: recipeId,
                            versionNumber: version.number,
                            ingredients: ingredients
                        )
                        await store.load(recipeId)
                        onReload()
                    }
                }
```

Also fix the now-false comment at `RecipeDetailView.swift:51-52`:

```swift
    /// Which line the component picker was opened on. Identified by its index: the
    /// picker and the list editor are never open at once, so the list cannot shift
    /// under the sheet.
```

- [ ] **Step 7: Add the gallery cases**

In `DebugGallery.swift`, next to `"coffee-parameters-edit"`:

```swift
        case "ingredients-edit":
            Color.clear
                .sheet(isPresented: .constant(true)) {
                    IngredientsEditSheet(initial: Fixtures.bourguignonV3.ingredients) { _ in }
                }
        case "ingredients-edit-empty":
            Color.clear
                .sheet(isPresented: .constant(true)) {
                    IngredientsEditSheet(initial: []) { _ in }
                }
```

- [ ] **Step 8: Build**

Run:
```bash
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild -project ios/Shuhari.xcodeproj -scheme Shuhari -destination 'platform=iOS Simulator,name=iPhone 17,OS=26.2' build
```
Expected: `BUILD SUCCEEDED`.

- [ ] **Step 9: Verify in the simulator**

Run: `xcrun simctl launch booted com.polyforms.shuhari.app -gallery ingredients-edit`, screenshot,
check: the rows are typable, the ✕/✓ toolbar is there, `Modifier` (bottom bar) turns on reordering.
Then `-gallery recipe` and check the `Modifier` action showed up on the ingredients header.

- [ ] **Step 10: Commit**

```bash
git add ios/Shuhari/Features/Recipe ios/Shuhari/Shared/DebugGallery.swift ios/Shuhari/Generated && git commit -m "feat(ios): correct a version's ingredient list from the recipe sheet

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: iOS — the steps editor

**Files:**
- Create: `ios/Shuhari/Features/Recipe/components/molecules/ThermomixSettingsFields.swift`
- Create: `ios/Shuhari/Features/Recipe/components/organisms/StepsEditSheet.swift`
- Modify: `ios/Shuhari/Features/Recipe/components/organisms/ReferenceVersionSection.swift`
- Modify: `RecipeDetailPage.swift`, `RecipeDetailView.swift`, `RecipeAPI.swift`,
  `GraphQL/RecipeMutations.graphql`, `DebugGallery.swift`

**Interfaces:**
- Consumes: the `updateSteps` mutation (Task 5), `ThermomixStep { text, settings }` and
  `ThermomixSettings { time, temperature, speed, reverse, .plain }`.
- Produces: `ThermomixSettingsFields(time: Binding<String>, temperature: Binding<String>, speed:
  Binding<String>, reverse: Binding<Bool>)`; `StepsEditSheet(initial: [ThermomixStep], showsSettings:
  Bool, onSave: ([ThermomixStep]) async throws -> Void)`;
  `ReferenceVersionSection.onEdit: (() -> Void)?`; `RecipeDetailPage.onEditSteps: (() -> Void)?`;
  `RecipeAPI.updateSteps(recipeId: String, versionNumber: Int, steps: [ThermomixStep]) async throws`.

The sheet speaks `[ThermomixStep]` for both worlds — a dish is a list whose settings are all
`.plain`, which is exactly what the server ignores. One type, no branching in the coordinator.

- [ ] **Step 1: Add the GraphQL operation**

Append to `RecipeMutations.graphql`:

```graphql
mutation UpdateSteps(
  $recipeId: RecipeId!
  $versionNumber: VersionNumber!
  $steps: [VersionStepInput!]!
) {
  updateSteps(recipeId: $recipeId, versionNumber: $versionNumber, steps: $steps) {
    number
  }
}
```

Run: `bun run generate:ios`

- [ ] **Step 2: Add the API call**

In `RecipeAPI.swift`:

```swift
    /// Correct one version's method — in place, no version created. The machine
    /// settings ride along and the server keeps them only on a Thermomix version.
    static func updateSteps(
        recipeId: String,
        versionNumber: Int,
        steps: [ThermomixStep]
    ) async throws {
        _ = try await GraphQLHelpers.perform(
            GraphQLClient.shared.apollo,
            mutation: ShuhariGraphQL.UpdateStepsMutation(
                recipeId: recipeId,
                versionNumber: versionNumber,
                steps: steps.map { step in
                    ShuhariGraphQL.VersionStepInput(
                        text: step.text,
                        settings: step.settings.isEmpty
                            ? .null
                            : .some(
                                ShuhariGraphQL.ThermomixSettingsInput(
                                    time: step.settings.time == nil ? .null : .some(step.settings.time!),
                                    temperature: step.settings.temperature == nil
                                        ? .null : .some(step.settings.temperature!),
                                    speed: step.settings.speed == nil ? .null : .some(step.settings.speed!),
                                    reverse: .some(step.settings.reverse)
                                )
                            )
                    )
                }
            )
        )
    }
```

Check the generated initialiser's argument order in
`ios/Shuhari/Generated/GraphQL/Schema/InputObjects/ThermomixSettingsInput.graphql.swift` and match
it; if `GraphQLHelpers` already has a nullable-string helper (as it does for the oven profile),
use it instead of the ternaries.

- [ ] **Step 3: Add the model accessors, then the settings molecule**

Add to `RecipeVersion` in `ios/Shuhari/Shared/RecipeModels.swift` — they belong to the model, not
to the coordinator, and both the sheet's previews and the gallery read them:

```swift
    /// The steps as the editor speaks them: one shape for both worlds, a dish's steps
    /// carrying `.plain` settings — which is exactly what the server ignores on one.
    var editableSteps: [ThermomixStep] {
        switch content {
        case .dish(_, let steps, _): steps.map { ThermomixStep(text: $0, settings: .plain) }
        case .thermomix(_, let steps, _): steps
        case .coffee: []
        }
    }

    /// Whether the machine settings are worth showing — a dish has no machine.
    var isThermomix: Bool {
        if case .thermomix = content { return true }
        return false
    }
```

Then create `ios/Shuhari/Features/Recipe/components/molecules/ThermomixSettingsFields.swift`:

```swift
import SwiftUI

/// The four machine settings of one Thermomix step, as editable fields: duration,
/// temperature, blade speed and the reverse toggle. Primitive-first — bound to plain
/// strings and a Bool, so the import preview can reuse it the day it stops showing
/// them as read-only badges.
struct ThermomixSettingsFields: View {
    @Binding var time: String
    @Binding var temperature: String
    @Binding var speed: String
    @Binding var reverse: Bool

    var body: some View {
        Grid(alignment: .leading, horizontalSpacing: 8, verticalSpacing: 4) {
            GridRow {
                Image(systemName: "timer")
                    .foregroundStyle(.secondary)
                TextField("Durée", text: $time)
                    .accessibilityIdentifier("thermomix-time-field")
                Image(systemName: "thermometer.medium")
                    .foregroundStyle(.secondary)
                TextField("Température", text: $temperature)
                    .accessibilityIdentifier("thermomix-temperature-field")
            }
            GridRow {
                Image(systemName: "speedometer")
                    .foregroundStyle(.secondary)
                TextField("Vitesse", text: $speed)
                    .accessibilityIdentifier("thermomix-speed-field")
                Toggle(isOn: $reverse) {
                    Text("Sens inverse")
                }
                .gridCellColumns(2)
                .accessibilityIdentifier("thermomix-reverse-toggle")
            }
        }
        .font(.subheadline)
        .textFieldStyle(.roundedBorder)
    }
}

#if DEBUG
#Preview("Réglages remplis") {
    @Previewable @State var time = "10 min"
    @Previewable @State var temperature = "100°C"
    @Previewable @State var speed = "2"
    @Previewable @State var reverse = true
    return Form {
        ThermomixSettingsFields(
            time: $time, temperature: $temperature, speed: $speed, reverse: $reverse
        )
    }
}

#Preview("Étape simple") {
    @Previewable @State var time = ""
    @Previewable @State var temperature = ""
    @Previewable @State var speed = ""
    @Previewable @State var reverse = false
    return Form {
        ThermomixSettingsFields(
            time: $time, temperature: $temperature, speed: $speed, reverse: $reverse
        )
    }
}
#endif
```

- [ ] **Step 4: Write the sheet**

Create `ios/Shuhari/Features/Recipe/components/organisms/StepsEditSheet.swift`:

```swift
import SwiftUI

/// Correcting one version's method — a step the import split in two, an instruction
/// read wrong. Full replacement: adding, deleting and reordering all happen here.
/// `showsSettings` is what a Thermomix version turns on; a dish has no machine and
/// its steps are text alone.
struct StepsEditSheet: View {
    let initial: [ThermomixStep]
    var showsSettings: Bool = false
    let onSave: ([ThermomixStep]) async throws -> Void

    /// An editable step: its text and its four settings as plain strings, with an
    /// identity of its own so rows survive an edit or a deletion.
    private struct Row: Identifiable {
        let id = UUID()
        var text: String
        var time: String
        var temperature: String
        var speed: String
        var reverse: Bool
    }

    @Environment(\.dismiss) private var dismiss
    @State private var rows: [Row]
    @State private var error = ErrorPresenter()

    init(
        initial: [ThermomixStep],
        showsSettings: Bool = false,
        onSave: @escaping ([ThermomixStep]) async throws -> Void
    ) {
        self.initial = initial
        self.showsSettings = showsSettings
        self.onSave = onSave
        _rows = State(initialValue: initial.map {
            Row(
                text: $0.text,
                time: $0.settings.time ?? "",
                temperature: $0.settings.temperature ?? "",
                speed: $0.settings.speed ?? "",
                reverse: $0.settings.reverse
            )
        })
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    ForEach(Array($rows.enumerated()), id: \.element.id) { index, $row in
                        VStack(alignment: .leading, spacing: 8) {
                            HStack(alignment: .top, spacing: 12) {
                                Text("\(index + 1)")
                                    .font(.subheadline.weight(.semibold))
                                    .monospacedDigit()
                                    .foregroundStyle(.secondary)
                                    .frame(minWidth: 20, alignment: .trailing)
                                TextField("Étape", text: $row.text, axis: .vertical)
                                    .lineLimit(1...6)
                            }
                            if showsSettings {
                                ThermomixSettingsFields(
                                    time: $row.time,
                                    temperature: $row.temperature,
                                    speed: $row.speed,
                                    reverse: $row.reverse
                                )
                            }
                        }
                    }
                    .onDelete { rows.remove(atOffsets: $0) }
                    .onMove { rows.move(fromOffsets: $0, toOffset: $1) }
                    Button {
                        rows.append(
                            Row(text: "", time: "", temperature: "", speed: "", reverse: false)
                        )
                    } label: {
                        Label("Ajouter une étape", systemImage: "plus")
                    }
                    .accessibilityIdentifier("step-add")
                }
            }
            .scrollDismissesKeyboard(.interactively)
            .navigationTitle("Étapes")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: {
                        Image(systemName: "xmark")
                    }
                    .disabled(error.isRunning)
                    .accessibilityLabel("Annuler")
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        Task {
                            await error.run { try await onSave(edited) } onSuccess: { dismiss() }
                        }
                    } label: {
                        ActionIcon(systemImage: "checkmark", isRunning: error.isRunning)
                    }
                    .disabled(error.isRunning)
                    .accessibilityLabel("Enregistrer")
                }
                ToolbarItem(placement: .bottomBar) { EditButton() }
            }
            .errorAlert(error)
        }
        .interactiveDismissDisabled(error.isRunning)
    }

    /// The method as it will be stored: blank steps dropped (the server refuses an
    /// empty text), each surviving one carrying the settings actually typed.
    private var edited: [ThermomixStep] {
        rows.compactMap { row in
            let text = row.text.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !text.isEmpty else { return nil }
            return ThermomixStep(text: text, settings: settings(of: row))
        }
    }

    private func settings(of row: Row) -> ThermomixSettings {
        guard showsSettings else { return .plain }
        let value = { (raw: String) -> String? in
            let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
            return trimmed.isEmpty ? nil : trimmed
        }
        return ThermomixSettings(
            time: value(row.time),
            temperature: value(row.temperature),
            speed: value(row.speed),
            reverse: row.reverse
        )
    }
}

#if DEBUG
#Preview("Plat") {
    Text("Fond")
        .sheet(isPresented: .constant(true)) {
            StepsEditSheet(initial: Fixtures.bourguignonV3.editableSteps) { _ in }
        }
}

#Preview("Thermomix — réglages machine") {
    Text("Fond")
        .sheet(isPresented: .constant(true)) {
            StepsEditSheet(initial: Fixtures.risottoV2.editableSteps, showsSettings: true) { _ in }
        }
}
#endif
```

- [ ] **Step 5: Give the steps section its edit action and its empty state**

In `ReferenceVersionSection.swift`:

```swift
    /// Opens the method editor. Nil (the default) keeps the steps read-only — the
    /// execution mode and the previews.
    var onEdit: (() -> Void)?

    var body: some View {
        // Editable, the section survives an empty method: a coffee has none by
        // construction and never gets the action, but an import that produced no step
        // must still be fixable.
        if !version.steps.isEmpty || onEdit != nil {
            Section {
                switch version.content {
                case .dish(_, let steps, _):
                    StepsList(steps: steps, modified: modified)
                case .thermomix(_, let steps, _):
                    ThermomixStepsList(steps: steps, modified: modified)
                case .coffee:
                    EmptyView()
                }
            } header: {
                HStack {
                    Text("Étapes")
                    if let onEdit {
                        Spacer()
                        Button("Modifier", action: onEdit)
                            .font(.caption)
                            .textCase(nil)
                            .accessibilityIdentifier("steps-edit")
                    }
                }
            }
        }
    }
```

- [ ] **Step 6: Page and coordinator**

In `RecipeDetailPage.swift`, add `var onEditSteps: (() -> Void)? = nil`, and change the steps
branch so the section is rendered whenever it has steps **or** can be edited:

```swift
            if !displayedVersion.content.stepTexts.isEmpty || onEditSteps != nil {
                ReferenceVersionSection(
                    version: displayedVersion,
                    modified: modifiedSteps,
                    onEdit: onEditSteps
                )
            }
```

A coffee must not get the action — it has no steps at all. In `RecipeDetailView.swift`, pass it
only when the displayed version is not a coffee:

```swift
                    onEditSteps: displayedVersion(recipe).content.coffeeParameters == nil
                        ? { showSteps = true } : nil,
```

Add `@State private var showSteps = false` and the sheet:

```swift
                // Correcting the method of the displayed version: in place, no version
                // created, the ingredients and the rating untouched.
                .sheet(isPresented: $showSteps) {
                    let version = displayedVersion(recipe)
                    StepsEditSheet(
                        initial: version.editableSteps,
                        showsSettings: version.isThermomix
                    ) { steps in
                        try await RecipeAPI.updateSteps(
                            recipeId: recipeId,
                            versionNumber: version.number,
                            steps: steps
                        )
                        await store.load(recipeId)
                        onReload()
                    }
                }
```

`editableSteps` and `isThermomix` were added to `RecipeVersion` in Step 3.

- [ ] **Step 7: Gallery cases**

```swift
        case "steps-edit":
            Color.clear
                .sheet(isPresented: .constant(true)) {
                    StepsEditSheet(initial: Fixtures.bourguignonV3.editableSteps) { _ in }
                }
        case "steps-edit-thermomix":
            Color.clear
                .sheet(isPresented: .constant(true)) {
                    StepsEditSheet(
                        initial: Fixtures.risottoV2.editableSteps,
                        showsSettings: true
                    ) { _ in }
                }
```

- [ ] **Step 8: Build**

Run:
```bash
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild -project ios/Shuhari.xcodeproj -scheme Shuhari -destination 'platform=iOS Simulator,name=iPhone 17,OS=26.2' build
```
Expected: `BUILD SUCCEEDED`.

- [ ] **Step 9: Verify in the simulator**

`xcrun simctl launch booted com.polyforms.shuhari.app -gallery steps-edit-thermomix`, screenshot:
the four machine fields sit under each step and are typable. Then `-gallery recipe-coffee` and
check the steps section is still absent — a coffee gets no editor.

- [ ] **Step 10: Commit**

```bash
git add ios/Shuhari/Features/Recipe ios/Shuhari/Shared ios/Shuhari/Generated && git commit -m "feat(ios): correct a version's steps, Thermomix settings included

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 8: iOS — the tips editor

No backend at all: `updateTips` exists and `ProposalAPI.updateTips` already calls it.

**Files:**
- Create: `ios/Shuhari/Features/Recipe/components/organisms/TipsEditSheet.swift`
- Modify: `ios/Shuhari/Features/Recipe/components/organisms/TipsSection.swift`
- Modify: `RecipeDetailPage.swift`, `RecipeDetailView.swift`, `DebugGallery.swift`

**Interfaces:**
- Consumes: `ProposalAPI.updateTips(recipeId:versionNumber:tips:)`.
- Produces: `TipsEditSheet(initial: [String], onSave: ([String]) async throws -> Void)`;
  `TipsSection.onEdit: (() -> Void)?`; `RecipeDetailPage.onEditTips: (() -> Void)?`.

- [ ] **Step 1: Write the sheet**

Create `ios/Shuhari/Features/Recipe/components/organisms/TipsEditSheet.swift`:

```swift
import SwiftUI

/// Writing one version's cooking tips by hand — the counterpart of the AI's merged
/// list, for the cook who just wants to fix a word. Full replacement, in place: tips
/// have always been rewritable, this is simply where it is done without asking the
/// model.
struct TipsEditSheet: View {
    let initial: [String]
    let onSave: ([String]) async throws -> Void

    private struct Row: Identifiable {
        let id = UUID()
        var text: String
    }

    @Environment(\.dismiss) private var dismiss
    @State private var rows: [Row]
    @State private var error = ErrorPresenter()

    init(initial: [String], onSave: @escaping ([String]) async throws -> Void) {
        self.initial = initial
        self.onSave = onSave
        _rows = State(initialValue: initial.map { Row(text: $0) })
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    ForEach($rows) { $row in
                        TextField("Conseil", text: $row.text, axis: .vertical)
                            .lineLimit(1...6)
                    }
                    .onDelete { rows.remove(atOffsets: $0) }
                    .onMove { rows.move(fromOffsets: $0, toOffset: $1) }
                    Button {
                        rows.append(Row(text: ""))
                    } label: {
                        Label("Ajouter un conseil", systemImage: "plus")
                    }
                    .accessibilityIdentifier("tip-add")
                } footer: {
                    Text("Service, conservation, tour de main — ce qui n’est ni un ingrédient ni une étape.")
                }
            }
            .scrollDismissesKeyboard(.interactively)
            .navigationTitle("Conseils")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: {
                        Image(systemName: "xmark")
                    }
                    .disabled(error.isRunning)
                    .accessibilityLabel("Annuler")
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        Task {
                            await error.run { try await onSave(edited) } onSuccess: { dismiss() }
                        }
                    } label: {
                        ActionIcon(systemImage: "checkmark", isRunning: error.isRunning)
                    }
                    .disabled(error.isRunning)
                    .accessibilityLabel("Enregistrer")
                }
                ToolbarItem(placement: .bottomBar) { EditButton() }
            }
            .errorAlert(error)
        }
        .interactiveDismissDisabled(error.isRunning)
    }

    /// Blank rows are dropped — an empty list is how the section is cleared, not a
    /// list of empty tips.
    private var edited: [String] {
        rows.compactMap {
            let text = $0.text.trimmingCharacters(in: .whitespacesAndNewlines)
            return text.isEmpty ? nil : text
        }
    }
}

#if DEBUG
#Preview("Conseils existants") {
    Text("Fond")
        .sheet(isPresented: .constant(true)) {
            TipsEditSheet(initial: Fixtures.bourguignonV3.tips) { _ in }
        }
}

#Preview("Aucun conseil") {
    Text("Fond")
        .sheet(isPresented: .constant(true)) {
            TipsEditSheet(initial: []) { _ in }
        }
}
#endif
```

- [ ] **Step 2: Give the section its edit action and its empty state**

Replace the body of `TipsSection.swift`:

```swift
    let tips: [String]
    /// Opens the tips editor. Nil (the default) keeps the section read-only.
    var onEdit: (() -> Void)?

    var body: some View {
        // Editable, the section survives an empty list: otherwise the first tip of a
        // version that has none could never be written.
        if !tips.isEmpty || onEdit != nil {
            Section {
                if tips.isEmpty {
                    Text("Aucun conseil")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(Array(tips.enumerated()), id: \.offset) { _, tip in
                        HStack(alignment: .top, spacing: 12) {
                            Image(systemName: "lightbulb")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                            Text(tip)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                }
            } header: {
                HStack {
                    Text("Conseils")
                    if let onEdit {
                        Spacer()
                        Button("Modifier", action: onEdit)
                            .font(.caption)
                            .textCase(nil)
                            .accessibilityIdentifier("tips-edit")
                    }
                }
            }
        }
    }
```

Keep the existing preview and add one with `onEdit` set, so the Storybook shows both states.

- [ ] **Step 3: Page and coordinator**

In `RecipeDetailPage.swift`: add `var onEditTips: (() -> Void)? = nil` and pass
`TipsSection(tips: displayedVersion.tips, onEdit: onEditTips)`.

In `RecipeDetailView.swift`: add `@State private var showTips = false`, pass
`onEditTips: { showTips = true }` to both page calls, and add the sheet:

```swift
                // Rewriting the displayed version's tips by hand — the same in-place
                // write the AI proposal ends on, without the model.
                .sheet(isPresented: $showTips) {
                    let version = displayedVersion(recipe)
                    TipsEditSheet(initial: version.tips) { tips in
                        try await ProposalAPI.updateTips(
                            recipeId: recipeId,
                            versionNumber: version.number,
                            tips: tips
                        )
                        await store.load(recipeId)
                        onReload()
                    }
                }
```

- [ ] **Step 4: Gallery case**

```swift
        case "tips-edit":
            Color.clear
                .sheet(isPresented: .constant(true)) {
                    TipsEditSheet(initial: Fixtures.bourguignonV3.tips) { _ in }
                }
```

- [ ] **Step 5: Build**

Run:
```bash
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild -project ios/Shuhari.xcodeproj -scheme Shuhari -destination 'platform=iOS Simulator,name=iPhone 17,OS=26.2' build
```
Expected: `BUILD SUCCEEDED`.

- [ ] **Step 6: Verify the whole feature in the simulator**

`xcrun simctl launch booted com.polyforms.shuhari.app -gallery recipe`, screenshot: the three
sections each show `Modifier`. Then `-gallery recipe-fresh` (an import with no tips) and check the
tips section now appears with its empty state and its action. Then `-gallery recipe-coffee`: the
parameters section keeps its own action, no ingredients or steps section appears.

- [ ] **Step 7: Commit**

```bash
git add ios/Shuhari/Features/Recipe ios/Shuhari/Shared/DebugGallery.swift && git commit -m "feat(ios): write a version's tips by hand, without asking the AI

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Final check

- [ ] `bun test && bun tsc --noEmit && bun run lint` — green.
- [ ] `grep -rnP '[\x{00C0}-\x{00FF}]' server/` — only the known exceptions.
- [ ] iOS build succeeds, and the app launches on `-gallery recipe`.
- [ ] `git log --oneline main..HEAD` — 8 commits, one per task, none bundling two.
- [ ] Offer to install on the physical iPhone (`scripts/install-device.sh`) — ask first, never run
      unasked.
