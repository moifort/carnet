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
  an optional `milk`, and `gear` (machine / grinder). The four blocks are total (`{}` = nothing
  filled in); `milk` is **absent** on a drink that has none, its absence being the information.
  `restDays` derives, at read time, how many full
  days the beans rested between `beans.roastedOn` and the version's `createdAt`: frozen by
  construction, absent without a roast date or with one in the future.
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
- **A version *is* an attempt**: its `content` (the `VersionContent` union — `ingredients` +
  `steps`) and lineage (`origin`/`change`/`basedOn`) are immutable; its outcome **and its `tips`**
  are overwritable. An attempt is not an entity. A version with no outcome yet is a *planned*
  attempt: no `executedAt`, no `rating` (the fields are **absent**, never `null`).
- **An attempt lands on the version it produces**, and only a remark-less cook lands on the
  version cooked:
  - **rating (and photo) without remarks** — nothing new is created,
    `RecipeCommand.recordAttempt` writes `rating` (1..5), `executedAt`, `photoPath` onto the
    version cooked and rewrites them in place on a re-cook (dropping the previous photo *and*
    remarks). `remarks` is optional here: a bare rating ends the flow.
  - **with remarks** — the cook asks for the next version, so its `rating`/`remarks`/`photoPath`
    are recorded on the version that answers it, via `RecipeCommand.addVersion`'s `attempt`.
    **The version iterated on is never touched.** Nothing at all is persisted until the proposal
    is accepted: refusing it loses the rating, by design.
- **The note alone is correctable**, through `RecipeCommand.updateRating` — the verdict mistyped,
  or the cook logged after the fact. It rewrites `rating` and nothing else: the photo and the
  remarks of the attempt stay (unlike `recordAttempt`, which replaces the whole outcome). Rating a
  version that had never been cooked makes it one that has — it gains its `executedAt` and drops
  its `toTest`, so a version is never both rated and still owing a try.
- **A version is dated by its last edit** (`RecipeVersion.updatedAt`, equal to `createdAt` until
  something is changed on it): the app shows it on the recipe sheet and files the version under
  its month in the history and the to-cook list. Only the cook's own rewrites move it —
  `recordAttempt`, `updateRating`, `updateTips`, `updateCoffeeParameters`. The bookkeeping writes (a child
  re-based by a deletion, a `toTest` flag dropped when the version that answers it is cooked)
  leave it alone: they change nothing the cook wrote, and moving a version to another month
  behind their back is a lie.

## Derivation — no promotion

Everything is derived (`recipe/business-rules.ts`), nothing is promoted:

- `bestRating` = the recipe's best-rated cooked version (highest rating; tie → most recent
  version), `undefined` when nothing was ever cooked; it drives the displayed rating.
- `versionToOpen` = the version the recipe sheet opens on: the best-rated version, else the
  latest (a recipe with no cook behind it). A version waiting to be cooked (`toTest`) never
  opens — the flask CTA is the only way in.
- `lastWorkedOn` = the date of that version — **what dates a recipe**. `Recipe.updatedAt` carries
  it, denormalized so Firestore can order and page the library on it (like `categoryRank`), and
  every command that rewrites the lineage restamps it. Consequences, all deliberate: renaming a
  recipe, refiling it, hearting it or pinning a caution **never** moves it — housekeeping is not
  cooking, and the notebook must not reshuffle when you tap a heart; and a fresh attempt rated
  below the reference leaves the recipe where it was, because the version that answers for it has
  not changed. A better attempt, a corrected note, or deleting the reference hands it over, date
  included.

## Improvement and `toTest`

- **Improvement**: the second way to ask for a version, with no cook behind it — the user writes
  what they want changed and
  `ProposalUseCase.fromImprovement(userId, recipeId, versionNumber, improvement)` feeds it to the
  AI in place of the attempts (same ephemeral `Proposal`). Accepting it appends `n+1` **without**
  an attempt, which is the **sole** way a version gets `toTest: true`. The app asks for it with
  the same remark field as an attempt, left unrated: what makes it an improvement is the absence
  of a note, not a screen of its own.
- **`toTest`** (`RecipeVersion.toTest?: true`, absent = not on the list): the versions waiting to
  be cooked, listed by the recipe sheet's flask CTA. Only an improvement raises it; it drops the
  moment the version is cooked — `recordAttempt` rewrites it away, and accepting an attempt-born
  proposal clears it on the version it answers (`basedOn`).

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

## Iteration — the attempt travels in the request

`ProposalUseCase.fromAttempt(userId, recipeId, versionNumber, { rating, remarks })` reads the
version cooked and feeds both to the AI (→ `Proposal`, ephemeral, never stored); accepting it
(`ProposalUseCase.accept`) appends version `n+1` via `RecipeCommand.addVersion` with
`origin.kind = 'ai-proposal'`, threading `basedOn = the version cooked` and stamping that attempt
as the new version's outcome. The app only asks for a proposal when remarks were written — a bare
rating ends the flow. Import confirmation persists a fresh recipe + v1 (`origin.kind = 'import'`)
via `RecipeCommand.create` (the `createRecipe` mutation).

## AI wording rules

**What counts as one import source** (`ImportSource`, assembled by `pickSource`): **photos and
text combine** — the cook photographs the two pages of a book and types what the pages leave out
or get wrong ("pour 4, au Chemex"), and the model reads them as one recipe, the typed text winning
where the two disagree. Up to `MAX_IMPORT_PHOTOS` (6). A **URL never combines** with either
(`BAD_USER_INPUT`): reading a web page is its own capability and its own Premium gate. The import
cache key includes the typed text, so the same photos with a different note are a different
analysis — photos with no text hash exactly as before.

The prompts, one module per flow under `server/system/ai/` (`import/*`, `proposal/*`, `tips.ts`):

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
  - *Cooking* (`dish`, `thermomix`) — several coherent elements may move at once.
  - *Coffee* — **exactly one variable per version**, from a closed list: the grind, the dose, the
    water amount (the ratio), the water temperature, the brew time, the yield or the milk. Never
    two. That is the whole point of the notebook here: with a single variable moved, the next
    tasting says what that variable did; move two and the attempt teaches nothing. When the
    remarks call for several changes, the model applies the one that most likely explains what was
    tasted and names in its `rationale` what it is holding back for the iteration after. The
    **beans** (name, country, producer, roast date), the **kind of water** and the **gear** are
    off-limits: they are what the cook observed, not dials — the model sets an extraction, it does
    not recommend a purchase. The brewing method is never changed either — a V60 recipe stays a
    V60 (`CoffeeProposalContext.method` states it), and `currentParameters` is where the iteration
    starts from.
  - *Coffee, second rule*: **a parameter the current version leaves empty comes back empty.** A
    temperature nobody wrote down is a temperature nobody measured, and filling it in would
    rewrite the cook's experiment instead of continuing it. The app shows the empty field in the
    proposal — editable, like every other one — and the cook fills it in if they know it. The
    model proposes the field, never its value.

## The plan and the monthly AI allowance

The notebook is free and unlimited — recipes, versions, attempts, photos, export. The AI is the
app's only variable cost, so it is the only thing metered (`quota` domain, dimensioned in
[specs/2026-07-20-freemium-pricing-design.md](./specs/2026-07-20-freemium-pricing-design.md)):

- Two meters, `imports` and `iterations`. An **import** is one source analysis (either import
  mutation, whatever the source — six photos *and* a text are one analysis, so one import); an
  **iteration**
  is one AI call on an existing version — a proposal, an improvement *or* a tips merge, all three
  sharing the same counter.
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
