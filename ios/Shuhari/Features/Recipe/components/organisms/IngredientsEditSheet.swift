import SwiftUI

/// Correcting one version's shopping list — a quantity misread off a photo, a line
/// the import split in two. Full replacement: what the sheet saves IS the new list,
/// so adding, deleting and reordering all happen here. Nothing is created: the plate
/// cooked is the same one, and its rating stays.
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
                    ForEach($rows) { $row in
                        HStack {
                            TextField("Ingrédient", text: $row.name)
                                .frame(maxWidth: .infinity, alignment: .leading)
                            TextField("Quantité", text: $row.quantity)
                                .fixedSize()
                                .multilineTextAlignment(.trailing)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .onDelete { rows.remove(atOffsets: $0) }
                    .onMove { rows.move(fromOffsets: $0, toOffset: $1) }
                    Button {
                        rows.append(Row(name: "", quantity: ""))
                    } label: {
                        Label("Ajouter un ingrédient", systemImage: "plus")
                    }
                    .accessibilityIdentifier("ingredient-add")
                } footer: {
                    Text("Une ligne qui est une recette garde son lien tant que son nom ne change pas.")
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

    /// The list as it will be stored: blank rows dropped (the server refuses an empty
    /// name or quantity), the rest in the order shown.
    private var edited: [Ingredient] {
        rows.compactMap { row in
            let name = row.name.trimmingCharacters(in: .whitespacesAndNewlines)
            let quantity = row.quantity.trimmingCharacters(in: .whitespacesAndNewlines)
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
#endif
