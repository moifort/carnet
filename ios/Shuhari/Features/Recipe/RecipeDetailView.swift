import SwiftUI

/// Coordinator for the recipe sheet: loads the recipe, wires the execute cover
/// (through the binding owned by `HomeView`), the rename sheet, and deletion.
struct RecipeDetailView: View {
    let recipeId: String
    /// The weight this sheet was opened at: 1 from the library, the link's weight when
    /// it was reached from the recipe that uses it.
    var openedAt: Double = 1
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

    /// Whether the edit sheet is open — the one and only way this recipe is written
    /// to. The sheet behind it reads.
    @State private var showEdit = false
    /// The connected oven. Loaded once with the recipe; nil state means this
    /// account owns none, and no oven CTA is rendered at all.
    @State private var oven = OvenViewModel()
    /// What each free-text coffee field suggests — asked when the edit sheet is
    /// summoned on a coffee, so the sheet is not what waits on the network.
    @State private var coffeeVocabulary = CoffeeVocabulary.empty
    @State private var showHistory = false
    @State private var showToTest = false
    @State private var recordRequest: ExecutionRequest?
    @State private var showDeleteConfirm = false
    /// The copy prompt: the displayed version leaves for a recipe of its own, under
    /// the name typed here — seeded from the current one, because two rows spelled
    /// the same in the library are two rows nobody can tell apart.
    @State private var showCopyPrompt = false
    @State private var copyTitle = ""
    @State private var copyError = ErrorPresenter()
    /// The version the sheet shows — picked in the history or the to-cook list, which
    /// hand back a number and nothing else. Nil opens on the recipe's own
    /// `versionToOpen`. Picking swaps what this one screen displays instead of pushing
    /// another: browsing a lineage is reading one recipe, not walking into ten of them.
    @State private var selectedVersion: Int?
    /// The link sheet: present with no `editing` to link a new recipe, or with one to
    /// correct the weight of a link already posted.
    @State private var linkRequest: LinkRequest?

    /// What the link sheet opens on: nothing (pick a recipe, then its weight), or an
    /// existing link whose weight is being corrected.
    private struct LinkRequest: Identifiable {
        let editing: LinkRecipeSheet.Editing?
        var id: String { editing?.recipeId ?? "new" }
    }
    @State private var favoriteError = ErrorPresenter()
    @State private var linkError = ErrorPresenter()

    init(
        recipeId: String,
        openedAt: Double = 1,
        focusVersionNumber: Int? = nil,
        store: RecipeStore,
        path: Binding<NavigationPath>,
        onReload: @escaping () -> Void,
        onDelete: @escaping (String) -> Void,
        onDeleteVersion: @escaping (String, Int) -> Void
    ) {
        self.recipeId = recipeId
        self.openedAt = openedAt
        self.focusVersionNumber = focusVersionNumber
        self.store = store
        self._path = path
        self.onReload = onReload
        self.onDelete = onDelete
        self.onDeleteVersion = onDeleteVersion
        self._selectedVersion = State(initialValue: focusVersionNumber)
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
        startOnDeleteConfirm: Bool = false,
        startOnCopyPrompt: Bool = false
    ) {
        self.recipeId = previewRecipe.id
        self.focusVersionNumber = focusVersionNumber
        self.store = store
        self._path = path
        self.onReload = onReload
        self.onDelete = onDelete
        self.onDeleteVersion = onDeleteVersion
        self._showDeleteConfirm = State(initialValue: startOnDeleteConfirm)
        self._showCopyPrompt = State(initialValue: startOnCopyPrompt)
        self._copyTitle = State(initialValue: Self.suggestedCopyTitle(previewRecipe.title))
        self._selectedVersion = State(initialValue: focusVersionNumber)
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
                // Picking a version hands back its number: the sheet closes and this
                // screen redraws on that version, already loaded with the recipe.
                .sheet(isPresented: $showHistory) {
                    HistorySheet(recipe: recipe) { versionNumber in
                        selectedVersion = versionNumber
                        showHistory = false
                    }
                }
                // The to-cook list: picking a version shows it, exactly like the
                // history does.
                .sheet(isPresented: $showToTest) {
                    ToTestSheet(versions: recipe.versionsToTest) { versionNumber in
                        selectedVersion = versionNumber
                        showToTest = false
                    }
                }
                // Saying what this recipe is made of, and at what weight: an aggregate
                // write — no version created, no date moved.
                .sheet(item: $linkRequest) { request in
                    LinkRecipeSheet(
                        excludedId: recipeId,
                        linkedIds: Set(recipe.components.map(\.id)),
                        editing: request.editing
                    ) { picked, scale in
                        try await RecipeAPI.linkComponent(
                            recipeId: recipeId,
                            component: picked,
                            scale: scale
                        )
                        await store.load(recipeId)
                        onReload()
                    }
                }
                // The whole sheet, correctable in one place: title, course, note,
                // content, oven, cautions and tips. Nothing here creates a version —
                // correcting what the recipe always said is not iterating on it — and
                // only what the cook moved is written back.
                .sheet(isPresented: $showEdit) {
                    let version = displayedVersion(recipe)
                    let initial = RecipeDraft(
                        recipe: recipe,
                        version: version,
                        previousGear: previousGear(recipe, before: version)
                    )
                    RecipeEditSheet(
                        initial: initial,
                        versionNumber: version.number,
                        vocabulary: coffeeVocabulary,
                        applianceSettings: oven.state?.settings
                    ) { edited in
                        try await RecipeAPI.correct(
                            recipeId: recipeId,
                            versionNumber: version.number,
                            from: initial,
                            to: edited
                        )
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
                // The displayed version leaves for a recipe of its own, taking its
                // content, its tips, the recipe's cautions and its rating with it.
                // The recipe it came from is left exactly as it was.
                .alert("Nouvelle recette", isPresented: $showCopyPrompt) {
                    TextField("Nom de la recette", text: $copyTitle)
                        .accessibilityIdentifier("copy-version-title-field")
                    Button("Copier") { copyDisplayedVersion(recipe) }
                        .accessibilityIdentifier("confirm-copy-version")
                    Button("Annuler", role: .cancel) {}
                } message: {
                    Text("Copier la version \(displayedVersion(recipe).number) dans une recette à part ?")
                }
            } else if let error = store.error(recipeId) {
                ContentUnavailableView("Erreur", systemImage: "exclamationmark.triangle", description: Text(error))
            } else {
                ProgressView()
            }
        }
        .errorAlert(favoriteError)
        .errorAlert(copyError)
        .errorAlert(linkError)
        // Read on every appearance, never only on the first: what the flow already
        // knows is drawn at once — a version picked in a sheet opens on it instead of
        // on a spinner — and this only corrects it.
        .task { await store.load(recipeId) }
        // The appliance is asked alongside the recipe, then kept asked while the
        // sheet is open — it announces nothing on its own, so a cooking that has
        // just started, or one dialled in on the oven itself, only ever arrives on
        // the next read. No oven simply means no CTA — never an error on a screen
        // where nothing went wrong.
        .task {
            await oven.load()
            await oven.watch()
        }
        .errorAlert(oven.error)
    }

    /// The recipe sheet, focused on the selected version (attempt view: orange banner +
    /// per-row change dots vs the version it iterates on), or the plain best-rated
    /// recipe sheet when none was picked.
    @ViewBuilder
    private func detailPage(recipe: Recipe) -> some View {
        if let number = selectedVersion, let focus = recipe.version(number) {
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
                ovenStart: ovenStart(recipe),
                linkedRecipes: linkedItems(recipe),
                usedBy: usedByItems(recipe),
                onOpenRelated: { open(recipe, related: $0) },
                onEditWeight: { editWeight(recipe, of: $0) },
                onUnlink: { unlink($0) },
                openedAt: openedAt
            )
        } else {
            RecipeDetailPage(
                recipe: recipe,
                ovenStart: ovenStart(recipe),
                linkedRecipes: linkedItems(recipe),
                usedBy: usedByItems(recipe),
                onOpenRelated: { open(recipe, related: $0) },
                onEditWeight: { editWeight(recipe, of: $0) },
                onUnlink: { unlink($0) },
                openedAt: openedAt
            )
        }
    }

    // MARK: - Linked recipes

    /// The recipes this one is made of, flattened for the section. The summary is the
    /// first line of the linked recipe that can be resized, written at the weight it
    /// is used here — "Farine 100 g", what the cook actually puts in.
    private func linkedItems(_ recipe: Recipe) -> [LinkedRecipesSection.Item] {
        recipe.components.map { linked in
            let resized = linked.ingredients
                .first { QuantityScaling.isScalable($0.quantity) }
                .map { "\($0.name) \(QuantityScaling.scaled($0.quantity, by: linked.scale))" }
            return LinkedRecipesSection.Item(
                id: linked.id,
                title: linked.title,
                rating: linked.rating,
                summary: resized
            )
        }
    }

    private func usedByItems(_ recipe: Recipe) -> [UsedBySection.Item] {
        recipe.usedBy.map { .init(id: $0.id, title: $0.title, rating: $0.rating) }
    }

    /// Open a recipe on either side of a link: one this recipe is made of opens at the
    /// weight it was linked at, one made of this recipe opens at its own quantities.
    private func open(_ recipe: Recipe, related id: String) {
        let scale = recipe.components.first { $0.id == id }?.scale ?? 1
        path.append(RecipeRoute.recipe(id: id, scale: scale))
    }

    private func editWeight(_ recipe: Recipe, of id: String) {
        guard let linked = recipe.components.first(where: { $0.id == id }) else { return }
        linkRequest = LinkRequest(editing: .init(recipeId: id, scale: linked.scale))
    }

    /// Let go of a link. One-way like the deletions: the row goes, the call runs
    /// behind it, and a failure surfaces on the alert this screen already owns.
    private func unlink(_ id: String) {
        Task {
            await linkError.run {
                try await RecipeAPI.unlinkComponent(recipeId: recipeId, component: id)
                await store.load(recipeId)
            } onSuccess: {
                onReload()
            }
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

    /// Open the edit sheet. A coffee asks for its vocabulary on the way in — the
    /// suggestions each free-text field offers — and the sheet opens without waiting
    /// for it: an answer that lands late simply fills the menus behind. Nothing else
    /// is fetched, the oven included: the Electrolux API exposes heating functions
    /// and dials, never the dishes the oven's own screen offers.
    private func openEditor(_ recipe: Recipe) {
        if recipe.type == .coffee {
            Task { coffeeVocabulary = (try? await RecipeAPI.coffeeVocabulary()) ?? .empty }
        }
        showEdit = true
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
            // The heart is worn by the version on screen, not by the page: it marks
            // the attempt the cook would make again.
            let hearted = displayedVersion(recipe).favorite
            Button {
                Task { await toggleFavorite(recipe) }
            } label: {
                ActionIcon(
                    systemImage: hearted ? "heart.fill" : "heart",
                    isRunning: favoriteError.isRunning
                )
            }
            .tint(hearted ? Theme.Status.favorite : .primary)
            .disabled(favoriteError.isRunning)
            .accessibilityIdentifier("favorite-recipe-button")
            .accessibilityLabel(hearted ? "Retirer des favoris" : "Ajouter aux favoris")
        }
        ToolbarSpacer(.fixed, placement: .topBarTrailing)

        // Top-right: the more menu (edit / link / copy / delete).
        ToolbarItem(placement: .topBarTrailing) {
            Menu {
                // The one way in: everything the sheet shows is corrected there, and
                // nowhere else.
                Button("Modifier", systemImage: "pencil") { openEditor(recipe) }
                    .accessibilityIdentifier("edit-recipe-button")
                // What this recipe is made of: another recipe of the notebook, at the
                // weight it takes of it.
                Button("Lier une recette", systemImage: "link") {
                    linkRequest = LinkRequest(editing: nil)
                }
                .accessibilityIdentifier("link-recipe-button")
                // The way out of a lineage: this version has drifted too far to be
                // one more iteration, so it becomes a recipe on its own.
                Button("Copier en nouvelle recette", systemImage: "doc.on.doc") {
                    copyTitle = Self.suggestedCopyTitle(recipe.title)
                    showCopyPrompt = true
                }
                .accessibilityIdentifier("copy-version-button")
                Button("Supprimer", systemImage: "trash", role: .destructive) { showDeleteConfirm = true }
                    .accessibilityIdentifier("delete-recipe-button")
            } label: {
                ActionIcon(systemImage: "ellipsis", isRunning: copyError.isRunning)
            }
            .disabled(copyError.isRunning)
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

    /// The version the recipe sheet presents (and the record CTA targets): the one
    /// picked in a sheet, otherwise the recipe's `versionToOpen`. A number that no
    /// longer matches a version — the displayed one just deleted — falls back to it too.
    private func displayedVersion(_ recipe: Recipe) -> RecipeVersion {
        selectedVersion.flatMap { recipe.version($0) } ?? recipe.versionToOpen
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

    /// Delete the displayed version and close the recipe — what is on screen was built
    /// on a lineage this deletion just rewrote. The library carries the call, same
    /// one-way pattern as the recipe.
    private func deleteDisplayedVersion(_ recipe: Recipe) {
        // The sole version has no separate fate: deleting it is deleting the recipe.
        guard recipe.versions.count > 1 else {
            deleteRecipe()
            return
        }
        onDeleteVersion(recipeId, displayedVersion(recipe).number)
        store.forget(recipeId)
        if !path.isEmpty { path.removeLast() }
    }

    /// What the copy is named before the cook touches it: never the very same name,
    /// which would put two rows nobody can tell apart in the library.
    private static func suggestedCopyTitle(_ title: String) -> String {
        "\(title) (copie)"
    }

    /// Copy the displayed version into a recipe of its own, then open it on top of
    /// this one — the cook lands on what they just created, exactly as after an
    /// import. Unlike the deletion, this one is awaited: there is nothing to show
    /// until the server has given the new recipe its id.
    private func copyDisplayedVersion(_ recipe: Recipe) {
        let title = copyTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty else { return }
        let number = displayedVersion(recipe).number
        Task {
            await copyError.run {
                let copyId = try await RecipeAPI.copyVersion(
                    recipeId: recipeId,
                    number: number,
                    title: title
                )
                // The library behind gains the row, and the new recipe sheet opens
                // over the one it was copied from.
                onReload()
                path.append(RecipeRoute.recipe(id: copyId))
            }
        }
    }

    /// Flip the heart on the displayed version and reload — the sheet redraws it, and
    /// the library behind refreshes so the favourites lens gains or loses the recipe.
    /// The recipe stays in the lens as long as another version keeps its own heart.
    private func toggleFavorite(_ recipe: Recipe) async {
        let version = displayedVersion(recipe)
        await favoriteError.run {
            try await RecipeAPI.updateFavorite(
                id: recipeId,
                versionNumber: version.number,
                favorite: !version.favorite
            )
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
