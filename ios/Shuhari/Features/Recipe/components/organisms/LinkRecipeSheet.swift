import SwiftUI

/// Says that this recipe is made of another one, and at what weight. Two steps: pick
/// the recipe from the notebook, then set the weight on its own shopping list — type
/// the quantity wanted on one line ("my flour is 100 g" where it writes 500 g) or walk
/// it with the −/+; either way the whole list follows the proportion.
///
/// Linking is not cooking: no version is created and the recipe is not redated. The
/// sheet opens straight on the weight step when a link is being corrected.
struct LinkRecipeSheet: View {
    /// The recipe being edited: never offered to itself.
    let excludedId: String
    /// The recipes already linked — ticked in the list, and relinking one is how its
    /// weight is corrected.
    var linkedIds: Set<String> = []
    /// Set to open straight on the weight step of an existing link.
    var editing: Editing? = nil
    let onLink: (_ recipeId: String, _ scale: Double) async throws -> Void

    /// The link being corrected: which recipe, and the weight it currently holds.
    struct Editing: Identifiable, Hashable {
        let recipeId: String
        let scale: Double
        var id: String { recipeId }
    }

    @Environment(\.dismiss) private var dismiss
    @State private var store = LibraryStore()
    @State private var error = ErrorPresenter()
    @State private var picked: Editing?

    private var candidates: [LibraryRecipe] {
        store.items.filter { $0.id != excludedId }
    }

    var body: some View {
        NavigationStack {
            list
                .navigationTitle("Lier une recette")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Annuler") { dismiss() }
                    }
                }
                .errorAlert(error)
                .task { await store.load() }
                .navigationDestination(item: $picked) { link in
                    WeightStep(recipeId: link.recipeId, scale: link.scale) { scale in
                        try await onLink(link.recipeId, scale)
                        dismiss()
                    }
                }
        }
        // Correcting a weight skips the list entirely: the recipe is already chosen.
        .onAppear { picked = picked ?? editing }
    }

    @ViewBuilder
    private var list: some View {
        List {
            Section {
                if store.isLoading {
                    ProgressView()
                        .frame(maxWidth: .infinity)
                } else if candidates.isEmpty {
                    ContentUnavailableView(
                        "Aucune autre recette",
                        systemImage: "book",
                        description: Text("Importe la recette du poolish d’abord.")
                    )
                } else {
                    ForEach(candidates) { recipe in
                        Button {
                            picked = Editing(recipeId: recipe.id, scale: 1)
                        } label: {
                            row(recipe)
                        }
                        .accessibilityIdentifier("link-candidate-\(recipe.id)")
                    }
                }
            } header: {
                Text("Cette recette est faite de…")
            }
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
            if linkedIds.contains(recipe.id) {
                Image(systemName: "checkmark")
                    .foregroundStyle(.tint)
            }
        }
    }
}

/// The weight step: the linked recipe's own shopping list, shown at the weight being
/// set. Loads that recipe (its best version is what answers for it) and hands the
/// factor to `LinkWeightForm`, which knows nothing of the network.
private struct WeightStep: View {
    let recipeId: String
    let scale: Double
    let onConfirm: (_ scale: Double) async throws -> Void

    @State private var recipe: Recipe?
    @State private var error = ErrorPresenter()

    var body: some View {
        Group {
            if let recipe {
                LinkWeightForm(
                    title: recipe.title,
                    ingredients: recipe.versionToOpen.ingredients.map { ($0.name, $0.quantity) },
                    initialScale: scale,
                    isLinking: error.isRunning,
                    onConfirm: { chosen in
                        Task { await error.run { try await onConfirm(chosen) } }
                    }
                )
            } else {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .errorAlert(error)
        .task {
            await error.run { recipe = try await RecipeAPI.getRecipe(id: recipeId) }
        }
    }
}

/// How much of a recipe goes in, set on its own shopping list: type the quantity
/// wanted on any line, or walk it with the −/+. Every other line follows the same
/// proportion — the list is what the cook reads, the factor is only what is stored.
/// Primitive-first: `(name, quantity)` pairs, no domain struct, no network.
struct LinkWeightForm: View {
    let title: String
    let ingredients: [(name: String, quantity: String)]
    let initialScale: Double
    /// A CTA that hits the network shows it.
    var isLinking: Bool = false
    let onConfirm: (_ scale: Double) -> Void

    @State private var scale: Double
    /// Every line as it currently reads. Held rather than derived at each draw: a
    /// field the cook is typing into cannot be rewritten under their fingers, and
    /// each of them is rewritten whole the moment the weight moves.
    @State private var texts: [String]
    @FocusState private var focused: Int?

    init(
        title: String,
        ingredients: [(name: String, quantity: String)],
        initialScale: Double,
        isLinking: Bool = false,
        onConfirm: @escaping (_ scale: Double) -> Void
    ) {
        self.title = title
        self.ingredients = ingredients
        self.initialScale = initialScale
        self.isLinking = isLinking
        self.onConfirm = onConfirm
        self._scale = State(initialValue: initialScale)
        self._texts = State(
            initialValue: ingredients.map { QuantityScaling.scaled($0.quantity, by: initialScale) }
        )
    }

    private var scalableRows: Set<Int> {
        Set(ingredients.indices.filter { QuantityScaling.isScalable(ingredients[$0].quantity) })
    }

    var body: some View {
        List {
            Section {
                if ingredients.isEmpty {
                    Text("Aucun ingrédient")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(Array(ingredients.enumerated()), id: \.offset) { index, item in
                        row(index: index, item: item)
                    }
                }
            } header: {
                HStack {
                    Text("Quantités utilisées ici")
                    Spacer()
                    if scale != 1 {
                        Text(QuantityScaling.factorLabel(scale))
                            .monospacedDigit()
                            .foregroundStyle(Theme.Status.changed)
                        Button("Réinitialiser") { reset() }
                            .font(.footnote)
                            .accessibilityIdentifier("link-weight-reset")
                    }
                }
            } footer: {
                Text("Écris la quantité voulue sur une ligne : tout le reste suit la proportion.")
            }
        }
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button {
                    focused = nil
                    onConfirm(scale)
                } label: {
                    if isLinking {
                        ProgressView()
                    } else {
                        Text("Lier")
                    }
                }
                .disabled(isLinking)
                .accessibilityIdentifier("confirm-link")
            }
        }
        // Leaving a line is what reads what was typed into it — there is no "OK" on
        // a quantity, and the −/+ of another line count as leaving.
        .onChange(of: focused) { previous, _ in
            if let previous { commit(previous) }
        }
    }

    @ViewBuilder
    private func row(index: Int, item: (name: String, quantity: String)) -> some View {
        if scalableRows.contains(index) {
            // The field and the −/+ are siblings, never nested: a text field inside a
            // stepper's label fights it for the tap, and the quantity is what the cook
            // aims at first.
            HStack(spacing: Theme.Spacing.s) {
                Text(item.name)
                Spacer(minLength: Theme.Spacing.s)
                TextField("", text: $texts[index])
                    .multilineTextAlignment(.trailing)
                    .monospacedDigit()
                    .foregroundStyle(scale == 1 ? Color.primary : Theme.Status.changed)
                    .focused($focused, equals: index)
                    .submitLabel(.done)
                    .onSubmit { focused = nil }
                    .frame(maxWidth: 110)
                    .accessibilityIdentifier("link-quantity-\(index)")
                Stepper("", onIncrement: { step(index, 1) }, onDecrement: { step(index, -1) })
                    .labelsHidden()
                    .accessibilityIdentifier("link-stepper-\(index)")
            }
        } else {
            // Nothing to multiply here ("Sel", "Quelques brins"): the line reads as
            // written, whatever the weight.
            LabeledContent(item.name) {
                Text(item.quantity)
                    .foregroundStyle(.secondary)
            }
        }
    }

    /// What was typed on that line becomes the weight of the whole list. A quantity
    /// the line cannot be read as (another unit, a word) leaves the weight where it
    /// was, and rewriting the lines puts the refused one back to what it showed.
    private func commit(_ index: Int) {
        rescale(
            to: QuantityScaling.factor(from: ingredients[index].quantity, to: texts[index]) ?? scale
        )
    }

    private func step(_ index: Int, _ direction: Int) {
        // A quantity being typed is read before the tick moves anything: the tick
        // starts from what the cook wrote, not from what it replaced.
        if let focused { commit(focused) }
        focused = nil
        guard
            let next = QuantityScaling.factorAfterStep(
                on: ingredients[index].quantity,
                from: scale,
                direction: direction
            )
        else { return }
        rescale(to: next)
    }

    private func reset() {
        focused = nil
        rescale(to: 1)
    }

    /// The single way the weight moves: one factor, and every line rewritten from it.
    private func rescale(to next: Double) {
        scale = next
        texts = ingredients.map { QuantityScaling.scaled($0.quantity, by: next) }
    }
}

#if DEBUG
#Preview("Choisir la recette") {
    LinkRecipeSheet(excludedId: "recipe-1", onLink: { _, _ in })
}

#Preview("Le poids — telle qu’elle est écrite") {
    NavigationStack {
        LinkWeightForm(
            title: "Poolish",
            ingredients: [
                ("Farine T65", "500 g"),
                ("Eau", "500 ml"),
                ("Levure fraîche", "1 g"),
                ("Sel", "à goût"),
            ],
            initialScale: 1,
            onConfirm: { _ in }
        )
    }
}

#Preview("Le poids — un cinquième") {
    NavigationStack {
        LinkWeightForm(
            title: "Poolish",
            ingredients: [
                ("Farine T65", "500 g"),
                ("Eau", "500 ml"),
                ("Levure fraîche", "1 g"),
            ],
            initialScale: 0.2,
            onConfirm: { _ in }
        )
    }
}
#endif
