import SwiftUI

/// Correcting one version's method — a step the import split in two, an instruction
/// read wrong. Full replacement: adding, deleting and reordering all happen here.
/// `showsSettings` is what a Thermomix version turns on; a dish has no machine and
/// its steps are text alone.
struct StepsEditSheet: View {
    let initial: [ThermomixStep]
    var showsSettings: Bool = false
    let onSave: ([ThermomixStep]) async throws -> Void

    /// An editable step: its text and its four settings as plain strings, with an
    /// identity of its own so rows survive an edit or a deletion.
    private struct Row: Identifiable {
        let id = UUID()
        var text: String
        var time: String
        var temperature: String
        var speed: String
        var reverse: Bool
    }

    @Environment(\.dismiss) private var dismiss
    @State private var rows: [Row]
    @State private var error = ErrorPresenter()

    init(
        initial: [ThermomixStep],
        showsSettings: Bool = false,
        onSave: @escaping ([ThermomixStep]) async throws -> Void
    ) {
        self.initial = initial
        self.showsSettings = showsSettings
        self.onSave = onSave
        _rows = State(initialValue: initial.map {
            Row(
                text: $0.text,
                time: $0.settings.time ?? "",
                temperature: $0.settings.temperature ?? "",
                speed: $0.settings.speed ?? "",
                reverse: $0.settings.reverse
            )
        })
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    ForEach(Array(zip(rows.indices, $rows)), id: \.1.id) { index, $row in
                        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                            HStack(alignment: .top, spacing: 12) {
                                Text("\(index + 1)")
                                    .font(.subheadline.weight(.semibold))
                                    .monospacedDigit()
                                    .foregroundStyle(.secondary)
                                    .frame(minWidth: 20, alignment: .trailing)
                                TextField("Étape", text: $row.text, axis: .vertical)
                                    .lineLimit(1...6)
                            }
                            if showsSettings {
                                ThermomixSettingsFields(
                                    time: $row.time,
                                    temperature: $row.temperature,
                                    speed: $row.speed,
                                    reverse: $row.reverse
                                )
                            }
                        }
                    }
                    .onDelete { rows.remove(atOffsets: $0) }
                    .onMove { rows.move(fromOffsets: $0, toOffset: $1) }
                    Button {
                        rows.append(Row(text: "", time: "", temperature: "", speed: "", reverse: false))
                    } label: {
                        Label("Ajouter une étape", systemImage: "plus")
                    }
                    .accessibilityIdentifier("step-add")
                }
            }
            .scrollDismissesKeyboard(.interactively)
            .navigationTitle("Étapes")
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

    /// The method as it will be stored: blank steps dropped (the server refuses an
    /// empty text), each surviving one carrying the settings actually typed.
    private var edited: [ThermomixStep] {
        rows.compactMap { row in
            let text = row.text.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !text.isEmpty else { return nil }
            return ThermomixStep(text: text, settings: settings(of: row))
        }
    }

    private func settings(of row: Row) -> ThermomixSettings {
        guard showsSettings else { return .plain }
        let typed = { (raw: String) -> String? in
            let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
            return trimmed.isEmpty ? nil : trimmed
        }
        return ThermomixSettings(
            time: typed(row.time),
            temperature: typed(row.temperature),
            speed: typed(row.speed),
            reverse: row.reverse
        )
    }
}

#if DEBUG
#Preview("Plat") {
    Text("Fond")
        .sheet(isPresented: .constant(true)) {
            StepsEditSheet(initial: Fixtures.bourguignonV3.editableSteps) { _ in }
        }
}

#Preview("Thermomix — réglages machine") {
    Text("Fond")
        .sheet(isPresented: .constant(true)) {
            StepsEditSheet(initial: Fixtures.risottoV2.editableSteps, showsSettings: true) { _ in }
        }
}
#endif
