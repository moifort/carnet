import SwiftUI

/// The AI proposal screen for a coffee: what moved and why, then the FULL proposed
/// next version as an **editable** parameters form — every field, including the ones
/// the model left empty. The dial it moved carries a `Theme.Status.changed` dot, so
/// the one-variable rule is visible rather than merely promised.
///
/// Editable end to end on purpose: the model proposes the field, never a value it
/// was not told, so a temperature nobody logged arrives blank and is the cook's to
/// fill in — here, before the version exists.
///
/// The proposal is ephemeral (never persisted): "Fermer" discards it, "Valider"
/// accepts it, and on accept the page emits the COMPLETE version (the `basedOn`,
/// summary and rationale carried through, the parameters and tips from the form's
/// current state). "Nouvelle recette" saves it as the v1 of a coffee of its own
/// instead — the change went far enough that it is another cup.
struct CoffeeProposalPage: View {
    let proposal: Proposal
    let nextVersionNumber: Int
    /// The dials this proposal iterates from — what the changed dots compare to.
    let baseParameters: CoffeeParameters
    /// The base version's tips, to mark what the proposal changes.
    let baseTips: [String]
    /// What each free-text field suggests, most recent first.
    var vocabulary: CoffeeVocabulary = .empty
    let isWorking: Bool
    /// What the new-recipe field opens on — the title of the coffee this proposal
    /// iterates on, the cook renames it from there.
    let suggestedRecipeTitle: String
    let isCreatingRecipe: Bool
    let onClose: () -> Void
    let onValidate: (_ edited: ProposalEdit) -> Void
    let onCreateRecipe: (_ edited: ProposalEdit, _ title: String) -> Void

    private struct EditableTip: Identifiable {
        let id = UUID()
        var text: String
    }

    @State private var draft: CoffeeParametersDraft
    @State private var tips: [EditableTip]
    /// The new-recipe title being typed, seeded from `suggestedRecipeTitle` each
    /// time the prompt opens.
    @State private var draftRecipeTitle = ""
    @State private var askingRecipeTitle = false
    @ScaledMetric(relativeTo: .body) private var bodyLineHeight: CGFloat = 20.5

    init(
        proposal: Proposal,
        nextVersionNumber: Int,
        baseParameters: CoffeeParameters,
        baseTips: [String] = [],
        vocabulary: CoffeeVocabulary = .empty,
        isWorking: Bool,
        suggestedRecipeTitle: String,
        isCreatingRecipe: Bool = false,
        onClose: @escaping () -> Void,
        onValidate: @escaping (_ edited: ProposalEdit) -> Void,
        onCreateRecipe: @escaping (_ edited: ProposalEdit, _ title: String) -> Void
    ) {
        self.proposal = proposal
        self.nextVersionNumber = nextVersionNumber
        self.baseParameters = baseParameters
        self.baseTips = baseTips
        self.vocabulary = vocabulary
        self.isWorking = isWorking
        self.suggestedRecipeTitle = suggestedRecipeTitle
        self.isCreatingRecipe = isCreatingRecipe
        self.onClose = onClose
        self.onValidate = onValidate
        self.onCreateRecipe = onCreateRecipe
        _draft = State(
            initialValue: CoffeeParametersDraft(proposal.content.coffeeParameters ?? .empty)
        )
        _tips = State(initialValue: proposal.tips.map { EditableTip(text: $0) })
    }

    var body: some View {
        Form {
            ChangeSummaryCard(summary: proposal.changeSummary, rationale: proposal.rationale)
            CoffeeParametersForm(
                draft: $draft,
                vocabulary: vocabulary,
                changedFrom: baseParameters
            )
            // Nothing on either side means the coffee has no tips at all: no empty
            // section on a proposal that changes none.
            if !tips.isEmpty || !baseTips.isEmpty {
                tipsSection
            }
        }
        .scrollDismissesKeyboard(.interactively)
        .navigationTitle("Proposition")
        .navigationBarTitleDisplayMode(.inline)
        // "Fermer" = discard the proposal (nothing is persisted); "Valider" =
        // accept. Hiding the back button makes Fermer own the leading slot and
        // disables the back-swipe, so the only exits are an explicit decision.
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
        .alert("Nouveau café", isPresented: $askingRecipeTitle) {
            TextField("Nom du café", text: $draftRecipeTitle)
                .accessibilityIdentifier("new-recipe-title-field")
            Button("Créer") {
                let title = draftRecipeTitle.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !title.isEmpty else { return }
                onCreateRecipe(currentProposal, title)
            }
            .accessibilityIdentifier("confirm-new-recipe")
            Button("Annuler", role: .cancel) {}
        } message: {
            Text("Créer un nouveau café à partir de cette proposition ?")
        }
    }

    /// Either CTA running locks the screen: the two are exclusive decisions.
    private var busy: Bool { isWorking || isCreatingRecipe }

    /// The proposed version's tips, editable like every parameter: what the AI kept
    /// from the base version plus the advice it read in the remarks.
    private var tipsSection: some View {
        Section("Conseils") {
            ForEach($tips) { $tip in
                HStack(alignment: .top, spacing: 12) {
                    Circle()
                        .fill(baseTips.contains(tip.text) ? .clear : Theme.Status.changed)
                        .frame(width: 7, height: 7)
                        .frame(height: bodyLineHeight)
                        .accessibilityHidden(true)
                    TextField("Conseil", text: $tip.text, axis: .vertical)
                        .lineLimit(1...6)
                        .accessibilityIdentifier("edit-tip")
                }
            }
        }
    }

    /// The COMPLETE version to accept: the AI summary, rationale and `basedOn`
    /// carried through unchanged, the dials and tips from the form's current state —
    /// what the cook corrected wins over what the model proposed.
    private var currentProposal: ProposalEdit {
        ProposalEdit(
            basedOn: proposal.basedOn,
            changeSummary: proposal.changeSummary,
            rationale: proposal.rationale,
            content: .coffee(parameters: draft.parameters),
            // Emptied tips are dropped.
            tips: tips.compactMap {
                let text = $0.text.trimmingCharacters(in: .whitespacesAndNewlines)
                return text.isEmpty ? nil : text
            }
        )
    }
}

#if DEBUG
#Preview("Une seule variable déplacée") {
    NavigationStack {
        CoffeeProposalPage(
            proposal: Fixtures.proposalCoffee,
            nextVersionNumber: 3,
            baseParameters: Fixtures.v60V2.content.coffeeParameters ?? .empty,
            baseTips: Fixtures.v60V2.tips,
            vocabulary: Fixtures.coffeeVocabulary,
            isWorking: false,
            suggestedRecipeTitle: Fixtures.v60.title,
            onClose: {},
            onValidate: { _ in },
            onCreateRecipe: { _, _ in }
        )
    }
}
#endif
