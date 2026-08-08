import SwiftUI

/// The editable import preview of a coffee: its title, how it is brewed, and the
/// five parameter blocks — **all of them, filled or not**. What the AI could not
/// read off the bag is a field waiting for the cook, not a missing row: a coffee is
/// reproducible only if what is unknown is visible.
///
/// Presented inside the import review sheet, its actions in the sheet toolbar
/// (Fermer / Valider). Nothing blocks the save but an empty title.
struct CoffeeImportPreviewPage: View {
    let analysis: CoffeeImportAnalysis
    /// What each free-text field suggests, and where the gear falls back from — the
    /// machine and grinder the cook used most recently, since neither changes from
    /// one cup to the next.
    var vocabulary: CoffeeVocabulary = .empty
    let isSaving: Bool
    let onCancel: () -> Void
    let onSave: (CoffeeImportAnalysis) -> Void

    @State private var title: String
    @State private var method: BrewMethod
    @State private var draft: CoffeeParametersDraft
    @State private var tipTexts: [String]

    init(
        analysis: CoffeeImportAnalysis,
        vocabulary: CoffeeVocabulary = .empty,
        isSaving: Bool,
        onCancel: @escaping () -> Void,
        onSave: @escaping (CoffeeImportAnalysis) -> Void
    ) {
        self.analysis = analysis
        self.vocabulary = vocabulary
        self.isSaving = isSaving
        self.onCancel = onCancel
        self.onSave = onSave
        _title = State(initialValue: analysis.title)
        _method = State(initialValue: analysis.method)
        _draft = State(
            initialValue: CoffeeParametersDraft(
                analysis.parameters,
                method: analysis.method,
                gear: CoffeeGear(machine: vocabulary.machines.first, grinder: vocabulary.grinders.first)
            )
        )
        _tipTexts = State(initialValue: analysis.tips)
    }

    var body: some View {
        Form {
            Section {
                LabeledContent {
                    TextField("Titre", text: $title)
                        .multilineTextAlignment(.trailing)
                        .accessibilityIdentifier("import-title-field")
                } label: {
                    Label("Titre", systemImage: "textformat")
                }

                IconPicker(
                    title: "Méthode",
                    systemImage: "cup.and.saucer",
                    options: BrewMethod.allCases,
                    icon: \.iconImage,
                    label: \.label,
                    selection: $method
                )
                .accessibilityIdentifier("import-method-picker")
            }

            CoffeeParametersForm(draft: $draft, vocabulary: vocabulary)

            if !tipTexts.isEmpty {
                Section {
                    ForEach(tipTexts.indices, id: \.self) { index in
                        TextField("Conseil", text: $tipTexts[index], axis: .vertical)
                            .lineLimit(1...6)
                            .accessibilityIdentifier("import-tip-field")
                    }
                } header: {
                    Text("Conseils")
                } footer: {
                    sourceCaption
                }
            } else {
                Section { EmptyView() } footer: { sourceCaption }
            }
        }
        .scrollDismissesKeyboard(.interactively)
        .navigationTitle("Aperçu")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button { onCancel() } label: {
                    Image(systemName: "xmark")
                }
                .disabled(isSaving)
                .accessibilityLabel("Fermer")
            }
            ToolbarItem(placement: .confirmationAction) {
                Button {
                    onSave(edited)
                } label: {
                    ActionIcon(systemImage: "checkmark", isRunning: isSaving)
                }
                .disabled(title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isSaving)
                .accessibilityLabel("Valider")
                .accessibilityIdentifier("save-recipe-button")
            }
        }
    }

    @ViewBuilder
    private var sourceCaption: some View {
        if let source = analysis.sourceLabel, !source.isEmpty {
            Text("Source : \(source)")
        }
    }

    private var edited: CoffeeImportAnalysis {
        CoffeeImportAnalysis(
            title: title.trimmingCharacters(in: .whitespacesAndNewlines),
            method: method,
            parameters: draft.parameters,
            // Blank tips are dropped.
            tips: tipTexts.compactMap {
                let text = $0.trimmingCharacters(in: .whitespacesAndNewlines)
                return text.isEmpty ? nil : text
            },
            sourceLabel: analysis.sourceLabel
        )
    }
}

#if DEBUG
#Preview("Café — lu sur le paquet") {
    NavigationStack {
        CoffeeImportPreviewPage(
            analysis: Fixtures.importAnalysisCoffee,
            vocabulary: Fixtures.coffeeVocabulary,
            isSaving: false,
            onCancel: {},
            onSave: { _ in }
        )
    }
}

#Preview("Café — presque rien de lu") {
    NavigationStack {
        CoffeeImportPreviewPage(
            analysis: Fixtures.importAnalysisCoffeeSparse,
            vocabulary: Fixtures.coffeeVocabulary,
            isSaving: false,
            onCancel: {},
            onSave: { _ in }
        )
    }
}

#Preview("Flat white — la section lait ouverte") {
    NavigationStack {
        CoffeeImportPreviewPage(
            analysis: Fixtures.importAnalysisCoffeeMilk,
            vocabulary: Fixtures.coffeeVocabulary,
            isSaving: false,
            onCancel: {},
            onSave: { _ in }
        )
    }
}
#endif
