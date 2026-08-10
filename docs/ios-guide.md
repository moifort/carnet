# iOS Development Guide

## Tech Stack

- **SwiftUI**, iOS 26.0 deployment target
- **Swift 6** with strict concurrency
- **GraphQL via Apollo iOS** (not REST) — typed operations generated from `shared/schema.graphql`
- **Firebase Auth + Sign in with Apple** (mono-user, but real auth)
- **Sentry** (`sentry-cocoa`, SPM) for error reporting
- Style: **Liquid Glass** — native iOS 26 components, no custom re-skins

Xcode project `ios/Shuhari.xcodeproj`, scheme `Shuhari`, bundle id `com.polyforms.shuhari.app`,
team `46C337T7YN`. The project uses `fileSystemSynchronizedGroups`, so new files are picked up
without editing the pbxproj.

## Project Structure

```
ios/
├── apollo-codegen-config.json          # Apollo codegen config (schemaNamespace: ShuhariGraphQL)
└── Shuhari/
    ├── ShuhariApp.swift                # @main; FirebaseApp.configure() in init(); DEBUG gallery branch
    ├── Shuhari.entitlements            # Sign in with Apple
    ├── GoogleService-Info.plist        # Firebase config
    ├── Generated/GraphQL/              # Apollo codegen output (do not edit)
    │   ├── Operations/{Queries,Mutations}/
    │   ├── Fragments/                  # VersionFields, ProposalFields
    │   └── Schema/                     # CustomScalars (RecipeId, Rating, …), Enums, Objects, InputObjects
    ├── Features/
    │   ├── Auth/  Home/  Coffee/  Recipe/  Proposal/  Execution/  Import/  Settings/
    │   └── {Feature}/
    │       ├── {Feature}Store.swift    # ViewModel (@MainActor @Observable) — or {Feature}ViewModel
    │       ├── {Feature}API.swift      # maps generated types → model structs
    │       ├── {Feature}Models.swift   # Sendable model structs
    │       ├── {Feature}View.swift     # coordinator (navigation, API, sheets)
    │       ├── GraphQL/*.graphql       # hand-written operations for this feature
    │       └── components/{pages,organisms,molecules}/
    └── Shared/
        ├── Components/                 # shared atoms (Chip, RatingBadge, TmxStepsList, …)
        ├── GraphQLClient.swift         # singleton ApolloClient
        ├── GraphQLHelpers.swift        # async fetch/perform bridges + nullable helpers
        ├── APIClient.swift             # base-URL resolver only
        ├── Theme.swift  DebugGallery.swift  PreviewFixtures.swift
        └── RecipeType+GraphQL.swift    # enum bridging generated ⇄ design enums
```

> **Layer naming is role-based, not uniform.** The *coordinator* is a `*View.swift` (owns
> navigation + API); *pure presentation* is a `*Page.swift`; the *ViewModel* is a `*Store` (Home
> and most features) or a `*ViewModel` (Recipe). Atoms live centrally in `Shared/Components/` —
> features have no per-feature `atoms/`. Some features (Proposal, Import) only have `pages/`.

### The root tabs

`ContentView` holds two content tabs — **Cuisine** (`HomeView`, cooking: `RecipeType.cooking`) and
**Café** (`CoffeeView`, `[.coffee]`) — plus the trailing **Importer** entry (`.search`/`.prominent`
role), which opens the camera full-screen and belongs to neither.

Both tabs are the same machinery pointed at different types: one `LibraryStore(types:)`, one
`HomePage`, one `LibrarySection`, and the type-agnostic `recipeFlow`. What differs is what each is
filed by — a dish course vs. a brew method — which is why `HomePage`'s filter facet is
**primitive-first** (`Facet`: a title, `(id, label, systemImage)` options and a `Binding<String?>`)
rather than typed on `DishCategory`: the page filters on *something* without knowing what. The
domain-to-primitive bridges are `HomePage.Facet.course(selection:)` / `.method(selection:)`.

**The tab decides the import flow.** The entry is shared, what it runs is not: launched from Café
it reads the source as a coffee, from Cuisine as something cooked. `ContentView` derives an
`ImportFlow` from the tab it came from (`lastContentTab`) and threads it through `ImportJob` to
`ImportReviewSheet`, which calls `ImportAPI.analyzeCoffee` or `.analyzeCooking` and shows
`CoffeeImportPreviewPage` or `ImportPreviewPage`. Nothing is guessed from the source, and the
created recipe lands in the tab it came from. Closing the camera cover restores that tab.

## Data fetching — GraphQL, not REST

All transport goes through Apollo. `APIClient` is reduced to resolving the base URL; there is no
REST data layer in the app (`Shared/Services/` is empty).

### The client

`Shared/GraphQLClient.swift` — a singleton `ApolloClient` pointed at `<baseURL>/graphql`, with an
interceptor chain that injects the Firebase token and logs:

```swift
final class GraphQLClient: @unchecked Sendable {
    static let shared = GraphQLClient()
    let apollo: ApolloClient
    private init() {
        let url = APIClient.shared.baseURL.appendingPathComponent("graphql")
        let store = ApolloStore()
        let transport = RequestChainNetworkTransport(
            interceptorProvider: AuthenticatedInterceptorProvider(store: store),
            endpointURL: url)
        apollo = ApolloClient(networkTransport: transport, store: store)
    }
}

final class AuthenticatedInterceptorProvider: DefaultInterceptorProvider {
    override func interceptors<O: GraphQLOperation>(for operation: O) -> [any ApolloInterceptor] {
        var list = super.interceptors(for: operation)
        list.insert(FirebaseTokenInterceptor(), at: 0)   // Authorization: Bearer <ID token>
        list.append(GraphQLLoggingInterceptor())
        return list
    }
}
```

### The async helpers

`Shared/GraphQLHelpers.swift` bridges Apollo callbacks to `async`/`await`, surfaces GraphQL
errors as `APIError.graphQL`, and **fully disables the normalized cache**
(`cachePolicy: .fetchIgnoringCacheCompletely`, `publishResultToStore: false`):

```swift
let data = try await GraphQLHelpers.fetch(GraphQLClient.shared.apollo, query: ShuhariGraphQL.HomeQuery())
_    = try await GraphQLHelpers.perform(GraphQLClient.shared.apollo, mutation: ShuhariGraphQL.UpdateRecipeMutation(id: id, input: input))
```

It also provides `graphQLNullable(_:)` (wrap `T?` into `GraphQLNullable`, blank strings → `.none`)
and `parseISO8601(_:)` for the `DateTime` scalar.

### The feature API enum — the mapping boundary

Each feature exposes a caseless `enum {Feature}API` of static async functions that call the
generated operations and **map generated types → `Sendable` model structs**. Generated Apollo
types must never leak into views.

```swift
enum LibraryAPI {
    static func list(sort: RecipeSortOption, limit: Int, after: String?) async throws -> RecipePage {
        let query = ShuhariGraphQL.RecipeListQuery(/* sort, order, limit, after */)
        let data = try await GraphQLHelpers.fetch(GraphQLClient.shared.apollo, query: query)
        let recipes = data.recipes
        return RecipePage(
            items: recipes.items.map { recipe in
                LibraryRecipe(id: recipe.id, title: recipe.title,
                              type: RecipeType(graphql: recipe.type),
                              category: DishCategory(graphql: recipe.category),
                              versionCount: recipe.versionCount,
                              bestRating: recipe.bestRating,   // derived server-side
                              updatedAt: GraphQLHelpers.parseISO8601(recipe.updatedAt) ?? .distantPast)
            },
            hasMore: recipes.hasMore,
            totalCount: recipes.totalCount)
    }
}
```

For mutations, build inputs with the nullable helper; enum bridging (generated
`GraphQLEnum<ShuhariGraphQL.RecipeType>` ⇄ the design `RecipeType`) is centralized in
`Shared/RecipeType+GraphQL.swift` via `init(graphql:)` / `.graphQLValue`.

## Feature Pattern

### ViewModel — `@MainActor @Observable`, single-flight

Use the Observation framework (`@Observable`), not `ObservableObject`. Guard against stale or
concurrent loads (an in-flight task, or a generation token when the list paginates — see the real
`LibraryStore`). **Every network call shows a loading state** — flip `isLoading` around the fetch,
never a silent fetch that leaves the UI frozen. For a call fired by a CTA rather than by a screen
appearing, see [CTA + network](#cta--network--never-a-silent-wait).

```swift
@MainActor @Observable
final class LibraryStore {
    private(set) var items: [LibraryRecipe] = []
    var isLoading = true
    var hasMore = false
    var error: String?
    // Stale-response guard: each reload bumps the generation; a late response from a
    // previous sort/filter fails its guard and is dropped.
    private var generation = 0

    func load() async {
        generation += 1
        let requested = generation
        isLoading = true; error = nil
        do {
            let page = try await LibraryAPI.list(sort: sort, limit: 20, after: nil)
            guard requested == generation else { return }   // response from a stale view
            items = page.items; hasMore = page.hasMore
        } catch { self.error = reportError(error) }         // captures to Sentry + returns the message
        isLoading = false
    }
}
```

### `RecipeStore` — the recipe flow's one state

The recipe flow spans one screen and its sheets over the same recipe: the recipe sheet, the
history sheet and the to-cook sheet. They share **one**
`RecipeStore` (`Features/Recipe/RecipeStore.swift`), owned by the tab that hosts the flow
(`HomeView`, `CoffeeView`) beside its `LibraryStore` and handed down through
`.recipeFlow(store:path:…)` — see [one state per flow](swiftui-best-practices.md#one-state-per-flow-never-one-per-screen).

- `store.recipe(id)` is what the screen renders; `store.load(id)` is called by its `.task`
  (unguarded) and after every mutation, so one read updates the screen and its sheets at once.
- **Which version is shown is `@State` on the screen, not a route.** The history and to-cook
  sheets hand back a number, `selectedVersion` takes it, and the same screen redraws on a version
  the recipe already carries — no round trip, and the stack stays one deep however long the cook
  browses (see [browsing is a state change](swiftui-best-practices.md#browsing-siblings-is-a-state-change-not-a-push)).
  `RecipeRoute` therefore has a single case: a recipe.
- The flask CTA, its sheet and the version list can no longer disagree on what is left to test.
- `store.forget(id)` is called on the two delete paths, whose call runs in the background.
- `RecipeStore(previewRecipe:)` seeds a fixture and **never** calls the server: it is what makes
  the whole flow — sheets included — reviewable offline in `DebugGallery`.

The one screen still holding a copy of its own is `ExecuteFlowView`, which fetches the recipe when
the play CTA opens it.

### Coordinator (`*View.swift`) vs. Page (`*Page.swift`)

The **coordinator** owns the `NavigationStack`, sheets, `.task`/`.refreshable`, and reads the
store from the environment. The **page** is pure: data in, closures out — no networking, no
navigation state.

```swift
struct HomeView: View {                        // coordinator (the Cuisine tab)
    @Environment(LibraryStore.self) private var store
    @State private var path = NavigationPath()
    var body: some View {
        NavigationStack(path: $path) {
            HomePage(library: store.items, libraryLoading: store.isLoading,
                     libraryHasMore: store.hasMore, sort: /* binding */, onSettings: { … },
                     onLoadMore: { await store.loadMore() })
                .task { if store.items.isEmpty { await store.load() } }
                .refreshable { await store.load() }
        }
    }
}

struct HomePage: View {                         // pure presentation
    let library: [LibraryRecipe]
    let libraryLoading: Bool
    let libraryHasMore: Bool
    let onSettings: () -> Void
    var onLoadMore: () async -> Void = {}
    var body: some View {
        List {
            ForEach(LibraryMonthGroup.grouping(library)) { group in
                LibrarySection(group: group)
            }
            if libraryHasMore { LoadMoreRow(onLoadMore: onLoadMore) }
        }
    }
}
```

## Atomic Design

| Layer | Location | Receives | Examples |
|-------|----------|----------|----------|
| **Atoms** | `Shared/Components/` | Primitives | `Chip`, `RatingBadge`, `RatingStars`, `StepsList` |
| **Molecules** | `Features/{F}/components/molecules/` | Primitives | `LibraryRow`, `VersionTimelineItem` |
| **Organisms** | `Features/{F}/components/organisms/` | Primitives or a domain struct (mapping boundary) | `LibrarySection`, `IngredientsSection` |
| **Pages** | `Features/{F}/components/pages/` | Data + closures | `HomePage`, `RecipeDetailPage` |

Atoms in `Shared/Components/` are cross-feature. Promote a molecule used in 2+ features up to
`Shared/Components/`.

### Primitive-first leaf views

Leaf views receive only primitives — never the generated GraphQL types, and never full domain
model structs when they use a handful of fields.

**Allowed:** `String`, `Int`, `Int?`, `Double?`, `Bool`, `Date?`; simple enums without logic
(like `RecipeType`); closures. **Never:** generated Apollo types.

### Nested `Item` struct (5+ parameters)

When a component needs many parameters, define a nested `Item`. Example — `ParamsGrid`:

```swift
struct ParamsGrid: View {
    struct Item: Identifiable {
        let id = UUID()
        let key: String
        let value: String
        var highlighted: Bool = false
    }
    let items: [Item]
    var big: Bool = false
}
```

The mapping from model to `Item` happens at the page/organism level.

## Sheet toolbar CTAs — icons, never text

A sheet's toolbar action buttons (`.cancellationAction`, `.confirmationAction`, or any
`ToolbarItem` in a view presented via `.sheet`) **always** use an SF Symbol, **never** a text
label. Close is `xmark`, confirm/save is `checkmark`; pick the symbol that fits the action
otherwise (e.g. `sparkles` to launch an AI analysis). Always attach an `.accessibilityLabel` so
the intent survives for VoiceOver.

```swift
// ✅ icon + accessibility label
ToolbarItem(placement: .cancellationAction) {
    Button { dismiss() } label: {
        Image(systemName: "xmark")
    }
    .accessibilityLabel("Fermer")
}

// ❌ text label — also ❌ Button("Fermer", systemImage:) (renders the title next to the icon)
ToolbarItem(placement: .cancellationAction) {
    Button("Fermer") { dismiss() }
}
```

This keeps every modal's chrome to the compact Liquid Glass icon buttons. It applies to sheet
toolbars only — pushed pages and tab roots keep the platform's standard text actions.

## CTA + network — never a silent wait

The rule and its rationale live in
[swiftui-best-practices.md](swiftui-best-practices.md#a-cta-that-fires-a-network-call-never-waits-in-silence).
Here is what implements it in this app:

| Shape | This app |
|-------|----------|
| Inline spinner in the button | `ActionIcon` (`Shared/Components/ActionIcon.swift`), fed by `ErrorPresenter.isRunning` (`Shared/ErrorPresenter.swift`) whenever the action already runs through `error.run { }` |
| Full-bleed loader for long/AI work | `AIThinkingCard` (`Shared/Components/AIThinkingIndicator.swift`) — every Gemini wait (import analysis, iteration proposal) |
| Optimistic + background for one-way actions | `LibraryStore.delete(recipeId:)` — the recipe sheet closes at once, the mutation follows, a failure goes to Sentry via `reportError` and the reload puts the row back |

```swift
Button {
    Task { await error.run { try await RecipeAPI.updateRecipe(id: id, title: title) } }
} label: {
    ActionIcon(systemImage: "checkmark", isRunning: error.isRunning)
}
.disabled(error.isRunning)
```

## Previews as a Storybook + DebugGallery

Every component below page level **must** preview without a running server, fed by
`Shared/PreviewFixtures.swift` (`Fixtures`).

```swift
#Preview("Cuisine") {
    HomePage(library: Fixtures.libraryRecipes, libraryLoading: false,
             libraryHasMore: false, onSettings: {})
}
```

`Shared/DebugGallery.swift` (wrapped in `#if DEBUG`) renders any page with fixtures and no
server/auth. `ShuhariApp` branches into it when the `gallery` UserDefault / `-gallery <screen>`
launch argument is set (screens: `home`, `cuisine`, `recipe`, `recipe-tmx`, `history`, `attempt`,
`execute`, `execute-tmx`, `capture`, `proposal`, `import-preview`, `import-preview-tmx`,
`ai-thinking`, `root`).

**After finishing any iOS task, launch the result in the simulator on your own** — never ask
first. Once the code compiles: boot the simulator (iPhone 17, OS 26.2), install, then launch
straight into the affected screen with the gallery launch argument and screenshot it to verify
the change visually before reporting:

```bash
xcrun simctl launch booted com.polyforms.shuhari.app -gallery recipe
```

If the touched screen has no `switch` case in `Shared/DebugGallery.swift` yet, add one. This is
distinct from installing on the physical iPhone, which always requires an explicit yes (see
[CLAUDE.md](../CLAUDE.md#ios-physical-device-install)).

## Hide empty sections

A `Section` (Form or detail list) with no data must not be rendered at all — no empty-state
text, no placeholder, no "Ajouter" affordance. Guard every optional section:

```swift
if !items.isEmpty {
  Section("Ingrédients") { … }
}
```

An empty section reads as broken. Applies everywhere sections render data-driven **read-only**
content — the cooking import preview (Ingrédients), recipe display (`CurrentVersionSection`, …).
Hide, don't stub. A **form** is the exception: `CoffeeParametersForm` shows every field, filled or
not, because there what is missing is exactly what the cook has to see.

## The coffee sheet — parameters, not ingredients

A coffee has no ingredient list: `CoffeeParametersSection` takes the place of
`IngredientsSection` on `RecipeDetailPage`. Five blocks — Café (with
`"12 juin 2026 · J+14"`, the roast date and how long the beans rested), Eau, Extraction, Lait,
Matériel — each disappearing entirely when nothing in it is filled in, per the rule above.

A coffee has **no steps at all** — it is a set of dials, not a sequence of gestures — so no step
section ever renders on one.

The section stays primitive-first; the domain → primitives adapter is a convenience initializer
in the same file (`init(parameters:restDays:big:)`), so no two screens word a date differently.

**Writing a coffee goes through one form.** `CoffeeParametersForm` (+ its `CoffeeParametersDraft`)
is the single shape of a coffee being typed, used by the three moments one is written: the
correction sheet (`CoffeeParametersEditSheet`), the import preview (`CoffeeImportPreviewPage`) and
the AI proposal (`CoffeeProposalPage`). It always shows every field; it pre-fills machine and
grinder from what was used most recently; it opens the milk block on a milk drink; and given a
`changedFrom`, it marks each moved value with the proposal's changed dot. DebugGallery:
`import-preview-coffee`, `import-preview-coffee-empty`, `import-preview-coffee-milk`,
`proposal-coffee`, `coffee-parameters-edit`.

Every row goes through the form's own `row(_:alignment:)`, which owns the changed dot's gutter:
present on all rows of a proposal, absent from all rows everywhere else, per
[the shared leading edge](swiftui-best-practices.md#every-row-of-a-form-shares-one-leading-edge).
Nothing in the form draws that column itself.

The header capsule on a coffee says **how it is brewed** (ESPRESSO, V60, FRENCH PRESS) instead of
the recipe type: the type is given away by the tab the recipe lives in, the method is what
identifies it. `RecipeHeaderBadges(methodLabel:methodIcon:)` — nil on anything else.

A coffee also has **no portion slider**: `IngredientScaling` has no list to multiply. Doubling a
dose is an edit of the parameters.

### Correcting the note

`RecipeEditSheet` (recipe menu → « Modifier ») edits the recipe's title and the axis it is filed
on, plus one thing that belongs to the *version* on screen: its note, section-titled « Note de la
version *n* » so it is clear which one is being re-rated. The stars are the same `StarRating` the
capture page uses. The sheet's single Save runs `updateRecipe`, then `updateRating` only when the
cook moved the note — a rating that did not change costs no call.

A version never rated shows empty stars: rating it there is the one way to log a cook after the
fact, and the server then treats it as cooked (see
[business-rules](business-rules.md#lineage-and-attempts)).

### Correcting the parameters

`CoffeeParametersEditSheet` (recipe menu → « Modifier les paramètres », coffee only) rewrites the
displayed version's parameters **in place**: no version is created and the brewing steps are
untouched — correcting what was logged is not iterating.

Every field is labelled with `LabeledContent`, value on the trailing edge, mirroring the read-only
sheet: a placeholder disappears exactly when a form of fifteen fields needs it. Two facts get a
`Toggle` rather than an empty field, because their absence is information a blank cannot express —
« Date de torréfaction connue » (a `DatePicker` always shows *some* date) and « Boisson lactée » (a
drink either has milk or has not).

**A roast date already known is shown, never asked.** The date toggle only exists to declare one
nobody read, so it renders only on a coffee that arrived without a date — a coffee whose date the
import or the previous version carries goes straight to its `DatePicker`. The form reads that at
open and holds it (`roastDateWasRead`): flipping the toggle on must never remove the way back to
« inconnue ».

**Quantities carry a stepper**, the four fields that hold a mass — Dose, Quantité (eau), En tasse,
Quantité (lait): a dose is a dial the cook nudges far more often than a number they retype. Steps
are the ones the hand makes — 0,5 g on a dose, 1 g in the cup, 10 g on a pour — the leading number
moves and the unit is kept as typed, a field with no number yet starts at one step of its own unit,
and nothing goes below zero. Wiring per
[`Stepper` — its label is not a tap target](swiftui-best-practices.md#stepper--its-label-is-not-a-tap-target).
Température, Temps and Mouture stay free text: they are not masses, and « Niveau 12 » is a setting
of one grinder, not a quantity.

Free-text fields use `SuggestingTextField`: chips of what the cook has already typed, shown only
while the field holds the keyboard, hiding an exact match (a button that would do nothing). Typing
anything new is always allowed — it is what teaches the next suggestion. The list comes from the
`coffeeVocabulary` query, loaded when the sheet is opened so the sheet is not what waits on the
network; machine and grinder fall back to the closest earlier version that carried any.

## The oven section — `Features/Oven/`

A cooked version that bakes carries an `OvenProfile`, and the recipe sheet renders it as its own
section under the steps: mode, temperature, then how the cooking ends. **A probe replaces the
timer rather than joining it** — a probe cook shows "Sonde 63 °C" and no "Durée" row at all, so
what ends the cooking is never ambiguous.

`OvenProfileSection` is primitive-first with a nested `Item` (five parameters): it receives
strings already written in French ("180 °C", "25 min") and an SF Symbol name. The page formats;
the section lays out. `OvenProgram` carries its own French label and icon, exactly as `BrewMethod`
and `DishCategory` do.

**A dish that never bakes renders nothing** — no empty section, no "Aucun four" row. The absence
of a profile is the information, the same rule the coffee blocks follow.

### Editing it

`OvenProfileEditSheet` wraps `OvenProfileForm` and saves through `updateOvenProfile` — **in
place, no version created**, exactly as `updateCoffeeParameters` corrects a coffee. Correcting a
temperature you read wrong is not an iteration on the recipe.

The form's first row is a **"Cuisson au four" toggle**, and turning it off is a real answer: it
saves `nil`, which clears the profile. That is why the editor is also reachable from the more menu
and not only from the section's "Modifier" — a dish that bakes for the first time has no section
to edit from yet.

**"Copier les réglages du four" is how a profile gets filled in fast.** The API exposes no dish
catalogue — heating functions and dials only, never the "Quiche" the appliance's screen offers —
so the prefill comes from the appliance's *current dials* instead: you set the cooking up on the
oven itself, its own assisted programmes included, and one tap has the recipe remember it. The
button's footer names what it will copy before it copies it, and the row disappears when the oven
says too little to make a profile (a heating function and a temperature are the minimum).

The copy is total: dials the oven does not report are **cleared**, not kept, so what you end up
with is what the oven says rather than a mixture of two sources.

**The copy lives in the editor and nowhere else.** The recipe sheet's oven section carries the
settings, "Modifier" and the start CTA — writing a profile is what the editor is for, and a second
entry point on the sheet only made the same gesture reachable twice.

`assisted` is never offered by the picker (`OvenProgram.selectable` drops it): it is not a dial
anyone turns, it only ever arrives by copying what the oven is set to. Picking it by hand would
build a programme with no code behind it, which starts nothing. It joins the list only on a draft
that already carries one, so the row can show what is selected.

The picker lists every function the notebook knows, including ones a given oven lacks — writing
down "Pizza 250 °C" is legitimate even on an oven that cannot run it. Starting it then answers
`PROGRAM_UNSUPPORTED`, which says so; the alternative, hiding the function, would make the
notebook lie about the recipe.

### Starting the cooking

`OvenViewModel` loads `Query.oven` alongside the recipe. **A nil state means this account owns no
oven, and the CTA is then absent entirely** — not disabled, not greyed: an account without an oven
is a smaller app, not a broken one. An oven that is merely offline or refusing remote operation
still shows the button, because pressing it is how the cook learns *why*.

The CTA obeys the "a CTA that hits the network shows it" rule (`ActionIcon` spinner), and it is
never one tap from a heating element: a `confirmationDialog` repeats the exact settings being
sent. While the oven reports a cooking under way, the CTA is replaced by "Cuisson en cours ·
12 min" — a second cooking is never offered.

The refusals are turned into sentences in `APIError.errorDescription`, next to `QUOTA_EXHAUSTED`,
not in the view model. `REMOTE_CONTROL_DISABLED` is the one a cook meets most often and the only
one they can act on, so it names the path: *Réglages → Connexions*.

## Error reporting — Sentry

`ShuhariApp.init()` calls `SentrySDK.start` (right after `FirebaseApp.configure()`) with a
hardcoded DSN — a Sentry DSN is public by design. A blank/placeholder DSN leaves the SDK inert
(same "no-op on empty DSN" behaviour as the backend plugin). The app reports to the
`shuhari-ios` project of the `polyforms` organisation; the backend has its own project
(`shuhari-server`, DSN passed as the `SENTRY_DSN` repository secret) so a crash in the kitchen
is never mixed up with a fault in the API. `Shared/ErrorReporting.swift`'s
`reportError(_:)` does `SentrySDK.capture(error:)` and returns the display message; the 10+
call sites in ViewModels are unchanged.

## Auth — Firebase + Sign in with Apple

Wired in `Features/Auth/` plus `FirebaseApp.configure()` in `ShuhariApp.init()` (no `AppDelegate`):

- `AuthRoot.swift` — top gate: `LoginView` when signed out, else `ContentView`; injects
  `AuthSession` into the environment.
- `AuthSession.swift` — `@MainActor @Observable` wrapper over Firebase's
  `addStateDidChangeListener`; exposes `user` and `signOut()`.
- `LoginView.swift` — `SignInWithAppleButton`; exchanges the Apple identity token for a Firebase
  credential (`OAuthProvider.appleCredential`), then `Auth.auth().signIn`.
- `AppleNonce.swift` — nonce `random()` + `sha256()` (CryptoKit).
- `Shared/FirebaseTokenInterceptor.swift` — adds `Authorization: Bearer <ID token>` to every
  Apollo request.

## Secrets Setup

The standard GraphQL API authenticates via the Firebase ID token, so no static secret is needed to
run the app. `Shared/Secrets.swift` (gitignored) only holds an optional admin-scoped token; copy the
template on first checkout:

```bash
cp ios/Shuhari/Shared/Secrets.swift.example ios/Shuhari/Shared/Secrets.swift
```

The Sentry DSN is public by design and hardcoded (not a secret). UI tests keep their own
`ShuhariUITests/Support/TestSecrets.swift` (copied from `.example` the same way).

## Model Types

Model structs are `Sendable` (Swift 6). They are what ViewModels and views consume — never the
generated types.

```swift
struct RecipeVersion: Identifiable, Sendable {
    let number: Int
    let change: String?          // what this iteration changed vs. the version it is based on
    let ingredients: [Ingredient]
    let steps: [String]
    let recipeId: String
    // The attempt outcome, recorded directly on the version — nil while never cooked.
    let rating: Int?             // 1..5
    let remarks: String?
    let executedAt: Date?
    let photoUrl: String?
    var id: Int { number }
    var tried: Bool { executedAt != nil }
}
```

## Apollo Codegen

Config: `ios/apollo-codegen-config.json`.

- `schemaNamespace: "ShuhariGraphQL"`
- schema source: `../shared/schema.graphql` (shared with the backend)
- operation search paths: `Shuhari/Features/<Feature>/GraphQL/*.graphql` (hand-written per feature)
- output: `Shuhari/Generated/GraphQL`, `moduleType: embeddedInTarget "Shuhari"`

Regenerate after the SDL changes:

```bash
bun run generate:graphql            # backend: regenerate shared/schema.graphql
bun run generate:ios                # iOS: regenerate Generated/GraphQL
```

## UI Testing — Page Object pattern

`ShuhariUITests/` holds `Tests/` (`ScreenshotTest`, `AttemptLoopFlowTest`, `ImportFlowTest`),
`Pages/` (page objects), and `Support/`.

`BaseUITest` resets the DB before/after and launches with
`-serverURLDev http://localhost:3000 -serverMode dev -UITestPhoto`, adding
`XCUIElement.waitOrFail`/`tapOrFail`. Page objects are `@MainActor struct`s wrapping
`XCUIApplication`, keyed on accessibility identifiers, returning the next page for chaining:

```swift
@MainActor struct HomePage {
    let app: XCUIApplication
    func openRecipe(_ title: String) throws -> RecipeDetailPage { … }
    func openSettings() throws { try app.buttons["home-settings-button"].tapOrFail() }
}
```

`Support/TestAPIClient` is a small REST client used **only** against the test server's helper
endpoints (`/test/reset`, `/test/seed-recipe`) — production data flow stays 100% GraphQL.

## Build

```bash
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild \
  -project ios/Shuhari.xcodeproj -scheme Shuhari \
  -destination 'platform=iOS Simulator,name=iPhone 17,OS=26.2' build
```

`DEVELOPER_DIR` is required because `xcode-select` points at CommandLineTools.
