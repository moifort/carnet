import SwiftUI

/// The single flow behind the recipe sheet's play CTA: capture → what the form says
/// → next step. One page collects everything the cook has to say about the displayed
/// version — the note, the remark, the photo, the tips — and what is filled decides
/// where it goes, at most one AI request per validation:
///
/// - **the note alone** is a cook that asks for nothing: it is recorded on the version
///   shown, and the flow ends;
/// - **a remark** asks the AI for the next version to try, and the version it creates
///   lands on the to-cook list — it has not been made yet. Rated, the cook rides along
///   and is recorded, on accept, on the version shown: the one that was actually made.
///   Unrated, it is an improvement asked with no cook behind it and nothing is
///   recorded. Tips typed beside the remark are carried into the proposed version,
///   where they stay editable;
/// - **tips alone** are reworded and merged into the displayed version's own — in
///   place, no version created. A note typed with them is recorded first, on its own.
///
/// Nothing is saved before the proposal is accepted: closing it saves nothing.
///
/// Presented as a `.sheet` from the recipe sheet — the sheet already shows the recipe,
/// so the flow opens straight on the capture. On completion it dismisses and asks the
/// caller to refresh.
struct ExecuteFlowView: View {
    let request: ExecutionRequest
    let onFinished: () -> Void

    @Environment(\.dismiss) private var dismiss

    @State private var recipe: Recipe?
    @State private var loadError: String?

    @State private var path: [Step] = []
    @State private var isSaving = false
    /// What the AI is doing, while it is doing it — nil when nothing is running.
    @State private var thinking: String?
    /// Opens on the capture height, grows to `.large` for whichever proposal follows.
    @State private var detent: PresentationDetent = Self.capture
    @State private var errorPresenter = ErrorPresenter()
    /// The ephemeral AI proposal, held in memory while the `.proposal` step is shown.
    @State private var proposal: Proposal?
    /// The ephemeral merged tips list, held in memory while the `.tips` step is shown.
    @State private var proposedTips: [String] = []
    @State private var isSavingTips = false
    /// The cook that asked for that proposal — held here, unwritten, until the
    /// proposal is accepted and it lands on the version it created. Nil when the
    /// remark was written with no note: there is no cook to carry.
    @State private var pendingAttempt: Attempt?
    /// What the coffee form suggests. Loaded alongside the proposal, and left empty
    /// on anything that is not a coffee — or if the load fails, which costs
    /// suggestions and nothing else.
    @State private var vocabulary: CoffeeVocabulary = .empty
    @State private var isAcceptingProposal = false
    @State private var isCreatingRecipe = false

    /// The capture is the root; whichever proposal the form asked for follows it.
    private enum Step: Hashable { case proposal, tips }

    /// The height the form opens at — 70% of the screen: the note, the remark with
    /// its photos and the tips field are all in view (the last footer takes a nudge
    /// of scroll), while the recipe still shows behind. Neither stock detent does
    /// that: `.medium` opens on the remark alone, `.large` covers the recipe the
    /// form is talking about.
    private static let capture = PresentationDetent.fraction(0.7)

    var body: some View {
        flow
            .presentationDetents([Self.capture, .large], selection: $detent)
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
        .overlay { if let thinking { AIThinkingCard(message: thinking) } }
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
                // A coffee is proposed as dials, not as gestures: its own page,
                // where every parameter — the moved one and the empty ones — is
                // editable before the version exists.
                if let parameters = proposal.content.coffeeParameters {
                    CoffeeProposalPage(
                        proposal: proposal,
                        nextVersionNumber: recipe.nextVersionNumber,
                        baseParameters: base?.content.coffeeParameters ?? parameters,
                        baseTips: base?.tips ?? [],
                        vocabulary: vocabulary,
                        isWorking: isAcceptingProposal,
                        suggestedRecipeTitle: recipe.title,
                        isCreatingRecipe: isCreatingRecipe,
                        onClose: { finish() },
                        onValidate: { edited in Task { await acceptProposal(edited) } },
                        onCreateRecipe: { edited, title in
                            Task { await createRecipe(edited, title: title, from: recipe) }
                        }
                    )
                } else {
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
        case .tips:
            TipsProposalPage(
                proposedTips: proposedTips,
                baseTips: recipe.version(request.versionNumber)?.tips ?? [],
                isWorking: isSavingTips,
                onClose: { finish() },
                onValidate: { edited in Task { await saveTips(edited) } }
            )
        }
    }

    private var captureScreen: some View {
        CapturePage(isSaving: isSaving) { rating, remarks, tips, photo in
            Task { await submit(rating: rating, remarks: remarks, tips: tips, photo: photo) }
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

    /// The one router of the flow: what the form says decides what is asked, and a
    /// remark outranks tips — asking for the next version is the bigger move, and the
    /// tips typed with it travel into that version rather than costing a second call.
    private func submit(rating: Int?, remarks: String, tips: String, photo: String?) async {
        if !remarks.isEmpty {
            await requestNextVersion(rating: rating, remarks: remarks, tips: tips, photo: photo)
        } else if !tips.isEmpty {
            await requestTips(rating: rating, tips: tips, photo: photo)
        } else if let rating {
            if await recordAttempt(rating: rating, photo: photo) { finish() }
        }
    }

    // A written remark is the request to iterate: nothing is recorded here, the cook
    // rides along to the proposal and lands on the version it creates. Unrated, the
    // remark is an improvement asked with no cook behind it — same ephemeral proposal,
    // nothing to carry.
    private func requestNextVersion(rating: Int?, remarks: String, tips: String, photo: String?) async {
        pendingAttempt = rating.map { Attempt(rating: $0, remarks: remarks, photoBase64: photo) }
        // Grow first so the Siri loader fills the sheet.
        detent = .large
        thinking = "L’IA imagine la prochaine version…"
        defer { thinking = nil }
        do {
            var next: Proposal
            if let rating {
                next = try await ExecutionAPI.requestProposal(
                    recipeId: request.recipeId,
                    versionNumber: request.versionNumber,
                    rating: rating,
                    remarks: remarks
                )
            } else {
                next = try await ProposalAPI.requestImprovement(
                    recipeId: request.recipeId,
                    versionNumber: request.versionNumber,
                    improvement: remarks
                )
            }
            // Advice typed beside the remark is not a change to make: it joins the
            // tips of the version being proposed, verbatim and editable there.
            if !tips.isEmpty {
                next.tips.append(tips)
            }
            proposal = next
            if next.content.coffeeParameters != nil {
                vocabulary = (try? await RecipeAPI.coffeeVocabulary()) ?? .empty
            }
            path.append(.proposal)
        } catch {
            errorPresenter.message = reportError(error)
        }
    }

    // Tips with no remark ask for nothing new: the AI rewords and merges them into the
    // displayed version's own. A note typed with them is a cook of its own and is
    // written first — the tips proposal that follows can be closed without losing it.
    private func requestTips(rating: Int?, tips: String, photo: String?) async {
        if let rating {
            guard await recordAttempt(rating: rating, photo: photo) else { return }
        }
        // Grow first so the Siri loader fills the sheet.
        detent = .large
        thinking = "L’IA met en forme vos conseils…"
        defer { thinking = nil }
        do {
            proposedTips = try await ProposalAPI.requestTips(
                recipeId: request.recipeId,
                versionNumber: request.versionNumber,
                tips: tips
            )
            path.append(.tips)
        } catch {
            errorPresenter.message = reportError(error)
        }
    }

    /// Accepting replaces the displayed version's tips — no version is created.
    private func saveTips(_ tips: [String]) async {
        isSavingTips = true
        defer { isSavingTips = false }
        do {
            try await ProposalAPI.updateTips(
                recipeId: request.recipeId,
                versionNumber: request.versionNumber,
                tips: tips
            )
            finish()
        } catch {
            errorPresenter.message = reportError(error)
        }
    }

    /// Write the cook on the version shown. Answers whether it went through, so a
    /// caller with more to do stops on a failure the error alert already reports.
    private func recordAttempt(rating: Int, photo: String?) async -> Bool {
        isSaving = true
        defer { isSaving = false }
        do {
            try await ExecutionAPI.recordAttempt(
                recipeId: request.recipeId,
                versionNumber: request.versionNumber,
                rating: rating,
                photoBase64: photo
            )
            return true
        } catch {
            errorPresenter.message = reportError(error)
            return false
        }
    }

    // Accepting is what writes the cook down: it lands on the version it was made on —
    // the one this iterates from — while the version created is one to test, since
    // nobody has made it. Closing the proposal instead records nothing at all, and a
    // remark written with no note behind it carries no cook to write.
    private func acceptProposal(_ edited: ProposalEdit) async {
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
