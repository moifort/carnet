import SwiftUI

/// Coordinator for the recipe sheet: loads the recipe, wires the execute cover
/// (through the binding owned by `HomeView`), the rename sheet, and deletion.
struct RecipeDetailView: View {
    let recipeId: String
    /// When set, the recipe sheet focuses this version (the attempt view): orange banner +
    /// per-row change dots. Nil renders the plain recipe sheet.
    let focusVersionNumber: Int?
    @Binding var path: NavigationPath
    let onReload: () -> Void
    /// Hands the deletion to the library, which drops the row and runs the call in the
    /// background — this screen closes without waiting for it.
    let onDelete: (String) -> Void
    /// Same one-way pattern for a single version: the library carries the call (and
    /// reports its failure) while the recipe flow closes without waiting.
    let onDeleteVersion: (String, Int) -> Void

    @State private var viewModel: RecipeViewModel
    @State private var showEdit = false
    /// The coffee-parameters form, and the suggestions it offers — loaded when the
    /// sheet opens, so the sheet is not what waits on the network.
    @State private var showCoffeeParameters = false
    @State private var coffeeVocabulary = CoffeeVocabulary.empty
    @State private var showWarnings = false
    @State private var showHistory = false
    @State private var showToTest = false
    @State private var showImprove = false
    @State private var showTips = false
    @State private var recordRequest: ExecutionRequest?
    @State private var showDeleteConfirm = false
    /// The version picked in the history / to-cook sheet, opened once that sheet has
    /// finished closing (see `openPickedVersion`).
    @State private var pickedVersion: Int?
    @State private var favoriteError = ErrorPresenter()

    init(
        recipeId: String,
        focusVersionNumber: Int? = nil,
        path: Binding<NavigationPath>,
        onReload: @escaping () -> Void,
        onDelete: @escaping (String) -> Void,
        onDeleteVersion: @escaping (String, Int) -> Void
    ) {
        self.recipeId = recipeId
        self.focusVersionNumber = focusVersionNumber
        self._path = path
        self.onReload = onReload
        self.onDelete = onDelete
        self.onDeleteVersion = onDeleteVersion
        self._viewModel = State(initialValue: RecipeViewModel(recipeId: recipeId))
    }

    /// Preview/gallery initializer: renders the full coordinator — action bar and
    /// sheets included — from a fixture recipe, with no network.
    init(
        previewRecipe: Recipe,
        path: Binding<NavigationPath>,
        onReload: @escaping () -> Void = {},
        onDelete: @escaping (String) -> Void = { _ in },
        onDeleteVersion: @escaping (String, Int) -> Void = { _, _ in },
        focusVersionNumber: Int? = nil,
        startOnDeleteConfirm: Bool = false
    ) {
        self.recipeId = previewRecipe.id
        self.focusVersionNumber = focusVersionNumber
        self._path = path
        self.onReload = onReload
        self.onDelete = onDelete
        self.onDeleteVersion = onDeleteVersion
        self._viewModel = State(initialValue: RecipeViewModel(previewRecipe: previewRecipe))
        self._showDeleteConfirm = State(initialValue: startOnDeleteConfirm)
    }

    var body: some View {
        Group {
            if let recipe = viewModel.recipe {
                detailPage(recipe: recipe)
                .toolbar { toolbar(recipe: recipe) }
                // The recipe sheet is a focused, Photos-style detail: hide the tab bar so the
                // floating action bar owns the bottom edge.
                .toolbar(.hidden, for: .tabBar)
                // The record-attempt flow as a half-screen sheet: capture at .medium,
                // grows to .large for the AI proposal.
                .sheet(item: $recordRequest) { request in
                    ExecuteFlowView(request: request) {
                        onReload()
                        Task { await viewModel.load() }
                    }
                }
                // Picking a version closes the history and opens that version's
                // recipe sheet in this stack — the sheet never pushes it itself.
                .sheet(isPresented: $showHistory, onDismiss: openPickedVersion) {
                    HistorySheet(recipeId: recipeId) { versionNumber in
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
                .sheet(isPresented: $showImprove) {
                    ImproveFlowView(
                        recipeId: recipeId,
                        version: displayedVersion(recipe),
                        nextVersionNumber: recipe.nextVersionNumber,
                        recipeTitle: recipe.title,
                        recipeType: recipe.type,
                        category: recipe.category
                    ) {
                        onReload()
                        Task { await viewModel.load() }
                    }
                }
                // The tips flow: reword and merge what the cook types into the
                // displayed version's own tips — rewritten in place, no version created.
                .sheet(isPresented: $showTips) {
                    TipsFlowView(recipeId: recipeId, version: displayedVersion(recipe)) {
                        onReload()
                        Task { await viewModel.load() }
                    }
                }
                // The warnings sheet: rewrite the recipe's cautions in place —
                // recipe-level, so no version is created; an emptied list clears
                // the banner.
                .sheet(isPresented: $showWarnings) {
                    WarningsEditSheet(initialWarnings: recipe.warnings) { warnings in
                        try await RecipeAPI.updateWarnings(id: recipeId, warnings: warnings)
                        await viewModel.load()
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
                        await viewModel.load()
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
                        await viewModel.load()
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
            } else if let error = viewModel.error {
                ContentUnavailableView("Erreur", systemImage: "exclamationmark.triangle", description: Text(error))
            } else {
                ProgressView()
            }
        }
        .errorAlert(favoriteError)
        .task { if viewModel.recipe == nil { await viewModel.load() } }
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
                why: focus.why ?? focus.originDetail
            )
        } else {
            RecipeDetailPage(recipe: recipe)
        }
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

        // Floating glass action bar, in two capsules: what you do to this version
        // (rate a cook, ask for an improvement) on the left, what you browse (the
        // versions to cook, then all of them) on the right. Any version is cookable
        // and an attempt is overwritable, so the record CTA is always available and
        // targets the displayed version.
        ToolbarItem(placement: .bottomBar) {
            Button {
                presentRecordAttempt(versionNumber: displayedVersion(recipe).number)
            } label: {
                Image(systemName: "pencil.and.ruler")
            }
            .accessibilityIdentifier("record-attempt-button")
            .accessibilityLabel("Noter un essai")
        }
        ToolbarItem(placement: .bottomBar) {
            Button {
                showImprove = true
            } label: {
                Image(systemName: "sparkles")
            }
            .accessibilityIdentifier("improve-recipe-button")
            .accessibilityLabel("Proposer une amélioration")
        }
        ToolbarItem(placement: .bottomBar) {
            Button {
                showTips = true
            } label: {
                Image(systemName: "lightbulb")
            }
            .accessibilityIdentifier("add-tips-button")
            .accessibilityLabel("Ajouter des conseils")
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
            await viewModel.load()
        } onSuccess: {
            onReload()
        }
    }

    private func presentRecordAttempt(versionNumber: Int) {
        recordRequest = ExecutionRequest(recipeId: recipeId, versionNumber: versionNumber)
    }
}
