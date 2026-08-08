import SwiftUI

/// A minimal edit sheet for what a recipe can be retouched on: its title, the axis
/// it is filed on — its dish course, or its brew method when it is a coffee — and
/// the note of the version on screen, the one verdict the cook may have mistyped.
/// The type stays fixed — a dish never becomes a Thermomix recipe, its versions
/// are shaped by it.
struct RecipeEditSheet: View {
    let initialTitle: String
    let initialCategory: DishCategory
    /// Set on a coffee and on nothing else: it swaps the course picker for the
    /// method one, and it is what gets saved.
    let initialMethod: BrewMethod?
    /// The displayed version and the note it carries — nil while it has never been
    /// rated, which the stars then let the cook give it.
    let versionNumber: Int
    let initialRating: Int?
    let onSave: (
        _ title: String,
        _ category: DishCategory,
        _ method: BrewMethod?,
        _ rating: Int?
    ) async throws -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var title: String
    @State private var category: DishCategory
    @State private var method: BrewMethod
    @State private var rating: Int?
    @State private var error = ErrorPresenter()

    /// A coffee is filed by how it is brewed, everything else by its course.
    private var isCoffee: Bool { initialMethod != nil }

    init(
        initialTitle: String,
        initialCategory: DishCategory,
        initialMethod: BrewMethod? = nil,
        versionNumber: Int,
        initialRating: Int? = nil,
        onSave: @escaping (
            _ title: String,
            _ category: DishCategory,
            _ method: BrewMethod?,
            _ rating: Int?
        ) async throws -> Void
    ) {
        self.initialTitle = initialTitle
        self.initialCategory = initialCategory
        self.initialMethod = initialMethod
        self.versionNumber = versionNumber
        self.initialRating = initialRating
        self.onSave = onSave
        self._title = State(initialValue: initialTitle)
        self._category = State(initialValue: initialCategory)
        self._method = State(initialValue: initialMethod ?? .other)
        self._rating = State(initialValue: initialRating)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Titre") {
                    TextField("Titre", text: $title)
                        .accessibilityIdentifier("edit-title-field")
                }
                Section {
                    if isCoffee {
                        IconPicker(
                            title: "Méthode",
                            systemImage: "cup.and.saucer",
                            options: BrewMethod.allCases,
                            icon: \.iconImage,
                            label: \.label,
                            selection: $method
                        )
                        .accessibilityIdentifier("edit-method-picker")
                    } else {
                        IconPicker(
                            title: "Catégorie",
                            systemImage: "tag",
                            options: DishCategory.allCases,
                            icon: \.iconImage,
                            label: \.label,
                            selection: $category
                        )
                        .accessibilityIdentifier("edit-category-picker")
                    }
                }
                // The note belongs to the version on screen, not to the recipe:
                // say which one, so the rest of the lineage is not what the cook
                // thinks they are re-rating.
                Section("Note de la version \(versionNumber)") {
                    StarRating(selection: $rating)
                        .listRowBackground(Color.clear)
                        .accessibilityIdentifier("edit-rating-stars")
                }
            }
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
                            await error.run {
                                try await onSave(
                                    title.trimmingCharacters(in: .whitespacesAndNewlines),
                                    category,
                                    isCoffee ? method : nil,
                                    rating
                                )
                            } onSuccess: { dismiss() }
                        }
                    } label: {
                        ActionIcon(systemImage: "checkmark", isRunning: error.isRunning)
                    }
                    .disabled(title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || error.isRunning)
                    .accessibilityLabel("Enregistrer")
                }
            }
            .errorAlert(error)
        }
        // A swipe while the edit is being written would orphan the task.
        .interactiveDismissDisabled(error.isRunning)
    }
}

#Preview("Plat") {
    Text("Fond")
        .sheet(isPresented: .constant(true)) {
            RecipeEditSheet(
                initialTitle: "Bœuf bourguignon",
                initialCategory: .main,
                versionNumber: 3,
                initialRating: 4
            ) { _, _, _, _ in }
        }
}

#Preview("Café") {
    Text("Fond")
        .sheet(isPresented: .constant(true)) {
            RecipeEditSheet(
                initialTitle: "Espresso — Brésil Santa Lúcia",
                initialCategory: .drink,
                initialMethod: .espresso,
                versionNumber: 1,
                initialRating: 5
            ) { _, _, _, _ in }
        }
}

#Preview("Version jamais notée") {
    Text("Fond")
        .sheet(isPresented: .constant(true)) {
            RecipeEditSheet(
                initialTitle: "Bœuf bourguignon",
                initialCategory: .main,
                versionNumber: 4
            ) { _, _, _, _ in }
        }
}
