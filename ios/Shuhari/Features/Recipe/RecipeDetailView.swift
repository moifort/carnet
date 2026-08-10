import SwiftUI

/// Coordinator for the recipe sheet: loads the recipe, wires the execute cover
/// (through the binding owned by `HomeView`), the rename sheet, and deletion.
struct RecipeDetailView: View {
    let recipeId: String
    /// When set, the recipe sheet focuses this version (the attempt view): orange banner +
    /// per-row change dots. Nil renders the plain recipe sheet.
    let focusVersionNumber: Int?
    /// The flow's one recipe state — shared with the screens this one pushes and with
    /// the two sheets it opens, so a version picked here opens on what is already read
    /// and a reload after a mutation reaches every one of them.
    let store: RecipeStore
    @Binding var path: NavigationPath
    let onReload: () -> Void
    /// Hands the deletion to the library, which drops the row and runs the call in the
    /// background — this screen closes without waiting for it.
    let onDelete: (String) -> Void
    /// Same one-way pattern for a single version: the library carries the call (and
    /// reports its failure) while the recipe flow closes without waiting.
    let onDeleteVersion: (String, Int) -> Void

    @State private var showEdit = false
    /// The coffee-parameters form, and the suggestions it offers — loaded when the
    /// sheet opens, so the sheet is not what waits on the network.
    @State private var showCoffeeParameters = false
    @State private var showOvenProfile = false
    /// The connected oven's own dish catalogue, offered as a prefill in the
    /// profile editor. Stays empty when no oven is connected, which simply hides
    /// the prefill — the editor works the same without it.
    @State private var assistedProfiles: [AssistedProfile] = []
    /// The connected oven. Loaded once with the recipe; nil state means this
    /// account owns none, and no oven CTA is rendered at all.
    @State private var oven = OvenViewModel()
    @State private var coffeeVocabulary = CoffeeVocabulary.empty
    @State private var showWarnings = false
    @State private var showHistory = false
    @State private var showToTest = false
    @State private var recordRequest: ExecutionRequest?
    @State private var showDeleteConfirm = false
    /// The version picked in the history / to-cook sheet, opened once that sheet has
    /// finished closing (see `openPickedVersion`).
    @State private var pickedVersion: Int?
    @State private var favoriteError = ErrorPresenter()

    init(
        recipeId: String,
        focusVersionNumber: Int? = nil,
        store: RecipeStore,
        path: Binding<NavigationPath>,
        onReload: @escaping () -> Void,
        onDelete: @escaping (String) -> Void,
        onDeleteVersion: @escaping (String, Int) -> Void
    ) {
        self.recipeId = recipeId
        self.focusVersionNumber = focusVersionNumber
        self.store = store
        self._path = path
        self.onReload = onReload
        self.onDelete = onDelete
        self.onDeleteVersion = onDeleteVersion
    }

    /// Preview/gallery initializer: renders the full coordinator — action bar and
    /// sheets included — from a fixture recipe, with no network. The store is the
    /// gallery's own, seeded with that fixture.
    init(
        previewRecipe: Recipe,
        store: RecipeStore,
        path: Binding<NavigationPath>,
        onReload: @escaping () -> Void = {},
        onDelete: @escaping (String) -> Void = { _ in },
        onDeleteVersion: @escaping (String, Int) -> Void = { _, _ in },
        focusVersionNumber: Int? = nil,
        startOnDeleteConfirm: Bool = false
    ) {
        self.recipeId = previewRecipe.id
        self.focusVersionNumber = focusVersionNumber
        self.store = store
        self._path = path
        self.onReload = onReload
        self.onDelete = onDelete
        self.onDeleteVersion = onDeleteVersion
        self._showDeleteConfirm = State(initialValue: startOnDeleteConfirm)
    }

    var body: some View {
        Group {
            if let recipe = store.recipe(recipeId) {
                detailPage(recipe: recipe)
                .toolbar { toolbar(recipe: recipe) }
                // The recipe sheet is a focused, Photos-style detail: hide the tab bar so the
                // floating action bar owns the bottom edge.
                .toolbar(.hidden, for: .tabBar)
                // The one flow the play CTA opens, as a sheet: the capture form at
                // 70%, growing to .large for whichever AI proposal it asked for.
                .sheet(item: $recordRequest) { request in
                    ExecuteFlowView(request: request) {
                        onReload()
                        Task { await store.load(recipeId) }
                    }
                }
                // Picking a version closes the history and opens that version's
                // recipe sheet in this stack — the sheet never pushes it itself.
                .sheet(isPresented: $showHistory, onDismiss: openPickedVersion) {
                    HistorySheet(recipe: recipe) { versionNumber in
                        pickedVersion = versionNumber
                        showHistory = false
                    }
                }
                // The to-cook list: picking a version closes it and opens that
                // version's recipe sheet, exactly like the history does.
                .sheet(isPresented: $showToTest, onDismiss: openPickedVersion) {
                    ToTestSheet(versions: recipe.versionsToTest) { versionNumber in
                        pickedVersion = versionNumber
                        showToTest = false
                    }
                }
                // The warnings sheet: rewrite the recipe's cautions in place —
                // recipe-level, so no version is created; an emptied list clears
                // the banner.
                .sheet(isPresented: $showWarnings) {
                    WarningsEditSheet(initialWarnings: recipe.warnings) { warnings in
                        try await RecipeAPI.updateWarnings(id: recipeId, warnings: warnings)
                        await store.load(recipeId)
                        onReload()
                    }
                }
                // Correcting the parameters of the displayed coffee version: in
                // place, no version created, the steps untouched.
                .sheet(isPresented: $showCoffeeParameters) {
                    let version = displayedVersion(recipe)
                    CoffeeParametersEditSheet(
                        initial: version.content.coffeeParameters ?? .empty,
                        vocabulary: coffeeVocabulary,
                        previousGear: previousGear(recipe, before: version)
                    ) { parameters in
                        try await RecipeAPI.updateCoffeeParameters(
                            recipeId: recipeId,
                            versionNumber: version.number,
                            parameters: parameters
                        )
                        await store.load(recipeId)
                        onReload()
                    }
                }
                // Correcting the oven settings of the displayed version: in place,
                // no version created, the steps untouched — and turning the toggle
                // off says the dish never bakes, which clears the profile.
                .sheet(isPresented: $showOvenProfile) {
                    let version = displayedVersion(recipe)
                    OvenProfileEditSheet(
                        initial: version.content.oven,
                        assisted: assistedProfiles
                    ) { oven in
                        try await RecipeAPI.updateOvenProfile(
                            recipeId: recipeId,
                            versionNumber: version.number,
                            oven: oven
                        )
                        await store.load(recipeId)
                        onReload()
                    }
                }
                .sheet(isPresented: $showEdit) {
                    let version = displayedVersion(recipe)
                    RecipeEditSheet(
                        initialTitle: recipe.title,
                        initialCategory: recipe.category,
                        initialMethod: recipe.method,
                        versionNumber: version.number,
                        initialRating: version.rating
                    ) { title, category, method, rating in
                        try await RecipeAPI.updateRecipe(
                            id: recipeId,
                            title: title,
                            category: category,
                            method: method
                        )
                        // The note lives on the version, not on the recipe, so it
                        // travels in its own call — and only when the cook moved it.
                        if let rating, rating != version.rating {
                            try await RecipeAPI.updateRating(
                                recipeId: recipeId,
                                versionNumber: version.number,
                                rating: rating
                            )
                        }
                        await store.load(recipeId)
                        // The library behind carries the new name and re-files the row
                        // under its new course.
                        onReload()
                    }
                }
                // No title nor message: the two destructive labels say it all.
                .alert("", isPresented: $showDeleteConfirm) {
                    Button("Supprimer la version \(displayedVersion(recipe).number)", role: .destructive) {
                        deleteDisplayedVersion(recipe)
                    }
                    .accessibilityIdentifier("confirm-delete-version")
                    Button(deleteRecipeLabel(recipe), role: .destructive) {
                        deleteRecipe()
                    }
                    .accessibilityIdentifier("confirm-delete-recipe")
                    Button("Annuler", role: .cancel) {}
                }
            } else if let error = store.error(recipeId) {
                ContentUnavailableView("Erreur", systemImage: "exclamationmark.triangle", description: Text(error))
            } else {
                ProgressView()
            }
        }
        .errorAlert(favoriteError)
        // Read on every appearance, never only on the first: what the flow already
        // knows is drawn at once — a version picked in a sheet opens on it instead of
        // on a spinner — and this only corrects it.
        .task { await store.load(recipeId) }
        // The appliance is asked once, alongside the recipe. No oven simply means
        // no CTA — never an error on a screen where nothing went wrong.
        .task { await oven.load() }
        .errorAlert(oven.error)
    }

    /// The recipe sheet, focused on a version when `focusVersionNumber` is set (attempt
    /// view: orange banner + per-row change dots vs the previous version), or the
    /// plain best-rated recipe sheet otherwise.
    @ViewBuilder
    private func detailPage(recipe: Recipe) -> some View {
        if let number = focusVersionNumber, let focus = recipe.version(number) {
            // The attempt-diff base is the version this one was built on (`basedOn`),
            // not simply the previous number — a version can iterate on any ancestor.
            let previous = focus.basedOn.flatMap { recipe.version($0) }
            RecipeDetailPage(
                recipe: recipe,
                focusVersion: focus,
                modifiedIngredients: modifiedIngredients(focus, previous: previous),
                modifiedSteps: modifiedSteps(focus, previous: previous),
                change: focus.change,
                why: focus.why ?? focus.originDetail,
                onEditOven: openOvenEditor,
                ovenStart: ovenStart(recipe)
            )
        } else {
            RecipeDetailPage(
                recipe: recipe,
                onEditOven: openOvenEditor,
                ovenStart: ovenStart(recipe)
            )
        }
    }

    /// What the oven section offers, or nil when this account owns no oven — the
    /// settings then read as plain notes, which is what they were before an oven
    /// was ever connected.
    private func ovenStart(_ recipe: Recipe) -> OvenProfileSection.Start? {
        guard oven.isAvailable else { return nil }
        let version = displayedVersion(recipe)
        return OvenProfileSection.Start(
            running: runningLabel,
            isStarting: oven.isStarting,
            onStart: {
                Task { await oven.start(recipeId: recipeId, version: version.number) }
            }
        )
    }

    /// What the oven is already doing, written out. The remaining minutes ride
    /// along when the oven counts them; a probe cook has none to report.
    private var runningLabel: String? {
        guard let running = oven.state?.running else { return nil }
        guard let remaining = running.remaining else { return "Cuisson en cours" }
        return "Cuisson en cours · \(remaining) min"
    }

    /// Open the oven-profile editor, fetching the appliance's own catalogue as it
    /// opens. The fetch is fire-and-forget: no oven, or an oven that does not
    /// answer, simply means no prefill — the editor never waits on the appliance.
    private func openOvenEditor() {
        Task { assistedProfiles = (try? await OvenAPI.state())?.assisted ?? [] }
        showOvenProfile = true
    }

    /// Ingredient names present in `version` but absent (by name + quantity) from
    /// `previous` — the rows that changed. No previous version → nothing changed.
    private func modifiedIngredients(_ version: RecipeVersion, previous: RecipeVersion?) -> Set<String> {
        guard let previous else { return [] }
        return Set(
            version.ingredients
                .filter { ingredient in
                    !previous.ingredients.contains { $0.name == ingredient.name && $0.quantity == ingredient.quantity }
                }
                .map(\.name)
        )
    }

    /// Step indices absent from `previous` — the rows that changed. A step matches
    /// on its text AND its machine settings, exactly as the proposal screen marks
    /// its own rows: a Thermomix step retimed or reheated changes without a word of
    /// its text moving. No previous version → nothing changed.
    private func modifiedSteps(_ version: RecipeVersion, previous: RecipeVersion?) -> Set<Int> {
        guard let previous else { return [] }
        let previousSteps = previous.content.stepsWithSettings
        return Set(
            version.content.stepsWithSettings.enumerated()
                .filter { !previousSteps.contains($0.element) }
                .map(\.offset)
        )
    }

    @ToolbarContentBuilder
    private func toolbar(recipe: Recipe) -> some ToolbarContent {
        // Top-right: the favourite toggle, then the more menu — with a spacer between
        // them so the two read as separate controls on Liquid Glass instead of merging
        // into one capsule.
        ToolbarItem(placement: .topBarTrailing) {
            Button {
                Task { await toggleFavorite(recipe) }
            } label: {
                ActionIcon(
                    systemImage: recipe.favorite ? "heart.fill" : "heart",
                    isRunning: favoriteError.isRunning
                )
            }
            .tint(recipe.favorite ? Theme.Status.favorite : .primary)
            .disabled(favoriteError.isRunning)
            .accessibilityIdentifier("favorite-recipe-button")
            .accessibilityLabel(recipe.favorite ? "Retirer des favoris" : "Ajouter aux favoris")
        }
        ToolbarSpacer(.fixed, placement: .topBarTrailing)

        // Top-right: the more menu (edit / warnings / delete).
        ToolbarItem(placement: .topBarTrailing) {
            Menu {
                Button("Modifier", systemImage: "pencil") { showEdit = true }
                if recipe.type == .coffee {
                    Button("Modifier les paramètres", systemImage: "slider.horizontal.3") {
                        Task { coffeeVocabulary = (try? await RecipeAPI.coffeeVocabulary()) ?? .empty }
                        showCoffeeParameters = true
                    }
                    .accessibilityIdentifier("edit-coffee-parameters-button")
                }
                // Cooking only — a coffee is brewed. In the menu as well as on the
                // section, because a dish that bakes for the first time has no
                // section yet to edit from.
                if recipe.type != .coffee {
                    Button("Réglages du four", systemImage: "oven") { openOvenEditor() }
                        .accessibilityIdentifier("edit-oven-profile-button")
                }
                Button(
                    recipe.warnings.isEmpty ? "Ajouter un avertissement" : "Modifier les avertissements",
                    systemImage: "exclamationmark.triangle"
                ) { showWarnings = true }
                    .accessibilityIdentifier("edit-warnings-button")
                Button("Supprimer", systemImage: "trash", role: .destructive) { showDeleteConfirm = true }
                    .accessibilityIdentifier("delete-recipe-button")
            } label: {
                Image(systemName: "ellipsis")
            }
            .accessibilityIdentifier("recipe-menu")
        }

        // Floating glass action bar, in two capsules: what you say about this version
        // on the left — one CTA, one sheet, where the note, the remark and the tips
        // are collected together and what is filled decides what happens — and what
        // you browse on the right (the versions to cook, then all of them). Any
        // version is cookable and an attempt is overwritable, so the CTA is always
        // available and targets the displayed version.
        ToolbarItem(placement: .bottomBar) {
            Button {
                presentRecordAttempt(versionNumber: displayedVersion(recipe).number)
            } label: {
                Image(systemName: "play")
            }
            .accessibilityIdentifier("record-attempt-button")
            .accessibilityLabel("Noter, améliorer ou conseiller")
        }
        ToolbarSpacer(.flexible, placement: .bottomBar)
        ToolbarItem(placement: .bottomBar) {
            Button {
                showToTest = true
            } label: {
                Image(systemName: "flask")
                    // A dot on the flask while versions are waiting to be cooked.
                    .overlay(alignment: .topTrailing) {
                        if !recipe.versionsToTest.isEmpty {
                            Circle()
                                .fill(Theme.Status.attempt)
                                .frame(width: 7, height: 7)
                                .offset(x: 5, y: -3)
                        }
                    }
            }
            .accessibilityIdentifier("to-test-button")
            .accessibilityLabel(
                recipe.versionsToTest.isEmpty
                    ? "Versions à tester"
                    : "Versions à tester, \(recipe.versionsToTest.count) en attente"
            )
        }
        ToolbarItem(placement: .bottomBar) {
            Button {
                showHistory = true
            } label: {
                Image(systemName: "clock.arrow.circlepath")
            }
            .accessibilityIdentifier("all-versions-button")
            .accessibilityLabel("Toutes les versions")
        }
    }

    /// The version the recipe sheet presents (and the record CTA targets): the focused
    /// attempt version when set, otherwise the recipe's `versionToOpen`.
    private func displayedVersion(_ recipe: Recipe) -> RecipeVersion {
        focusVersionNumber.flatMap { recipe.version($0) } ?? recipe.versionToOpen
    }

    /// The gear of the closest earlier version that carried any — what pre-fills
    /// the two fields on a version that has none. It is almost always the same
    /// machine and the same grinder, and re-asking for them is how a field stops
    /// being filled in at all.
    private func previousGear(_ recipe: Recipe, before version: RecipeVersion) -> CoffeeGear {
        recipe.versions
            .filter { $0.number < version.number }
            .sorted { $0.number > $1.number }
            .compactMap { $0.content.coffeeParameters?.gear }
            .first { !$0.isEmpty } ?? .empty
    }

    private func deleteRecipeLabel(_ recipe: Recipe) -> String {
        let count = recipe.versions.count
        return "Supprimer la recette (\(count) version\(count > 1 ? "s" : ""))"
    }

    /// One-way action: leave immediately, the library drops the row and carries the
    /// call — nothing to wait for here.
    private func deleteRecipe() {
        onDelete(recipeId)
        // What the flow knew of it goes with it: the deletion is carried in the
        // background, and a recipe re-opened before it lands must not be drawn from
        // the copy that still holds it.
        store.forget(recipeId)
        if !path.isEmpty { path.removeLast() }
    }

    /// Delete the displayed version and close the whole recipe flow — the screens
    /// underneath were built on data this deletion just rewrote. The library carries
    /// the call, same one-way pattern as the recipe.
    private func deleteDisplayedVersion(_ recipe: Recipe) {
        // The sole version has no separate fate: deleting it is deleting the recipe.
        guard recipe.versions.count > 1 else {
            deleteRecipe()
            return
        }
        onDeleteVersion(recipeId, displayedVersion(recipe).number)
        store.forget(recipeId)
        if !path.isEmpty { path.removeLast(path.count) }
    }

    /// Open the version picked in a sheet, once that sheet is fully dismissed.
    /// Pushing while it is still closing loses the entry underneath: the version
    /// opens, but the back button then jumps straight back to the library instead of
    /// returning to the recipe it was picked from.
    private func openPickedVersion() {
        guard let number = pickedVersion else { return }
        pickedVersion = nil
        path.append(RecipeRoute.attempt(recipeId: recipeId, versionNumber: number))
    }

    /// Flip the favourite and reload — the sheet redraws its heart, and the library
    /// behind refreshes so the favourites lens gains or loses the recipe.
    private func toggleFavorite(_ recipe: Recipe) async {
        await favoriteError.run {
            try await RecipeAPI.updateRecipe(id: recipeId, favorite: !recipe.favorite)
            // Reloading inside the run keeps the spinner up until the heart can
            // actually redraw in its new state.
            await store.load(recipeId)
        } onSuccess: {
            onReload()
        }
    }

    private func presentRecordAttempt(versionNumber: Int) {
        recordRequest = ExecutionRequest(recipeId: recipeId, versionNumber: versionNumber)
    }
}
