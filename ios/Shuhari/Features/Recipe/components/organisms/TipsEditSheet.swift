import SwiftUI

/// Writing one version's cooking tips by hand — the counterpart of the AI's merged
/// list, for the cook who just wants to fix a word. Full replacement, in place: tips
/// have always been rewritable, this is simply where it is done without asking the
/// model.
struct TipsEditSheet: View {
    let initial: [String]
    let onSave: ([String]) async throws -> Void

    /// An editable row with an identity of its own, so rows survive an edit or a
    /// deletion — the text cannot be one while it is being typed.
    private struct Row: Identifiable {
        let id = UUID()
        var text: String
    }

    @Environment(\.dismiss) private var dismiss
    @State private var rows: [Row]
    @State private var error = ErrorPresenter()

    init(initial: [String], onSave: @escaping ([String]) async throws -> Void) {
        self.initial = initial
        self.onSave = onSave
        _rows = State(initialValue: initial.map { Row(text: $0) })
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    ForEach($rows) { $row in
                        TextField("Conseil", text: $row.text, axis: .vertical)
                            .lineLimit(1...6)
                    }
                    .onDelete { rows.remove(atOffsets: $0) }
                    .onMove { rows.move(fromOffsets: $0, toOffset: $1) }
                    Button {
                        rows.append(Row(text: ""))
                    } label: {
                        Label("Ajouter un conseil", systemImage: "plus")
                    }
                    .accessibilityIdentifier("tip-add")
                } footer: {
                    Text("Service, conservation, tour de main — ce qui n’est ni un ingrédient ni une étape.")
                }
            }
            .scrollDismissesKeyboard(.interactively)
            .navigationTitle("Conseils")
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

    /// Blank rows are dropped — an empty list is how the section is cleared, not a
    /// list of empty tips.
    private var edited: [String] {
        rows.compactMap {
            let text = $0.text.trimmingCharacters(in: .whitespacesAndNewlines)
            return text.isEmpty ? nil : text
        }
    }
}

#if DEBUG
#Preview("Conseils existants") {
    Text("Fond")
        .sheet(isPresented: .constant(true)) {
            TipsEditSheet(initial: Fixtures.bourguignonV3.tips) { _ in }
        }
}

#Preview("Aucun conseil") {
    Text("Fond")
        .sheet(isPresented: .constant(true)) {
            TipsEditSheet(initial: []) { _ in }
        }
}
#endif
