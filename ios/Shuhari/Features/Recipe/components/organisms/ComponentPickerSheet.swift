import SwiftUI

/// Says which recipe an ingredient line IS — the ravioli's pasta dough. Lists the
/// cook's own cooking recipes, the one being edited excluded (a recipe cannot be its
/// own ingredient), and offers to unlink when the line already points somewhere.
///
/// Picking is a correction, not an attempt: it rewrites the line in place, creates no
/// version, and leaves the rating of the version alone.
struct ComponentPickerSheet: View {
    /// The line being linked, as it reads in the parent recipe — the role it plays
    /// there, which is not the title of whatever it ends up pointing to.
    let ingredientName: String
    /// The recipe currently linked, so the sheet can tick it and offer to unlink.
    var linkedId: String? = nil
    /// The recipe being edited: never offered to itself.
    let excludedId: String
    /// nil unlinks the line.
    let onPick: (_ recipeId: String?) async throws -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var store = LibraryStore()
    @State private var error = ErrorPresenter()
    @State private var picking: String?

    private var candidates: [LibraryRecipe] {
        store.items.filter { $0.id != excludedId }
    }

    var body: some View {
        NavigationStack {
            List {
                if linkedId != nil {
                    Section {
                        Button("Ce n’est pas une recette", role: .destructive) {
                            pick(nil)
                        }
                        .accessibilityIdentifier("component-unlink")
                    }
                }
                Section {
                    if store.isLoading {
                        ProgressView()
                            .frame(maxWidth: .infinity)
                    } else if candidates.isEmpty {
                        ContentUnavailableView(
                            "Aucune autre recette",
                            systemImage: "book",
                            description: Text("Importe la recette de la pâte d’abord.")
                        )
                    } else {
                        ForEach(candidates) { recipe in
                            Button {
                                pick(recipe.id)
                            } label: {
                                row(recipe)
                            }
                            .accessibilityIdentifier("component-candidate-\(recipe.id)")
                        }
                    }
                } header: {
                    Text("« \(ingredientName) », c’est la recette…")
                }
            }
            .navigationTitle("Lier une recette")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Annuler") { dismiss() }
                }
            }
            .errorAlert(error)
            .task { await store.load() }
        }
    }

    private func row(_ recipe: LibraryRecipe) -> some View {
        HStack(spacing: Theme.Spacing.s) {
            VStack(alignment: .leading, spacing: 2) {
                Text(recipe.title)
                    .foregroundStyle(.primary)
                if let rating = recipe.bestRating {
                    Text("Meilleure version : \(rating)/5")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
            Spacer(minLength: Theme.Spacing.s)
            // A CTA that hits the network shows it, right where it was tapped.
            if picking == recipe.id {
                ProgressView()
            } else if recipe.id == linkedId {
                Image(systemName: "checkmark")
                    .foregroundStyle(.tint)
            }
        }
    }

    private func pick(_ recipeId: String?) {
        // The row tapped shows the wait right where the tap landed — never a silently
        // disabled list.
        picking = recipeId ?? excludedId
        Task {
            await error.run {
                try await onPick(recipeId)
            } onSuccess: {
                dismiss()
            }
            picking = nil
        }
    }
}

#if DEBUG
#Preview("Aucun lien encore") {
    ComponentPickerSheet(
        ingredientName: "Pâte à ravioles",
        excludedId: "recipe-1",
        onPick: { _ in }
    )
}

#Preview("Déjà liée") {
    ComponentPickerSheet(
        ingredientName: "Pâte à ravioles",
        linkedId: "recipe-2",
        excludedId: "recipe-1",
        onPick: { _ in }
    )
}
#endif
