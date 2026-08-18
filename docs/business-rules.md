# Business Rules — The Product Model

The full narrative of Shuhari's domain model: what a recipe, a version, an attempt, a proposal
*are*, and the invariants every layer must respect. CLAUDE.md's *Key Business Rules* section is
the digest; this doc is the spec. The mechanics of building a domain live in
[domain-guide.md](./domain-guide.md); the style rules referenced here in
[code-style.md](./code-style.md).

## Recipe types and version content

- **Three recipe types** (`RECIPE_TYPE_VALUES`): `dish`, `thermomix`, `coffee`. Ratings are `1..5`.
  Cooking (`dish` + `thermomix`) lives in the app's notebook tab, `coffee` in its own.
- **Version content is a discriminated union** (`server/domain/recipe/content/`):
  `VersionContent = DishContent | ThermomixContent | CoffeeContent`, tagged by `kind`.
  `DishContent` = `ingredients` + plain-text `steps`; `ThermomixContent` = `ingredients` + nested
  `steps: ThermomixStep[]` where each `ThermomixStep = { text; settings }` (settings total — `{}`
  = a plain step). **`CoffeeContent` has neither an ingredient list nor steps**: a coffee is a set
  of dials, described by `CoffeeParameters` alone — `beans` (name / country / producer /
  `roastedOn` / dose), `water` (kind / amount / temperature), `extraction` (grind / time / yield),
  an optional `milk`, and `gear` (machine / grinder / `profile`, the preset the machine runs, by
  the name it is saved under on it — "Sera Modern Arc"; the name stands for the pre-infusion, the
  pressure and the temperature it holds, which live in the machine, not in the notebook). The four blocks are total (`{}` = nothing filled in); `milk` is **absent**
  on a drink that has none, its absence being the information. `restDays` derives, at read time,
  how many full days the beans rested between `beans.roastedOn` and the version's `createdAt`:
  frozen by construction, absent without a roast date or with one in the future.
  **Invariant `content.kind === recipe.type`** is enforced in
  `RecipeCommand.create`/`addVersion`, returning `'content-type-mismatch' as const` on a mismatch.
  GraphQL mirrors it: a `VersionContent` union (Pothos `unionType`, `resolveType` on `kind`) and a
  `VersionContentInput @oneOf { dish, thermomix, coffee }` (`isOneOf: true`).
- **Dish category** (`DISH_CATEGORY_VALUES`): `starter`, `main`, `dessert`, `soup`, `sauce`,
  `baking`, `drink`. Detected by the AI at import and held on the aggregate (never versioned —
  the recipe sheet's edit CTA can refile it via `updateRecipe`); the array order IS the library's
  sort rank, denormalized via `categoryRank`. A coffee is always filed as a `drink` —
  `RecipeCommand.create` forces it — because its own axis is the brew method.
- **Brew method** (`BREW_METHOD_VALUES`): `espresso`, `americano`, `flat-white`, `cappuccino`,
  `latte`, `moka` (Bialetti), `v60`, `chemex`, `drip` (filter machine), `aeropress`,
  `french-press`, `cold-brew`, `other`. What the dish category is to cooking: detected by the AI
  at import, held on the aggregate as `Recipe.method`, refilable via `updateRecipe`, and the axis
  the coffee tab groups and sorts on — array order IS the rank, denormalized via `methodRank`.
  **Invariant: present if and only if `type === 'coffee'`** (`methodMatchesType`), enforced in
  `RecipeCommand.create`/`update`, returning `'method-mismatch' as const`. `other` exists so the
  AI never forces a coffee into a method it was not made with.
- **Oven profile** (`content/oven.ts`), set by hand and by hand only: the oven settings a version bakes at — `program`
  (`OVEN_PROGRAM_VALUES`, an English technical symbol the app translates), `temperature`, and how
  the cooking ends: `duration` in minutes, `core` for a probe target, each optional and
  independent. Carried by `DishContent` and `ThermomixContent` (a dough kneaded on the machine
  still finishes in the oven), never by `CoffeeContent`. **Absent when the dish never sees an
  oven** — the absence is the information, there is no `usesOven` flag and no empty profile.
  Versioned rather than aggregate-level, and that is the point: lowering the temperature ten
  degrees is an iteration like any other, so the lineage shows "v1: the oven's own profile, 3/5 —
  v2: −10 min, 5/5". The dials are **numbers**, unlike Thermomix settings, because they are the
  only recipe values something is computed on: they leave as an appliance command. Their ranges
  live in `OVEN_RANGE` (`limits.ts`), the single source both the branded constructors and the AI
  parse layer answer to.
- **A profile is flat, and owned by the version.** Plain values, never a reference to one of the
  oven's own assisted-cooking dishes — which is just as well, since the Electrolux API exposes
  heating functions and dials and **never the dishes the appliance's screen offers**. A version
  therefore stays reproducible after the oven renames or drops anything, and the deviation the
  cook applied ("the oven's profile, minus ten minutes") is written down as values rather than as
  a diff against something that may move.
- **`assisted` is the one manufacturer string a recipe stores.** `OVEN_PROGRAM_VALUES` gains
  `assisted`, and `OvenProfile.assisted` carries the appliance's own code
  (`ASSIST_QUICHEANDTARTETHIN`) present if and only if the programme is that one. It earns its
  place: an assisted cooking is a recipe the oven runs, varying heat and humidity over time, so
  rewriting it as a heating function plus a temperature does not reproduce it — it cooks something
  else, silently. The pair is normalized in `toOvenProfile`: a code without the programme, or the
  programme without a code, is a profile nobody can start. The cost is stated rather than hidden —
  such a version does not survive a change of oven, keeping its temperature and duration but
  losing the programme.
- **An assisted programme is read-only: it is recorded, never started remotely.** The appliance
  reports the code it is running and refuses that same code as a command — `program` enumerates
  the heating functions and nothing else, so the API answers 406 `String value not allowed`. The
  favourites are no way round it (`favoriteSelect` and `favorite` both answer `Capability not
  found`), and the appliance's own app reaches them through a different platform altogether.
  `OvenUseCase.start` therefore refuses `assisted-not-startable` **before the appliance is
  reached**: sending it anyway earned a refusal the cook read as "remote operation is off", which
  sent them to fix a setting that was never wrong. Such a version is still worth writing down —
  the notebook remembers the programme, the cook presses start on the oven.
- **The oven's own dials are copyable into a version** (`Oven.settings`, read whether the oven is
  cooking or merely selected). That is what replaces the catalogue the API does not offer: the
  cook sets a cooking up on the appliance — using its assisted programmes if they like — and the
  notebook captures the result. It is the same *shu → ha* move as before, sourced from the
  appliance rather than from a list: the oven proposes, the version records, the next iteration
  deviates.
- **The copy takes what the oven says, not all or nothing.** A dial the appliance reports is
  copied, one it does not is left to the cook — and the mode is the one that goes missing in
  practice, because an oven names its heating functions with codes the notebook does not all know
  (`PROGRAM_CODES` is partial by design, and partial again against what one appliance declares).
  Requiring a mode *and* a temperature is what hid the copy from a real oven baking bread at
  230 °C for an hour: its code was unmapped, so the mode was absent, and the two settings that
  *were* there went with it. When the mode is missing the copy says so before it runs, since an
  untouched mode row otherwise reads as the oven's answer. The timer and the probe stay the
  exception: their absence **is** an answer — an oven reporting no timer is an oven cooking
  without one — and the copy is never offered on an oven that says nothing at all.
- **A programme code the notebook cannot read is reported, not swallowed.** It costs the mode
  alone, never the dials, and it reaches Sentry once per instance: silence here is what turned a
  wrong entry in the table into a button that simply never appeared, with a sheet counting the
  minutes down beside it.

## Two import flows

The AI import is **two independent flows**, and which one runs is decided by the tab the cook
launched it from — never guessed from the source.

| | cooking | coffee |
|---|---|---|
| mutation | `analyzeCookingImport` | `analyzeCoffeeImport` |
| result | `CookingImportAnalysis`: type (`dish` / `thermomix`), category, ingredients, steps, tips | `CoffeeImportAnalysis`: method, parameters, tips |
| prompt / response schema | `server/system/ai/import/cooking.ts` | `server/system/ai/import/coffee.ts` |

- The cooking prompt **never answers `coffee`**, and the coffee prompt never returns an ingredient
  list or a step: each speaks only its own world, which is what the single prompt could not do.
- **The coffee prompt reads, it does not guess.** Every parameter the source does not state comes
  back `null`, with one exception: a value ENTIRELY determined by one it did read may be computed
  — the water from the dose at the method's ratio, or the reverse. A name, an origin, a roast
  date, a grind, a machine are never invented: a missing value is information, an invented one is
  a lie the cook brews against.
- Shared by both, because they are product rules rather than recipe rules: the `import` quota
  (one import is one import), the SHA-256 analysis cache, the Premium gate on URL imports, and the
  error codes. The **cache key carries the flow**: the same photo read as a coffee and as a dish
  are two analyses.

## Lineage and attempts

- **Linear lineage**: a recipe owns a chain of `RecipeVersion`s (`v1 → v2 → v3 …`).
  `RecipeVersion.basedOn` is the `VersionNumber` a version was iterated from (**absent** on v1,
  which iterates on nothing). No forks, no variations, no `derivedFrom`.
- **Copying a version out is the only way to leave a lineage**, through
  `RecipeCommand.copyVersion(userId, { recipeId, number, title })`: the variant that has drifted
  too far to be one more iteration becomes a recipe of its own, under a name the cook types (the
  same name twice is two library rows nobody can tell apart). The new recipe keeps the type and the
  course or brew method of the one copied; its `v1` carries that version's `content`, its `tips`,
  its `warnings` and its attempt outcome (`executedAt`/`rating`/`remarks`/`photoPath`) — a
  rating is a verdict on the plate, and the plate is what was copied. It carries **nothing of the
  lineage**: no `change`, no `basedOn`, no `toTest` (nobody asked for this version). And nothing
  links the two sides — no pointer either way, so "no forks" still holds on both: where it came
  from survives as the origin label alone (`{ kind: 'import', detail: "Grandma's lasagna v3" }`),
  the very field an import fills with the site it read. The recipe copied is not written at all,
  its date included: copying a version is not working on it.
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
  `addVersion` is what that is for. The notebook belongs to the cook, not to the model. Same border
  `updateCoffeeParameters` and `updateOvenProfile` already draw, now drawn around the ingredients
  (`RecipeCommand.updateIngredients`) and the steps (`RecipeCommand.updateSteps`) too. Both are
  full replacements of their own list — adding, deleting and reordering all come through them —
  and both answer `'not-a-cooked-recipe'` on a coffee, which has neither.
- **An attempt lands on the version cooked**, always — a rating is a verdict on the plate that was
  made. Which version that is depends on what was asked: the one on screen when an iteration is
  asked for (it has not been made yet), the one *created* when it transcribes a change already
  eaten (see [Change](#change--the-version-already-eaten)):
  - **rating (and photo) without remarks** — nothing new is created,
    `RecipeCommand.recordAttempt` writes `rating` (1..5), `executedAt`, `photoPath` onto the
    version cooked and rewrites them in place on a re-cook (dropping the previous photo *and*
    remarks). `remarks` is optional here: a bare rating ends the flow.
  - **with remarks** — the cook asks for the next version, and their `rating`/`remarks`/`photoPath`
    are recorded on the version they cooked (`basedOn`) when the proposal is accepted, through
    `RecipeCommand.addVersion`'s `attempt` — the same write as a bare cook, which is why both go
    through one `cooked(version, attempt, now)`. **The version created carries no outcome**: it is
    one to test. Nothing at all is persisted until the proposal is accepted: refusing it loses the
    rating, by design.
- **The note alone is correctable**, through `RecipeCommand.updateRating` — the verdict mistyped,
  or the cook logged after the fact. It rewrites `rating` and nothing else: the photo and the
  remarks of the attempt stay (unlike `recordAttempt`, which replaces the whole outcome). Rating a
  version that had never been cooked makes it one that has — it gains its `executedAt` and drops
  its `toTest`, so a version is never both rated and still owing a try.
- **A version is dated by its last edit** (`RecipeVersion.updatedAt`, equal to `createdAt` until
  something is changed on it): the app shows it on the recipe sheet and files the version under
  its month in the history and the to-cook list. Only the cook's own rewrites move it —
  `recordAttempt`, `updateRating`, `updateTips`, `updateIngredients`, `updateSteps`,
  `updateCoffeeParameters`, `updateOvenProfile`, and the cook `addVersion` writes on the version it
  iterates on. The bookkeeping writes (a child re-based by a deletion)
  leave it alone: they change nothing the cook wrote, and moving a version to another month
  behind their back is a lie.

## Composition — a recipe is made of other recipes

A bread is two recipes: the poolish and the dough. **A recipe holds the recipes it is made of** —
`Recipe.components: { recipe: RecipeId, scale: ComponentScale }[]`, set by
`RecipeCommand.linkComponent` / `unlinkComponent` and by nothing else.

- **The link is held by the RECIPE, not by a version and not by an ingredient line.** The cook
  posts it from the recipe sheet, it holds for every version of it, and no iteration has to carry
  it forward. That is what it means for it to be aggregate-level identity, next to `category` and
  `method`: what a recipe is made of does not change because one attempt reworded a step.
- **The link holds a recipe, never a version.** Which version answers for the linked recipe is
  derived at read time (`versionToOpen` — the best-rated one, else the latest, never one still
  owing a cook). The poolish keeps improving on its own and the bread follows without a single
  write. It is [derivation, not promotion](#derivation--no-promotion), applied to a link.
- **A link carries a weight, and the weight is a factor.** `scale` is a multiplier of what the
  linked recipe writes: `0.2` is a fifth of it, `1` is it as written. It is set by typing the
  quantity WANTED on one of that recipe's lines ("my flour is 100 g", where it writes 500 g) or by
  walking it with the −/+ — a factor is never typed, because a factor is not something anyone
  cooks. What is stored is the factor all the same: it is the only form that still means the same
  thing after that recipe changes a quantity, and quantities themselves stay display strings the AI
  wrote ("1,2 kg", "1 gousse"), never numbers — the app resizes them for display and never rewrites
  the version.
- **This is not a fork.** "No forks" forbids *lineage* links between versions (`derivedFrom`, and
  the deliberate absence of one on `copyVersion`). A component is a *composition* link between two
  aggregates — another axis entirely. Both rules hold at once.
- **Linking is not cooking.** `linkComponent` creates no version, and deliberately does not restamp
  `updatedAt` (= `lastWorkedOn`): saying what a recipe is made of leaves the kitchen untouched, the
  same border `update` draws. Linking a recipe already linked **rewrites its weight in place**,
  keeping its place in the list — that is the whole of "correct the weight", and it is why the
  command is an upsert rather than an append.
- **The link is read both ways.** `usedBy` answers which recipes are made of a given one — the
  poolish's page says which breads call for it. Derived, never set: `componentIds` denormalizes the
  ids so Firestore can answer it with one `array-contains` query per sheet (`withComponents` writes
  the list and the ids together, so they cannot drift). The recipe used is never written by being
  linked: everything about the link lives on the recipe that posted it.
- **Resolution stops at one level.** The bread's sheet lists the poolish; what the poolish is made
  of is not read. No recursion, so no cycle to forbid and no unbounded read budget. A recipe made of
  itself is refused (`'self-reference'`); longer cycles (A → B → A) are left alone — nothing
  resolves past one level, so they are a navigation the cook walks out of, not a loop.
- **Deleting the linked recipe breaks nothing.** The link resolves to nothing and drops out of the
  section. Nothing is cleaned up and no deletion is refused: the cook threw that recipe away on
  purpose, and a dangling entry costs a line in a document nobody reads.
- **A coffee can carry one like anything else.** The link is on the aggregate, so it no longer
  depends on there being an ingredient list — nothing in the domain has to answer
  `'not-a-cooked-recipe'` here.
- **A copy holds no link.** `copyVersion` copies the version's CONTENT, and the links are not
  content: the new recipe starts made of nothing, and the cook links what it is actually made of.
- **The model is told nothing of the links.** It regenerates ingredient lists and steps, neither of
  which holds a link any more, so there is nothing to protect and nothing to leak into a prompt.
- **Twenty links per recipe** (`COMPONENT_LIMITS.perRecipe`), a weight between `0.01` and `100`
  (`COMPONENT_LIMITS.scale`) — past either, it is a typo and not a recipe. A weight is corrected at
  the cap, since correcting one does not lengthen the list.

## Derivation — no promotion

Everything is derived (`recipe/business-rules.ts`), nothing is promoted:

- `bestRating` = the recipe's best-rated cooked version (highest rating; tie → most recent
  version), `undefined` when nothing was ever cooked; it drives the displayed rating.
- `versionToOpen` = the version the recipe sheet opens on: the best-rated version, else the
  latest (a recipe with no cook behind it). A version waiting to be cooked (`toTest`) never
  opens — the flask CTA is the only way in.
- `lastWorkedOn` = the date of that version — **what dates a recipe**. `Recipe.updatedAt` carries
  it, denormalized so Firestore can order and page the library on it (like `categoryRank`), and
  every command that rewrites the lineage restamps it (through `restamped`, which derives it and
  the favourites mirror in one place). Consequences, all deliberate: renaming a recipe, refiling it
  or hearting one of its versions **never** moves it — filing is not cooking, and the notebook must
  not reshuffle when you tap a heart; and a fresh attempt rated below the reference leaves the
  recipe where it was, because the version that answers for it has not changed. Editing the plate
  itself — its tips, its cautions, its coffee dials — does move it: that is the cook at work. A better attempt, a corrected note, or deleting the reference hands it over, date
  included.
- `favorited` = whether **any** version is hearted — **what puts a recipe in the favourites lens**.
  `Recipe.favorite` carries it, denormalized for the same reason as the date, and restamped by the
  same helper. See [The heart is worn by a version](#the-heart-is-worn-by-a-version).

## Improvement and `toTest`

- **Improvement**: the second way to ask for a version, with no cook behind it — the user writes
  what they want changed and
  `ProposalUseCase.fromImprovement(userId, recipeId, versionNumber, improvement)` feeds it to the
  AI in place of the attempts (same ephemeral `Proposal`). Accepting it appends `n+1` **without**
  an attempt: nothing is written on the version it iterates on. The app asks for it with
  the same remark field as an attempt, left unrated: what makes it an improvement is the absence
  of a note, not a screen of its own.
- **`toTest`** (`RecipeVersion.toTest?: true`, absent = not on the list): the versions waiting to
  be cooked, listed by the recipe sheet's flask CTA. **Every accepted proposal raises it** — an
  iteration is by definition a version nobody has made yet, whether a cook or an improvement asked
  for it. The one exception is a change already eaten (below), which is born cooked. It drops the
  moment the version is cooked: `recordAttempt` rewrites it away, and so does the cook an
  attempt-born proposal writes on the version it iterates on (`basedOn`).

## Change — the version already eaten

- **Change**: the third way to a version, and the only one that does not ask for anything. The
  cook modified the recipe *at the stove* — "j'ai mis 10 g de sucre au lieu de 20" — cooked it and
  ate it, so `ProposalUseCase.fromChange(userId, recipeId, versionNumber, change)` has the AI
  **transcribe** it: `Ai.applyCookingChange` / `Ai.applyCoffeeChange` (`system/ai/change/*`, one
  prompt per world like every other flow) apply exactly what the sentence describes and **invent
  nothing** — no rationale (`Proposal.rationale` comes back `''`, so the version carries no `why`)
  and no tips (the version's own are carried over untouched). It is an AI call on an existing
  version, so it spends one iteration of the allowance.
- **Accepting it creates a version that has already been made** — `AcceptedProposal.cooked` →
  `NewVersionInput.cooked` → `RecipeCommand.addVersion`. That flag flips three things at once:
  the version is born **executed** instead of `toTest`, its `origin.kind` is `'manual'` (the
  cook's own hand, the model only wrote it down), and the attempt — the verdict on *that* plate —
  lands **on it**, leaving `basedOn` exactly as it was. Rated, it becomes the recipe's best
  version like any other; unrated, it is a version cooked without a verdict (`executedAt` with no
  `rating`), which `bestRating` ignores.
- **A change and an improvement written together chain two versions**, in that order: the version
  eaten is written down and takes the cook, then the improvement is asked **from it** — not from
  the version on screen, since what is asked to be improved is what was eaten. Two AI calls, two
  iterations of the allowance, and the second version is one to test like any other. The app is
  what sequences them (`ExecuteFlowView`); the domain knows only the two independent flows.

## Tips

**Tips** (`RecipeVersion.tips: Tip[]`): the version's cooking advice ("Servir avec du riz",
"Se congèle bien") — neither an ingredient nor a step. Type-agnostic, so it sits on the
versioning *envelope* (`version.ts`), never in `content`; total (`[]` = none, and the app renders
no section). Three ways in:

1. the AI extracts them at **import** (they land on v1);
2. a **proposal** always returns the complete tips list of the version it creates (the AI folds
   advice it reads in the remarks into it);
3. the **tips field** of the recipe sheet's play CTA (`ProposalUseCase.fromTips` → `Ai.formatTips`,
   merged/reworded/deduplicated, then `RecipeCommand.updateTips`) rewrites them **in place on the
   displayed version — no new version, no `toTest`, nothing else touched**.

That in-place rewrite is what keeps `tips` out of `content`: everything in `content` is frozen
for the life of a version.

## Warnings — the caution the version carries

**Warnings** (`RecipeVersion.warnings: Warning[]`): the cook's cautions on this attempt ("Le fouet
doit être mis dès le début") — the banner atop the recipe sheet, so a critical gesture is read
before cooking starts. Like `tips` it sits on the versioning *envelope*, is type-agnostic, and is
total (`[]` = none, and the app renders no banner). It is written by the cook alone: no import, no
proposal and no prompt ever produces one.

- **Versioned, like everything that describes the plate.** A caution is about the gesture this
  attempt needs, and the app reads it off the version on screen — the sheet's banner follows what
  is being read, never the recipe as a whole.
- **Carried onto the next iteration** (`addVersion`, from the version it iterates on), exactly like
  the oven profile. This is what makes versioning it safe: the cook wrote the
  caution about a gesture rather than about one seasoning, and saying yes to a proposal must not
  drop it. Nothing in the AI's answer can add, edit or remove one.
- **Rewritten in place** (`updateWarnings(recipeId, versionNumber, warnings)`), full-replacement,
  `[]` clears the banner. No version is created — pinning a caution on the plate is not cooking it
  — but the version's `updatedAt` moves, and with it the recipe's date: it is an edit the cook
  made, exactly like `updateTips`.
- **A copied version keeps them** (`copyVersion`), for the same reason it keeps its tips and its
  verdict: it is the same plate under another name.

## The heart is worn by a version

**Favourite** (`RecipeVersion.favorite?: true`): the attempt the cook would make again, not the page
it sits on. Set by `updateFavorite(recipeId, versionNumber, favorite)` and by nothing else, and
carried onto the next iteration like the cautions — accepting a proposal continues the line of work
that was hearted.

- **`Recipe.favorite` is the derived mirror**, `favorited(versions)` — true as soon as **any**
  version is hearted (`favorited` sits with the other derivations — see
  [Derivation — no promotion](#derivation--no-promotion)). Deliberately not
  `versionToOpen(versions).favorite`: a mark the cook put on an
  attempt must not disappear because another version took a better rating. It is denormalized onto
  the recipe document for one reason — the library's favourites lens is a Firestore query
  (`where('favorite', '==', true)`), and Firestore cannot filter a parent on its satellites. Same
  mechanism as `updatedAt` carrying `lastWorkedOn`, and `categoryRank`/`methodRank`.
- **Every command that rewrites the lineage restamps it** through the single `restamped(recipe,
  versions)` helper, which derives the recipe's date and its mirror together — one place, so a
  command cannot restamp one and forget the other.
- **Hearting is filing, not cooking**: neither the version's `updatedAt` nor the recipe's moves, so
  the notebook is not reshuffled by a heart. This is what separates it from a caution or a tip,
  which are edits to the plate itself.
- **A copied version keeps its heart**, like its cautions and its verdict: the copy is the same
  attempt under another name, and its `v1` is the only version its mirror can read.
- **Deleting the hearted version takes the recipe out of the lens** unless another one carries a
  heart — derived, like everything else about the aggregate.

## Iteration — the attempt travels in the request

`ProposalUseCase.fromAttempt(userId, recipeId, versionNumber, { rating, remarks })` reads the
version cooked and feeds both to the AI (→ `Proposal`, ephemeral, never stored); accepting it
(`ProposalUseCase.accept`) appends version `n+1` via `RecipeCommand.addVersion` with
`origin.kind = 'ai-proposal'`, threading `basedOn = the version cooked` and stamping that attempt
as **that** version's outcome — the new one is born owing a try. The app only asks for a proposal
when remarks were written — a bare rating ends the flow. Import confirmation persists a fresh recipe + v1 (`origin.kind = 'import'`)
via `RecipeCommand.create` (the `createRecipe` mutation).

## AI wording rules

**What counts as one import source** (`ImportSource`, assembled by `pickSource`): **photos and
text combine** — the cook photographs the two pages of a book and types what the pages leave out
or get wrong ("pour 4, au Chemex"), and the model reads them as one recipe, the typed text winning
where the two disagree. Up to `MAX_IMPORT_PHOTOS` (6). A **URL never combines** with either
(`BAD_USER_INPUT`): reading a web page is its own capability and its own Premium gate. The import
cache key includes the typed text, so the same photos with a different note are a different
analysis — photos with no text hash exactly as before.

The prompts, one module per flow under `server/system/ai/` (`import/*`, `proposal/*`, `change/*`,
`tips.ts`):

- An ingredient **name** carries its intrinsic *variety/type/grade* in parentheses
  (`Pommes de terre (Marbella)`, `Farine (T45)`) — only *transient* preparation (peeled, sliced)
  goes in the steps.
- An ingredient **quantity** in an imprecise kitchen unit (spoon, pinch, glass, cup…) carries
  its estimated gram equivalent in parentheses, specific to that ingredient
  (`1 c. à café (6 g)` for salt) — quantities already in metric weight/volume and countable
  pieces stay bare.
- A proposal must apply a remark's concrete value change into the right structured field (a
  Thermomix time/temperature/speed in the step `settings`, a grind/time/yield/dose/water in the
  coffee's `parameters`, a duration in the dish step text, a quantity on the ingredient) and
  summarise each change in `changeSummary` as `old → new` — the
  arrow being U+2192 and nothing else, a substitution written like a value change
  (`Citrons jaunes 2-3 pièces → Pomelo 1 pièce`) — several changes joined by `, `
  (`Bouillon 50 → 40 cl, cuisson 3 h 30 → 4 h`). Rendered verbatim as the proposal card's title,
  so the prompt must name the arrow character explicitly: told only "a comma-separated list of
  deltas", the model has answered with the comma as the separator *inside* a change.
- **How far one iteration may go depends on the world**, and the two rules live in two prompts
  (`server/system/ai/proposal/cooking.ts`, `proposal/coffee.ts`):
  - *Cooking* (`dish`, `thermomix`) — several coherent elements may move at once. **The oven is
    not one of them**: the AI never reads it, never proposes it, and is never even told about it.
    A heating function is set by hand — on the appliance or in the app — because a model that has
    never seen the dish brown cannot judge one, and because getting it wrong cooks something else
    without saying so. The profile is carried forward to the proposed version **by the code**
    (`carriedOven`), so accepting a change of seasoning never silently unsets the oven.
  - *Coffee* — **exactly one variable per version**, from a closed list: the grind, the dose, the
    water amount (the ratio), the water temperature, the brew time, the yield or the milk. Never
    two. That is the whole point of the notebook here: with a single variable moved, the next
    tasting says what that variable did; move two and the attempt teaches nothing. When the
    remarks call for several changes, the model applies the one that most likely explains what was
    tasted and names in its `rationale` what it is holding back for the iteration after. The
    **beans** (name, country, producer, roast date), the **kind of water** and the **gear**
    (machine, grinder, machine profile) are off-limits: they are what the cook observed, not dials — the model sets an
    extraction, it does not recommend a purchase. The brewing method is never changed either — a
    V60 recipe stays a V60 (`CoffeeProposalContext.method` states it), and `currentParameters` is
    where the iteration starts from.
  - *Coffee, second rule*: **a parameter the current version leaves empty comes back empty.** A
    temperature nobody wrote down is a temperature nobody measured, and filling it in would
    rewrite the cook's experiment instead of continuing it. The app shows the empty field in the
    proposal — editable, like every other one — and the cook fills it in if they know it. The
    model proposes the field, never its value.
- **A change is transcribed, never advised** (`change/cooking.ts`, `change/coffee.ts`). The
  iteration rules above are rules about having an opinion, and here the cook already had theirs,
  at the stove: the model applies **exactly** what the sentence describes and nothing else — every
  ingredient, step, setting and dial it does not mention comes back identical, in the same order
  and the same words. It never rounds a value, never "fixes" a recipe it finds odd, and never
  moves a second variable (the single-variable rule of a coffee *proposal* does not apply: the
  cook may well have moved two dials, and what they drank is what gets written down). A sentence
  no ingredient and no step can carry leaves the lists untouched and is reported in
  `changeSummary`.

## The plan and the monthly AI allowance

The notebook is free and unlimited — recipes, versions, attempts, photos, export. The AI is the
app's only variable cost, so it is the only thing metered (`quota` domain, dimensioned in
[specs/2026-07-20-freemium-pricing-design.md](./specs/2026-07-20-freemium-pricing-design.md)):

- Two meters, `imports` and `iterations`. An **import** is one source analysis (either import
  mutation, whatever the source — six photos *and* a text are one analysis, so one import); an
  **iteration**
  is one AI call on an existing version — a proposal, an improvement, a change *or* a tips merge,
  all four sharing the same counter.
- `free` gets 3 imports and 5 iterations per **calendar month** (`FREE_LIMITS`), `premium`
  is unlimited. The window IS the month: one document per cook and per month, no reset job, and
  `renewsOn` is the 1st of the next month, UTC.
- **Importing from a URL is Premium.** It is the one call billed per request (Google Search
  grounding), and a free cook is refused before Gemini is ever called (`PREMIUM_REQUIRED`).
- **Check before, record after.** `ProposalUseCase` asks `QuotaQuery.exhaustedFor` before calling
  the AI (a refusal costs nothing, `QUOTA_EXHAUSTED`) and `QuotaCommand.record` only once the AI
  has answered: a Gemini failure never costs a cook a quota, and a source with no recipe in it
  (`no-recipe-found`) is a miss, not an import. A cache hit *does* count — the quota is a product
  promise, not a meter on our bill.
- **Premium is bought from Apple, and proved to us.** `EntitlementQuery.planOf` is the single
  answer to "what is this cook entitled to", and it reads the `entitlements` document — written
  only from a transaction whose signature checked out against Apple's root certificates. The app
  is never believed: it hands over the signed transaction, nothing more.
  `NITRO_PREMIUM_USER_IDS` stays as a comp list (the maker's account, a reviewer's).
- **A purchase names its cook.** `appAccountToken` is a version-5 UUID derived from the cook's id
  (`entitlement/business-rules.ts`), handed to StoreKit at purchase time and returned inside the
  signed transaction. A transaction that does not carry it, or carries someone else's, is refused
  — that is what stops a signed receipt from being replayed onto another account. The derivation
  is frozen: changing it detaches every subscription already sold.
- **Cancelling is not losing.** Premium runs to `expiresAt` whatever happens; only a refund
  (`revokedAt`, pushed by the webhook) ends it on the spot.

## Style rules that bite here

See [code-style.md](./code-style.md):

- No `null` in the domain — absence is `field?: T` / `undefined`, converted only at the GraphQL,
  Firestore and AI boundaries.
- Arrays and their items are never optional (`[T!]!` in GraphQL, `{}` for a plain step's
  `ThermomixStep.settings`).
- Enum/union values are English technical symbols (`dish`, `starter`, `ai-proposal`) that the app
  translates.
