import SwiftUI

/// Correcting one version's shopping list — a quantity misread off a photo, a line
/// the import split in two, or the whole recipe resized. Full replacement: what the
/// sheet saves IS the new list, so adding, deleting and reordering all happen here.
/// Nothing is created: the plate cooked is the same one, and its rating stays.
struct IngredientsEditSheet: View {
    let initial: [Ingredient]
    let onSave: ([Ingredient]) async throws -> Void

    /// An editable row with an identity of its own — the name cannot be one while it
    /// is being typed, and rows must survive an edit or a deletion.
    private struct Row: Identifiable {
        let id = UUID()
        var name: String
        var quantity: String
    }

    @Environment(\.dismiss) private var dismiss
    @State private var rows: [Row]
    /// Proportional resizing of the whole list, applied on top of `rows`: stepping one
    /// quantity carries every other one along the same factor. Unlike the recipe
    /// sheet's factor this one is not a lens — saving writes the quantities as shown,
    /// and the recipe IS the smaller loaf from then on.
    @State private var factor: Double = 1
    @State private var error = ErrorPresenter()

    init(initial: [Ingredient], onSave: @escaping ([Ingredient]) async throws -> Void) {
        self.initial = initial
        self.onSave = onSave
        _rows = State(initialValue: initial.map { Row(name: $0.name, quantity: $0.quantity) })
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    ForEach(Array(rows.enumerated()), id: \.element.id) { index, _ in
                        row(at: index)
                    }
                    .onDelete { rows.remove(atOffsets: $0) }
                    .onMove { rows.move(fromOffsets: $0, toOffset: $1) }
                    Button {
                        // A line added by hand starts outside the resizing: baking the
                        // factor in first stops the empty row from being scaled the
                        // moment it is filled.
                        bakeFactor()
                        rows.append(Row(name: "", quantity: ""))
                    } label: {
                        Label("Ajouter un ingrédient", systemImage: "plus")
                    }
                    .accessibilityIdentifier("ingredient-add")
                } header: {
                    header
                } footer: {
                    Text(
                        "Les − et + redimensionnent toute la recette : régler un ingrédient reconvertit les autres. "
                            + "Une ligne qui est une recette garde son lien tant que son nom ne change pas."
                    )
                }
            }
            .scrollDismissesKeyboard(.interactively)
            .navigationTitle("Ingrédients")
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
                    .disabled(error.isRunning)
                    .accessibilityLabel("Enregistrer")
                }
                // Reordering and multi-deletion need the edit mode; typing does not.
                ToolbarItem(placement: .bottomBar) { EditButton() }
            }
            .errorAlert(error)
        }
        // A swipe while the correction is being written would orphan the task.
        .interactiveDismissDisabled(error.isRunning)
    }

    // The header says when the list no longer shows the version as stored — the same
    // factor badge and reset the recipe sheet carries, so the two surfaces read alike.
    @ViewBuilder
    private var header: some View {
        if factor != 1 {
            HStack {
                Text("Redimensionnée")
                Spacer()
                Text(IngredientScaling.factorLabel(factor))
                    .monospacedDigit()
                    .foregroundStyle(Theme.Status.changed)
                Button("Réinitialiser") { factor = 1 }
                    .font(.footnote)
                    .textCase(nil)
                    .accessibilityIdentifier("ingredient-edit-reset")
            }
        }
    }

    // A quantity that leads with a number grows a −/+; "à goût" has nothing to move
    // and renders as the plain pair of fields it always was.
    @ViewBuilder
    private func row(at index: Int) -> some View {
        let quantity = displayed(at: index)
        if IngredientScaling.isScalable(quantity) {
            Stepper {
                fields(at: index, quantity: quantity)
            } onIncrement: {
                step(at: index, direction: 1)
            } onDecrement: {
                step(at: index, direction: -1)
            }
            .accessibilityIdentifier("ingredient-edit-stepper-\(index)")
        } else {
            fields(at: index, quantity: quantity)
        }
    }

    private func fields(at index: Int, quantity: String) -> some View {
        HStack {
            TextField("Ingrédient", text: $rows[index].name)
                .frame(maxWidth: .infinity, alignment: .leading)
            TextField("Quantité", text: quantityBinding(at: index, showing: quantity))
                .fixedSize()
                .multilineTextAlignment(.trailing)
                .foregroundStyle(.secondary)
                .accessibilityIdentifier("ingredient-edit-quantity-\(index)")
        }
    }

    /// The quantity as the sheet shows it: the stored one carried by the factor.
    private func displayed(at index: Int) -> String {
        IngredientScaling.scaled(rows[index].quantity, by: factor)
    }

    /// Typing a quantity by hand bakes the factor in first, so the line lands exactly
    /// as typed instead of being rescaled behind the cook's back — what you see is
    /// what you edit. Every other line keeps the value it was already showing.
    private func quantityBinding(at index: Int, showing quantity: String) -> Binding<String> {
        Binding(
            get: { quantity },
            set: { typed in
                bakeFactor()
                rows[index].quantity = typed
            }
        )
    }

    private func step(at index: Int, direction: Int) {
        guard
            let next = IngredientScaling.factorAfterStep(
                on: rows[index].quantity,
                from: factor,
                direction: direction
            )
        else { return }
        factor = next
    }

    /// Folds the factor into the rows themselves and starts over from 1 — the rows
    /// keep their identity, so a field being typed into is not torn down.
    private func bakeFactor() {
        guard factor != 1 else { return }
        for index in rows.indices {
            rows[index].quantity = IngredientScaling.scaled(rows[index].quantity, by: factor)
        }
        factor = 1
    }

    /// The list as it will be stored — the quantities AS SHOWN, factor included: what
    /// the sheet saves is what the cook is looking at. Blank rows dropped (the server
    /// refuses an empty name or quantity), the rest in the order shown.
    private var edited: [Ingredient] {
        rows.indices.compactMap { index in
            let name = rows[index].name.trimmingCharacters(in: .whitespacesAndNewlines)
            let quantity = displayed(at: index).trimmingCharacters(in: .whitespacesAndNewlines)
            guard !name.isEmpty, !quantity.isEmpty else { return nil }
            return Ingredient(name: name, quantity: quantity)
        }
    }
}

#if DEBUG
#Preview("Liste existante") {
    Text("Fond")
        .sheet(isPresented: .constant(true)) {
            IngredientsEditSheet(initial: Fixtures.bourguignonV3.ingredients) { _ in }
        }
}

#Preview("Liste vide") {
    Text("Fond")
        .sheet(isPresented: .constant(true)) {
            IngredientsEditSheet(initial: []) { _ in }
        }
}

#Preview("Petites quantités et ligne non chiffrée") {
    Text("Fond")
        .sheet(isPresented: .constant(true)) {
            IngredientsEditSheet(initial: Fixtures.breadIngredients) { _ in }
        }
}
#endif
