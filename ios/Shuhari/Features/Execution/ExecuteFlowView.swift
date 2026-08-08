import SwiftUI

/// The execution flow: capture → record → next step.
///
/// Where the cook lands depends on the remark. A blank remark asks for nothing: the
/// rating (and photo) is recorded on the version cooked, and the flow ends. A written
/// remark asks the AI for the next version to try, and the cook goes with it — it is
/// recorded on the version the accepted proposal creates, leaving the version cooked
/// untouched. Nothing is saved before that: closing the proposal saves nothing.
///
/// Presented as a half-screen `.sheet` from the recipe sheet's record CTA — the sheet
/// already shows the recipe, so the flow opens straight on the attempt capture. On
/// completion it dismisses and asks the caller to refresh.
struct ExecuteFlowView: View {
    let request: ExecutionRequest
    let onFinished: () -> Void

    @Environment(\.dismiss) private var dismiss

    @State private var recipe: Recipe?
    @State private var loadError: String?

    @State private var path: [Step] = []
    @State private var isSaving = false
    @State private var analyzing = false
    @State private var detent: PresentationDetent = .medium
    @State private var errorPresenter = ErrorPresenter()
    /// The ephemeral AI proposal, held in memory while the `.proposal` step is shown.
    @State private var proposal: Proposal?
    /// The cook that asked for that proposal — held here, unwritten, until the
    /// proposal is accepted and it lands on the version it created.
    @State private var pendingAttempt: Attempt?
    @State private var isAcceptingProposal = false
    @State private var isCreatingRecipe = false

    /// The only push the flow makes: the capture is the root, the proposal follows it.
    private enum Step: Hashable { case proposal }

    var body: some View {
        flow
            .presentationDetents([.medium, .large], selection: $detent)
            .presentationDragIndicator(.visible)
    }

    private var flow: some View {
        NavigationStack(path: $path) {
            Group {
                if let recipe, recipe.version(request.versionNumber) != nil {
                    captureScreen
                        .navigationDestination(for: Step.self) { step in
                            destination(step, recipe: recipe)
                        }
                } else if let loadError {
                    ContentUnavailableView("Erreur", systemImage: "exclamationmark.triangle", description: Text(loadError))
                } else {
                    ProgressView()
                }
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { finish() } label: {
                        Image(systemName: "xmark")
                    }
                    .accessibilityLabel("Fermer")
                }
            }
        }
        .task { await load() }
        .overlay { if analyzing { AIThinkingCard(message: "L’IA analyse tes remarques…") } }
        .errorAlert(errorPresenter)
    }

    @ViewBuilder
    private func destination(_ step: Step, recipe: Recipe) -> some View {
        switch step {
        case .proposal:
            if let proposal {
                // The ephemeral AI proposal is already in memory (from `save`);
                // show it directly against the recipe already loaded — no extra
                // fetch. The base is the version it iterates on (`basedOn`).
                let base = recipe.version(proposal.basedOn)
                ProposalPage(
                    proposal: proposal,
                    nextVersionNumber: recipe.nextVersionNumber,
                    baseIngredients: base?.ingredients ?? [],
                    baseSteps: base?.content.stepsWithSettings ?? [],
                    baseTips: base?.tips ?? [],
                    isWorking: isAcceptingProposal,
                    suggestedRecipeTitle: recipe.title,
                    isCreatingRecipe: isCreatingRecipe,
                    onClose: { finish() },
                    onValidate: { edited in Task { await acceptProposal(edited) } },
                    onCreateRecipe: { edited, title in
                        Task { await createRecipe(edited, title: title, from: recipe) }
                    }
                )
            }
        }
    }

    private var captureScreen: some View {
        CapturePage(isSaving: isSaving) { rating, remarks, photo in
            Task { await save(rating: rating, remarks: remarks, photo: photo) }
        }
    }

    // MARK: - Actions

    private func load() async {
        guard recipe == nil else { return }
        do {
            recipe = try await RecipeAPI.getRecipe(id: request.recipeId)
        } catch {
            loadError = reportError(error)
        }
    }

    // A written remark is the request to iterate: nothing is recorded here, the cook
    // rides along to the proposal and lands on the version it creates. A blank remark
    // is a cook that asks for nothing — it goes straight onto the version cooked.
    private func save(rating: Int, remarks: String, photo: String?) async {
        guard !remarks.isEmpty else {
            await recordBareAttempt(rating: rating, photo: photo)
            return
        }
        pendingAttempt = Attempt(rating: rating, remarks: remarks, photoBase64: photo)
        // Grow first so the Siri loader fills the sheet.
        detent = .large
        analyzing = true
        defer { analyzing = false }
        do {
            proposal = try await ExecutionAPI.requestProposal(
                recipeId: request.recipeId,
                versionNumber: request.versionNumber,
                rating: rating,
                remarks: remarks
            )
            path.append(.proposal)
        } catch {
            errorPresenter.message = reportError(error)
        }
    }

    private func recordBareAttempt(rating: Int, photo: String?) async {
        isSaving = true
        defer { isSaving = false }
        do {
            try await ExecutionAPI.recordAttempt(
                recipeId: request.recipeId,
                versionNumber: request.versionNumber,
                rating: rating,
                photoBase64: photo
            )
            finish()
        } catch {
            errorPresenter.message = reportError(error)
        }
    }

    // Accepting is what writes the cook down: it lands on the version being created,
    // and the version it iterates on stays as it was. Closing the proposal instead
    // records nothing at all.
    private func acceptProposal(_ edited: ProposalEdit) async {
        // Always set: the `.proposal` step is only ever reached through `save` with
        // remarks, which stores the cook before asking the AI.
        guard let pendingAttempt else { return }
        isAcceptingProposal = true
        defer { isAcceptingProposal = false }
        do {
            try await ProposalAPI.accept(
                recipeId: request.recipeId,
                proposal: edited,
                attempt: pendingAttempt
            )
            finish()
        } catch {
            errorPresenter.message = reportError(error)
        }
    }

    // The proposal saved as a recipe of its own instead of the next version of this
    // one: same type and course, the version it was proposed from as its source. The
    // cook that asked for it is dropped — it has no version here to land on, exactly
    // as closing the proposal drops it.
    private func createRecipe(_ edited: ProposalEdit, title: String, from recipe: Recipe) async {
        isCreatingRecipe = true
        defer { isCreatingRecipe = false }
        do {
            _ = try await RecipeAPI.createRecipe(
                title: title,
                type: recipe.type,
                category: recipe.category,
                content: edited.content,
                tips: edited.tips,
                sourceLabel: "\(recipe.title) v\(edited.basedOn)"
            )
            finish()
        } catch {
            errorPresenter.message = reportError(error)
        }
    }

    private func finish() {
        onFinished()
        dismiss()
    }
}
