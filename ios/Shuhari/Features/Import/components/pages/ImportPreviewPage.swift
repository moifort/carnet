import SwiftUI

/// The editable import preview of something cooked: title, detected type and dish
/// category, ingredients, steps and the tips the AI found. Everything is adjustable
/// before creating the recipe (v1). Presented inside the import review sheet — its
/// actions live in the sheet toolbar (Fermer / Valider), not a bottom button.
/// A coffee has its own preview: it is a set of dials, not a method.
struct ImportPreviewPage: View {
    let analysis: CookingImportAnalysis
    let isSaving: Bool
    let onCancel: () -> Void
    let onSave: (CookingImportAnalysis) -> Void

    /// Editable ingredient row — a stable identity so rows survive edits/deletes.
    private struct EditableIngredient: Identifiable {
        let id = UUID()
        var name: String
        var quantity: String
    }

    @State private var title: String
    @State private var type: RecipeType
    @State private var category: DishCategory
    @State private var ingredients: [EditableIngredient]
    @State private var stepTexts: [String]
    @State private var tipTexts: [String]

    init(
        analysis: CookingImportAnalysis,
        isSaving: Bool,
        onCancel: @escaping () -> Void,
        onSave: @escaping (CookingImportAnalysis) -> Void
    ) {
        self.analysis = analysis
        self.isSaving = isSaving
        self.onCancel = onCancel
        self.onSave = onSave
        self._title = State(initialValue: analysis.title)
        self._type = State(initialValue: analysis.type)
        self._category = State(initialValue: analysis.category)
        self._ingredients = State(initialValue: analysis.ingredients.map {
            EditableIngredient(name: $0.name, quantity: $0.quantity)
        })
        self._stepTexts = State(initialValue: analysis.steps.map(\.text))
        self._tipTexts = State(initialValue: analysis.tips)
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

                // Cooking only: a coffee never reaches this preview, so the
                // picker offers the two types this flow can produce.
                IconPicker(
                    title: "Type",
                    systemImage: "square.grid.2x2",
                    options: [.dish, .thermomix],
                    icon: { $0.iconImage(filled: false) },
                    label: \.label,
                    selection: $type
                )
                .accessibilityIdentifier("import-type-picker")

                IconPicker(
                    title: "Catégorie",
                    systemImage: "tag",
                    options: DishCategory.allCases,
                    icon: \.iconImage,
                    label: \.label,
                    selection: $category
                )
                .accessibilityIdentifier("import-category-picker")
            }

            if !ingredients.isEmpty {
                Section("Ingrédients") {
                    ForEach($ingredients) { $ingredient in
                        HStack {
                            TextField("Ingrédient", text: $ingredient.name)
                                .frame(maxWidth: .infinity, alignment: .leading)
                            TextField("Quantité", text: $ingredient.quantity)
                                .fixedSize()
                                .multilineTextAlignment(.trailing)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .onDelete { ingredients.remove(atOffsets: $0) }
                }
            }

            Section {
                ForEach(stepTexts.indices, id: \.self) { index in
                    stepRow(index)
                }
            } header: {
                Text("Étapes")
            } footer: {
                // The source caption closes the preview: it sits under the steps
                // unless tips follow, in which case they are the last section.
                if tipTexts.isEmpty { sourceCaption }
            }

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

    /// A numbered, editable step. The step text is editable; the Thermomix
    /// settings (time / temperature / speed / reverse) stay read-only badges.
    private func stepRow(_ index: Int) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Text("\(index + 1)")
                .font(.subheadline.weight(.semibold))
                .monospacedDigit()
                .foregroundStyle(.secondary)
                .frame(minWidth: 20, alignment: .trailing)
            VStack(alignment: .leading, spacing: 6) {
                TextField("Étape", text: $stepTexts[index], axis: .vertical)
                    .lineLimit(1...6)
                stepBadges(at: index)
            }
        }
    }

    /// The Thermomix settings the AI extracted for this step, read-only next to the
    /// editable text. The detected type decides whether they show, so switching it
    /// in the picker switches the badges too.
    @ViewBuilder
    private func stepBadges(at index: Int) -> some View {
        if let step = analysis.steps[safe: index], type == .thermomix, !step.thermomix.isEmpty {
            ThermomixSettingBadges(
                time: step.thermomix.time,
                temperature: step.thermomix.temperature,
                speed: step.thermomix.speed,
                reverse: step.thermomix.reverse
            )
        }
    }

    private var edited: CookingImportAnalysis {
        // Drop blank steps (the server rejects empty StepText); each surviving step
        // keeps its settings (`.plain` when it has none).
        let trimmedSteps = stepTexts.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
        let keptIndices = trimmedSteps.indices.filter { !trimmedSteps[$0].isEmpty }
        let steps = keptIndices.map { index in
            ImportStep(
                text: trimmedSteps[index],
                thermomix: analysis.steps[safe: index]?.thermomix ?? .plain
            )
        }
        return CookingImportAnalysis(
            title: title.trimmingCharacters(in: .whitespacesAndNewlines),
            type: type,
            category: category,
            ingredients: ingredients.compactMap { row in
                let name = row.name.trimmingCharacters(in: .whitespacesAndNewlines)
                let quantity = row.quantity.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !name.isEmpty, !quantity.isEmpty else { return nil }
                return Ingredient(name: name, quantity: quantity)
            },
            steps: steps,
            // Blank tips are dropped, like blank steps.
            tips: tipTexts.compactMap {
                let text = $0.trimmingCharacters(in: .whitespacesAndNewlines)
                return text.isEmpty ? nil : text
            },
            sourceLabel: analysis.sourceLabel
        )
    }
}

private extension Array {
    subscript(safe index: Int) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}

#if DEBUG
#Preview("Plat") {
    NavigationStack {
        ImportPreviewPage(analysis: Fixtures.importAnalysis, isSaving: false, onCancel: {}, onSave: { _ in })
    }
}

#Preview("Thermomix") {
    NavigationStack {
        ImportPreviewPage(analysis: Fixtures.importAnalysisThermomix, isSaving: false, onCancel: {}, onSave: { _ in })
    }
}

#endif
