import SwiftUI

/// The one place a recipe is corrected. It carries the whole sheet: its title, the
/// axis it is filed on — its dish course, or its brew method when it is a coffee —
/// the note of the version on screen, then that version's content (its shopping list
/// and its method, or a coffee's parameters), its oven settings, its cautions and its
/// tips. The recipe sheet behind it reads and never writes.
///
/// Every list edits in place: type on a line, swipe it away, add one at the end. The
/// type itself stays fixed — a dish never becomes a Thermomix recipe, its versions
/// are shaped by it.
struct RecipeEditSheet: View {
    let initial: RecipeDraft
    /// The version being corrected — named on the note, so the cook knows which
    /// verdict they are moving, and the rest of the lineage is not what they think
    /// they are re-rating.
    let versionNumber: Int
    /// What each free-text coffee field offers, most recent first. Empty on anything
    /// that is not a coffee.
    var vocabulary: CoffeeVocabulary = .empty
    /// What the connected oven is set to right now, offered as a one-tap copy.
    var applianceSettings: OvenSettings?
    let onSave: (RecipeDraft) async throws -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var draft: RecipeDraft
    @State private var error = ErrorPresenter()
    /// Held here rather than left to an `EditButton`: the system one is labelled
    /// "Modifier", which is the name of this very sheet. What it turns on is the
    /// reordering, and it says so.
    @State private var editMode: EditMode = .inactive

    init(
        initial: RecipeDraft,
        versionNumber: Int,
        vocabulary: CoffeeVocabulary = .empty,
        applianceSettings: OvenSettings? = nil,
        onSave: @escaping (RecipeDraft) async throws -> Void
    ) {
        self.initial = initial
        self.versionNumber = versionNumber
        self.vocabulary = vocabulary
        self.applianceSettings = applianceSettings
        self.onSave = onSave
        self._draft = State(initialValue: initial)
    }

    var body: some View {
        NavigationStack {
            Form {
                // What the recipe IS called and where it is filed: one block, the two
                // lines that answer "which recipe is this".
                Section("Titre") {
                    TextField("Titre", text: $draft.title)
                        .accessibilityIdentifier("edit-title-field")
                    filing
                }
                // The note belongs to the version on screen, not to the recipe, so it
                // is a block of its own and says which version — but a row like every
                // other one, its stars closing the line the way the course does.
                Section {
                    LabeledContent("Note de la version \(versionNumber)") {
                        StarRating(selection: $draft.rating, compact: true)
                    }
                    .accessibilityIdentifier("edit-rating-stars")
                }
                content
                TextLinesEditSection(
                    title: "Avertissements",
                    placeholder: "Attention à…",
                    addLabel: "Ajouter un avertissement",
                    footer: "Affichés en bannière en haut de la recette.",
                    addIdentifier: "warning-add",
                    draft: $draft.warnings
                )
                TextLinesEditSection(
                    title: "Conseils",
                    placeholder: "Conseil",
                    addLabel: "Ajouter un conseil",
                    footer: "Service, conservation, tour de main — ce qui n’est ni un ingrédient ni une étape.",
                    addIdentifier: "tip-add",
                    draft: $draft.tips
                )
            }
            .scrollDismissesKeyboard(.interactively)
            .environment(\.editMode, $editMode)
            .navigationTitle("Modifier")
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
                    .disabled(trimmedTitle.isEmpty || error.isRunning)
                    .accessibilityLabel("Enregistrer")
                }
                // Reordering and multi-deletion need the edit mode; typing a line and
                // swiping one away do not.
                ToolbarItem(placement: .bottomBar) {
                    Button(editMode.isEditing ? "Terminé" : "Réorganiser") {
                        withAnimation {
                            editMode = editMode.isEditing ? .inactive : .active
                        }
                    }
                    .disabled(error.isRunning)
                    .accessibilityIdentifier("reorder-rows-button")
                }
            }
            .errorAlert(error)
        }
        // A swipe while the correction is being written would orphan the task.
        .interactiveDismissDisabled(error.isRunning)
    }

    // MARK: - Sections

    // A coffee is filed by how it is brewed, everything else by its course.
    @ViewBuilder
    private var filing: some View {
        if draft.isCoffee {
            IconPicker(
                title: "Méthode",
                systemImage: "cup.and.saucer",
                options: BrewMethod.allCases,
                icon: \.iconImage,
                label: \.label,
                selection: method
            )
            .accessibilityIdentifier("edit-method-picker")
        } else {
            IconPicker(
                title: "Catégorie",
                systemImage: "tag",
                options: DishCategory.allCases,
                icon: \.iconImage,
                label: \.label,
                selection: $draft.category
            )
            .accessibilityIdentifier("edit-category-picker")
        }
    }

    // What the version IS: a coffee is wholly described by its parameters, everything
    // else by a shopping list, a method and the oven it bakes in.
    @ViewBuilder
    private var content: some View {
        if draft.isCoffee {
            CoffeeParametersForm(draft: coffee, vocabulary: vocabulary)
        } else {
            IngredientsEditSection(draft: $draft.ingredients)
            StepsEditSection(draft: $draft.steps)
            OvenProfileForm(draft: $draft.oven, applianceSettings: applianceSettings)
        }
    }

    // MARK: - Bindings

    /// The brew method, unwrapped for the picker: only a coffee ever shows it, and a
    /// coffee always carries one.
    private var method: Binding<BrewMethod> {
        Binding(
            get: { draft.method ?? .other },
            set: { draft.method = $0 }
        )
    }

    /// The coffee parameters, unwrapped for the form: only a coffee ever shows it.
    private var coffee: Binding<CoffeeParametersDraft> {
        Binding(
            get: { draft.coffee ?? CoffeeParametersDraft(.empty) },
            set: { draft.coffee = $0 }
        )
    }

    private var trimmedTitle: String {
        draft.title.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// The sheet as it will be saved: the title trimmed, everything else as the
    /// sections wrote it.
    private var edited: RecipeDraft {
        var edited = draft
        edited.title = trimmedTitle
        return edited
    }
}

#if DEBUG
#Preview("Plat") {
    Text("Fond")
        .sheet(isPresented: .constant(true)) {
            RecipeEditSheet(
                initial: RecipeDraft(
                    recipe: Fixtures.bourguignon,
                    version: Fixtures.bourguignonV3
                ),
                versionNumber: 3
            ) { _ in }
        }
}

#Preview("Thermomix — réglages machine") {
    Text("Fond")
        .sheet(isPresented: .constant(true)) {
            RecipeEditSheet(
                initial: RecipeDraft(recipe: Fixtures.risotto, version: Fixtures.risottoV2),
                versionNumber: 2
            ) { _ in }
        }
}

#Preview("Café") {
    Text("Fond")
        .sheet(isPresented: .constant(true)) {
            RecipeEditSheet(
                initial: RecipeDraft(recipe: Fixtures.v60, version: Fixtures.v60V2),
                versionNumber: 2,
                vocabulary: Fixtures.coffeeVocabulary
            ) { _ in }
        }
}

#Preview("Version jamais notée") {
    Text("Fond")
        .sheet(isPresented: .constant(true)) {
            RecipeEditSheet(
                initial: RecipeDraft(
                    recipe: Fixtures.freshImport,
                    version: Fixtures.freshImportV1
                ),
                versionNumber: 1
            ) { _ in }
        }
}
#endif
