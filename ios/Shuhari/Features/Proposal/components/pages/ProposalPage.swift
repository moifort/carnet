import SwiftUI

/// The AI proposal screen: a short summary of what changes and why, then the
/// FULL proposed next version — ingredients, steps and tips, each row editable
/// inline and marked with a dot when it differs from the base version. Finally
/// Valider/Fermer.
///
/// Diff marking: rows are always editable `TextField`s, so a from→to
/// `DiffValue` doesn't fit; instead a row carries a leading `Theme.Status.changed`
/// dot whenever its current value differs from the base version (new or modified),
/// centred on the row's first line of text. It updates live as the user types.
///
/// The proposal is ephemeral (never persisted): "Fermer" discards it, "Valider"
/// accepts it. On accept the page emits the COMPLETE proposal (full-replacement
/// semantics) — the `basedOn`, `changeSummary` and `rationale` carried through from
/// the in-memory AI proposal, the ingredient, step and tip lists taken from the
/// form's current (possibly edited) state.
///
/// A proposal has a second way out: "Nouvelle recette" saves it as the v1 of a recipe
/// of its own instead of the next version of the one it was proposed for — the change
/// went far enough that it is another dish. The recipe it came from is left untouched.
struct ProposalPage: View {
    let proposal: Proposal
    let nextVersionNumber: Int
    /// The base version's content, to mark what the proposal changes.
    let baseIngredients: [Ingredient]
    /// The base steps with their machine settings, so a Thermomix step that only
    /// changed a time, a temperature or a speed still reads as changed.
    let baseSteps: [ThermomixStep]
    /// The same with their extraction settings, so a coffee step that only changed
    /// a grind or a temperature still reads as changed.
    let baseCoffeeSteps: [CoffeeStep]
    /// The base version's tips, to mark what the proposal changes.
    let baseTips: [String]
    let isWorking: Bool
    /// What the new-recipe field opens on — the title of the recipe this proposal
    /// iterates on, the cook renames it from there.
    let suggestedRecipeTitle: String
    let isCreatingRecipe: Bool
    let onClose: () -> Void
    let onValidate: (_ edited: ProposalEdit) -> Void
    let onCreateRecipe: (_ edited: ProposalEdit, _ title: String) -> Void

    private struct EditableIngredient: Identifiable {
        let id = UUID()
        var name: String
        var quantity: String
    }

    private struct EditableStep: Identifiable {
        let id = UUID()
        var text: String
        /// This step's read-only Thermomix settings (`.plain` for a dish step or a
        /// Thermomix step with no machine settings).
        let settings: ThermomixSettings
        /// Its read-only extraction settings (`.plain` on anything but a coffee).
        let extraction: CoffeeSettings
    }

    private struct EditableTip: Identifiable {
        let id = UUID()
        var text: String
    }

    @State private var ingredients: [EditableIngredient]
    @State private var steps: [EditableStep]
    @State private var tips: [EditableTip]
    /// The new-recipe title being typed, seeded from `suggestedRecipeTitle` each time
    /// the prompt opens.
    @State private var draftRecipeTitle = ""
    @State private var askingRecipeTitle = false
    /// Height of one line of body text — the box the change dot centres itself in.
    @ScaledMetric(relativeTo: .body) private var bodyLineHeight: CGFloat = 20.5

    init(
        proposal: Proposal,
        nextVersionNumber: Int,
        baseIngredients: [Ingredient],
        baseSteps: [ThermomixStep],
        baseCoffeeSteps: [CoffeeStep] = [],
        baseTips: [String] = [],
        isWorking: Bool,
        suggestedRecipeTitle: String,
        isCreatingRecipe: Bool = false,
        onClose: @escaping () -> Void,
        onValidate: @escaping (_ edited: ProposalEdit) -> Void,
        onCreateRecipe: @escaping (_ edited: ProposalEdit, _ title: String) -> Void
    ) {
        self.proposal = proposal
        self.nextVersionNumber = nextVersionNumber
        self.baseIngredients = baseIngredients
        self.baseSteps = baseSteps
        self.baseCoffeeSteps = baseCoffeeSteps
        self.baseTips = baseTips
        self.isWorking = isWorking
        self.suggestedRecipeTitle = suggestedRecipeTitle
        self.isCreatingRecipe = isCreatingRecipe
        self.onClose = onClose
        self.onValidate = onValidate
        self.onCreateRecipe = onCreateRecipe
        self._ingredients = State(initialValue: proposal.content.ingredients.map {
            EditableIngredient(name: $0.name, quantity: $0.quantity)
        })
        self._steps = State(initialValue: Self.editableSteps(from: proposal.content))
        self._tips = State(initialValue: proposal.tips.map { EditableTip(text: $0) })
    }

    /// The proposal's steps as editable rows, each keeping its own settings — a
    /// step that sets nothing (a dish step, or a machine/brewing step with no
    /// setting) carries `.plain` on both sides.
    private static func editableSteps(from content: VersionContent) -> [EditableStep] {
        let machine = content.stepsWithSettings
        let extraction = content.stepsWithExtraction
        return machine.indices.map { index in
            EditableStep(
                text: machine[index].text,
                settings: machine[index].settings,
                extraction: extraction[index].settings
            )
        }
    }

    var body: some View {
        List {
            ChangeSummaryCard(summary: proposal.changeSummary, rationale: proposal.rationale)
            if !ingredients.isEmpty {
                ingredientsSection
            }
            stepsSection
            // Nothing on either side means the recipe has no tips at all: no empty
            // section on a proposal that changes none.
            if !tips.isEmpty || !baseTips.isEmpty {
                tipsSection
            }
        }
        .scrollDismissesKeyboard(.interactively)
        .navigationTitle("Proposition")
        .navigationBarTitleDisplayMode(.inline)
        // "Fermer" = discard the proposal (nothing is persisted); "Valider" = accept.
        // Hiding the back button makes Fermer own the leading slot and disables the
        // back-swipe, so the only exits are an explicit decision.
        .navigationBarBackButtonHidden(true)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button(action: onClose) {
                    Image(systemName: "xmark")
                }
                .disabled(busy)
                .accessibilityIdentifier("close-proposal-button")
                .accessibilityLabel("Fermer")
            }
            ToolbarItemGroup(placement: .topBarTrailing) {
                Button {
                    draftRecipeTitle = suggestedRecipeTitle
                    askingRecipeTitle = true
                } label: {
                    ActionIcon(systemImage: "plus", isRunning: isCreatingRecipe)
                }
                .disabled(busy)
                .accessibilityIdentifier("create-recipe-from-proposal-button")
                .accessibilityLabel("Nouvelle recette")

                Button {
                    onValidate(currentProposal)
                } label: {
                    ActionIcon(systemImage: "checkmark", isRunning: isWorking)
                }
                .disabled(busy)
                .accessibilityIdentifier("validate-proposal-button")
                .accessibilityLabel("Valider")
            }
        }
        .alert("Nouvelle recette", isPresented: $askingRecipeTitle) {
            TextField("Nom de la recette", text: $draftRecipeTitle)
                .accessibilityIdentifier("new-recipe-title-field")
            Button("Créer") {
                let title = draftRecipeTitle.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !title.isEmpty else { return }
                onCreateRecipe(currentProposal, title)
            }
            .accessibilityIdentifier("confirm-new-recipe")
            Button("Annuler", role: .cancel) {}
        } message: {
            Text("Créer une nouvelle recette à partir de cette proposition ?")
        }
    }

    /// Either CTA running locks the screen: the two are exclusive decisions.
    private var busy: Bool { isWorking || isCreatingRecipe }

    // MARK: - Ingredients

    private var ingredientsSection: some View {
        Section("Ingrédients") {
            ForEach($ingredients) { $ingredient in
                HStack {
                    changeDot(ingredientDiffers(ingredient))
                    TextField("Ingrédient", text: $ingredient.name)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .accessibilityIdentifier("edit-ingredient-name")
                    TextField("Quantité", text: $ingredient.quantity)
                        .fixedSize()
                        .multilineTextAlignment(.trailing)
                        .foregroundStyle(.secondary)
                        .accessibilityIdentifier("edit-ingredient-quantity")
                }
            }
        }
    }

    // MARK: - Steps

    /// Same layout as the import preview's step row: a top-aligned gutter (dot,
    /// number) beside the text column, so a wrapped line stays under the first
    /// line of text instead of running back to the row margin.
    private var stepsSection: some View {
        Section("Étapes") {
            ForEach(Array(steps.enumerated()), id: \.element.id) { index, step in
                HStack(alignment: .top, spacing: 12) {
                    changeDot(stepDiffers(step))
                    Text("\(index + 1)")
                        .font(.subheadline.weight(.semibold))
                        .monospacedDigit()
                        .foregroundStyle(.secondary)
                        .frame(minWidth: 20, alignment: .trailing)
                    VStack(alignment: .leading, spacing: 6) {
                        TextField("Étape", text: $steps[index].text, axis: .vertical)
                            .lineLimit(1...6)
                            .accessibilityIdentifier("edit-step")
                        if !step.settings.isEmpty {
                            ThermomixSettingBadges(
                                time: step.settings.time,
                                temperature: step.settings.temperature,
                                speed: step.settings.speed,
                                reverse: step.settings.reverse
                            )
                        }
                        if !step.extraction.isEmpty {
                            CoffeeSettingBadges(
                                grind: step.extraction.grind,
                                water: step.extraction.water,
                                temperature: step.extraction.temperature,
                                time: step.extraction.time,
                                cupYield: step.extraction.cupYield
                            )
                        }
                    }
                }
            }
        }
    }

    // MARK: - Tips

    /// The proposed version's tips, editable like every other row: what the AI kept
    /// from the base version plus the advice it read in the remarks.
    private var tipsSection: some View {
        Section("Conseils") {
            ForEach($tips) { $tip in
                HStack(alignment: .top, spacing: 12) {
                    changeDot(!baseTips.contains(tip.text))
                    TextField("Conseil", text: $tip.text, axis: .vertical)
                        .lineLimit(1...6)
                        .accessibilityIdentifier("edit-tip")
                }
            }
        }
    }

    // MARK: - Diff

    /// The orange dot marking a changed row — same 7 pt token as `StepsList`.
    /// Filled clear (not removed) on an unchanged row so every row keeps the same
    /// leading alignment. It sits in a box one body line tall so that a top-aligned
    /// row centres it on the first line of text.
    private func changeDot(_ changed: Bool) -> some View {
        Circle()
            .fill(changed ? Theme.Status.changed : .clear)
            .frame(width: 7, height: 7)
            .frame(height: bodyLineHeight)
            .accessibilityHidden(true)
    }

    /// An ingredient row differs from the base version when the base has no
    /// ingredient with the exact same name and quantity (new or modified).
    private func ingredientDiffers(_ ingredient: EditableIngredient) -> Bool {
        !baseIngredients.contains { $0.name == ingredient.name && $0.quantity == ingredient.quantity }
    }

    /// A step differs when the base version carries no step with the exact same
    /// text AND the exact same settings — a Thermomix step retimed or reheated, or
    /// a coffee step reground, changes without a word of its text moving. On a
    /// coffee that is the whole point: the one variable that moved is the change.
    private func stepDiffers(_ step: EditableStep) -> Bool {
        if case .coffee = proposal.content {
            return !baseCoffeeSteps.contains(CoffeeStep(text: step.text, settings: step.extraction))
        }
        return !baseSteps.contains(ThermomixStep(text: step.text, settings: step.settings))
    }

    // MARK: - Accepted proposal

    private var currentIngredients: [Ingredient] {
        ingredients.compactMap { row in
            let name = row.name.trimmingCharacters(in: .whitespacesAndNewlines)
            let quantity = row.quantity.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !name.isEmpty, !quantity.isEmpty else { return nil }
            return Ingredient(name: name, quantity: quantity)
        }
    }

    /// The COMPLETE proposal to accept: the AI summary, rationale and `basedOn`
    /// carried through unchanged, the ingredients and steps from the form's current
    /// state. The content arm mirrors the proposal's — each step keeps its own
    /// settings, so there is nothing to re-align.
    private var currentProposal: ProposalEdit {
        // Drop emptied steps; each surviving row already carries its own settings.
        let survivingSteps = steps.compactMap { row -> EditableStep? in
            let text = row.text.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !text.isEmpty else { return nil }
            return EditableStep(text: text, settings: row.settings, extraction: row.extraction)
        }
        let content: VersionContent
        switch proposal.content {
        case .dish:
            content = .dish(ingredients: currentIngredients, steps: survivingSteps.map(\.text))
        case .thermomix:
            content = .thermomix(
                ingredients: currentIngredients,
                steps: survivingSteps.map { ThermomixStep(text: $0.text, settings: $0.settings) }
            )
        case .coffee:
            content = .coffee(
                ingredients: currentIngredients,
                steps: survivingSteps.map { CoffeeStep(text: $0.text, settings: $0.extraction) }
            )
        }

        return ProposalEdit(
            basedOn: proposal.basedOn,
            changeSummary: proposal.changeSummary,
            rationale: proposal.rationale,
            content: content,
            // Emptied tips are dropped, like emptied steps.
            tips: tips.compactMap {
                let text = $0.text.trimmingCharacters(in: .whitespacesAndNewlines)
                return text.isEmpty ? nil : text
            }
        )
    }
}

#if DEBUG
#Preview {
    NavigationStack {
        ProposalPage(
            proposal: Fixtures.proposal,
            nextVersionNumber: 5,
            baseIngredients: Fixtures.bourguignonV4.ingredients,
            baseSteps: Fixtures.bourguignonV4.content.stepsWithSettings,
            baseTips: Fixtures.bourguignonV4.tips,
            isWorking: false,
            suggestedRecipeTitle: Fixtures.bourguignon.title,
            onClose: {},
            onValidate: { _ in },
            onCreateRecipe: { _, _ in }
        )
    }
}
#endif
