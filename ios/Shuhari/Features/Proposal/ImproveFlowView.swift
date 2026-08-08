import SwiftUI

/// The improvement flow: say what you want changed → the AI proposes the next version
/// → accept it. Presented as a half-screen sheet from the recipe sheet's improve CTA,
/// growing to `.large` for the proposal.
///
/// No cook behind it, so nothing is recorded on the version being improved: the
/// version the accepted proposal creates simply lands on the to-cook list. Closing at
/// any point saves nothing.
struct ImproveFlowView: View {
    let recipeId: String
    /// The version being improved on — the one the recipe sheet is showing.
    let version: RecipeVersion
    let nextVersionNumber: Int
    /// The recipe being improved, as the new-recipe route needs it: its name seeds the
    /// title field, its type and course are the ones the new recipe is filed under.
    let recipeTitle: String
    let recipeType: RecipeType
    let category: DishCategory
    let onFinished: () -> Void

    @Environment(\.dismiss) private var dismiss

    @State private var improvement = ""
    @State private var path: [Step] = []
    @State private var detent: PresentationDetent = .medium
    @State private var analyzing = false
    @State private var isAccepting = false
    @State private var isCreatingRecipe = false
    @State private var errorPresenter = ErrorPresenter()
    /// The ephemeral AI proposal, held in memory while the `.proposal` step is shown.
    @State private var proposal: Proposal?

    private enum Step: Hashable { case proposal }

    var body: some View {
        NavigationStack(path: $path) {
            improvementPage
                .navigationDestination(for: Step.self) { _ in proposalPage }
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button { dismiss() } label: {
                            Image(systemName: "xmark")
                        }
                        .accessibilityLabel("Fermer")
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button {
                            Task { await requestImprovement() }
                        } label: {
                            ActionIcon(systemImage: "checkmark", isRunning: analyzing)
                        }
                        .disabled(trimmedImprovement.isEmpty || analyzing)
                        .accessibilityIdentifier("request-improvement-button")
                        .accessibilityLabel("Demander une proposition")
                    }
                }
        }
        .presentationDetents([.medium, .large], selection: $detent)
        .presentationDragIndicator(.visible)
        .overlay { if analyzing { AIThinkingCard(message: "L’IA imagine la prochaine version…") } }
        .errorAlert(errorPresenter)
    }

    private var improvementPage: some View {
        Form {
            Section {
                TextField(
                    "Ex. : version végétarienne, moins sucré, pour 6 personnes…",
                    text: $improvement,
                    axis: .vertical
                )
                .lineLimit(8...20)
                .frame(minHeight: 140, alignment: .top)
                .accessibilityIdentifier("improvement-field")
            }
        }
        .scrollDismissesKeyboard(.interactively)
        .navigationTitle("Amélioration")
        .navigationBarTitleDisplayMode(.inline)
    }

    @ViewBuilder
    private var proposalPage: some View {
        if let proposal {
            ProposalPage(
                proposal: proposal,
                nextVersionNumber: nextVersionNumber,
                baseIngredients: version.ingredients,
                baseSteps: version.content.stepsWithSettings,
                baseTips: version.tips,
                isWorking: isAccepting,
                suggestedRecipeTitle: recipeTitle,
                isCreatingRecipe: isCreatingRecipe,
                onClose: { dismiss() },
                onValidate: { edited in Task { await accept(edited) } },
                onCreateRecipe: { edited, title in
                    Task { await createRecipe(edited, title: title) }
                }
            )
        }
    }

    private var trimmedImprovement: String {
        improvement.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func requestImprovement() async {
        // Grow first so the Siri loader fills the sheet.
        detent = .large
        analyzing = true
        defer { analyzing = false }
        do {
            proposal = try await ProposalAPI.requestImprovement(
                recipeId: recipeId,
                versionNumber: version.number,
                improvement: trimmedImprovement
            )
            path.append(.proposal)
        } catch {
            errorPresenter.message = reportError(error)
        }
    }

    /// The other way out: the proposal becomes the v1 of a recipe of its own, filed
    /// under the same type and course, remembering where it came from as its source.
    /// The recipe it was improved from is left exactly as it was.
    private func createRecipe(_ edited: ProposalEdit, title: String) async {
        isCreatingRecipe = true
        defer { isCreatingRecipe = false }
        do {
            _ = try await RecipeAPI.createRecipe(
                title: title,
                type: recipeType,
                category: category,
                content: edited.content,
                tips: edited.tips,
                sourceLabel: "\(recipeTitle) v\(version.number)"
            )
            onFinished()
            dismiss()
        } catch {
            errorPresenter.message = reportError(error)
        }
    }

    /// Accepting creates the version — with no attempt on it, so it is one to test.
    private func accept(_ edited: ProposalEdit) async {
        isAccepting = true
        defer { isAccepting = false }
        do {
            try await ProposalAPI.accept(recipeId: recipeId, proposal: edited, attempt: nil)
            onFinished()
            dismiss()
        } catch {
            errorPresenter.message = reportError(error)
        }
    }
}

#if DEBUG
#Preview {
    Color.clear
        .sheet(isPresented: .constant(true)) {
            ImproveFlowView(
                recipeId: Fixtures.bourguignon.id,
                version: Fixtures.bourguignonV4,
                nextVersionNumber: 5,
                recipeTitle: Fixtures.bourguignon.title,
                recipeType: Fixtures.bourguignon.type,
                category: Fixtures.bourguignon.category,
                onFinished: {}
            )
        }
}
#endif
