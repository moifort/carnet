import SwiftUI

/// The single flow behind the recipe sheet's play CTA: capture → what the form says
/// → next step. One page collects everything the cook has to say about the displayed
/// version — the note, the remark, the photo, the tips — and what is filled decides
/// where it goes, at most one AI request per validation:
///
/// - **the note alone** is a cook that asks for nothing: it is recorded on the version
///   shown, and the flow ends;
/// - **a change** is a version that already exists: the cook modified the recipe at the
///   stove and ate the result, so the AI writes it down — it applies exactly what was
///   described and improves nothing — and accepting it creates a version already cooked,
///   never one to test. The note, the photo and the remarks land on IT: it is the plate
///   that was made. A remark typed beside it is the improvement to ask for NEXT, so it
///   chains a second proposal, this time from the version just written;
/// - **a remark** asks the AI for the next version to try, and the version it creates
///   lands on the to-cook list — it has not been made yet. Rated, the cook rides along
///   and is recorded, on accept, on the version shown: the one that was actually made.
///   Unrated, it is an improvement asked with no cook behind it and nothing is
///   recorded. Tips typed beside the remark are carried into the proposed version,
///   where they stay editable;
/// - **tips alone** are reworded and merged into the displayed version's own — in
///   place, no version created. A note typed with them is recorded first, on its own.
///
/// Nothing is saved before the proposal is accepted: closing it saves nothing, and
/// puts the capture back exactly as it was left — the remark can be reworded and
/// asked again (a new AI call, and a new one off the monthly allowance). The cook
/// that a tips proposal wrote first is not written twice.
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
    /// Whether the cook has already been written on the displayed version. A closed
    /// proposal comes back to the capture, and a second validation must not write
    /// the same cook twice — there is one cook per run of the flow.
    @State private var attemptRecorded = false
    /// Whether the proposal on screen transcribes a change the cook already made and
    /// already ate — accepted, it is saved as a version that has been cooked.
    @State private var proposalIsCooked = false
    /// What the capture still owes once that change is written down: the improvement
    /// to ask for, and the cook it is read against. Nil when there is nothing to
    /// chain, and cleared as soon as it is asked — a capture is spent once.
    @State private var chained: CapturePage.Capture?
    /// A version has been written by this run of the flow. Closing whatever proposal
    /// follows then ends the flow instead of coming back to the capture: the form
    /// that produced it has been honoured, and re-validating it would write it twice.
    @State private var versionCreated = false
    /// The proposal on screen has been accepted. It only stays on screen when what
    /// was to follow it never arrived (a chained request that failed, quota included):
    /// validating it a second time must not write the same version twice.
    @State private var proposalAccepted = false
    /// Bumped for every proposal put on screen. It is the identity of the proposal
    /// page, so a second proposal replaces the first with its own editable state
    /// instead of reusing the rows of the one before it.
    @State private var proposalGeneration = 0

    /// The capture is the root; whichever proposal the form asked for follows it.
    private enum Step: Hashable { case proposal, tips }

    /// The height the form opens at — 70% of the screen: the note, the change and the
    /// remark with its photos are in view, the tips a scroll below, while the recipe
    /// still shows behind. Neither stock detent does that: `.medium` opens on the
    /// change alone, `.large` covers the recipe the form is talking about.
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
                        onClose: { discardProposal() },
                        onValidate: { edited in Task { await acceptProposal(edited) } },
                        onCreateRecipe: { edited, title in
                            Task { await createRecipe(edited, title: title, from: recipe) }
                        }
                    )
                    .id(proposalGeneration)
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
                        onClose: { discardProposal() },
                        onValidate: { edited in Task { await acceptProposal(edited) } },
                        onCreateRecipe: { edited, title in
                            Task { await createRecipe(edited, title: title, from: recipe) }
                        }
                    )
                    .id(proposalGeneration)
                }
            }
        case .tips:
            TipsProposalPage(
                proposedTips: proposedTips,
                baseTips: recipe.version(request.versionNumber)?.tips ?? [],
                isWorking: isSavingTips,
                onClose: { discardProposal() },
                onValidate: { edited in Task { await saveTips(edited) } }
            )
        }
    }

    private var captureScreen: some View {
        CapturePage(isSaving: isSaving) { capture in
            Task { await submit(capture) }
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

    /// The one router of the flow: what the form says decides what is asked. A change
    /// outranks everything — it says a version EXISTS, which has to be written down
    /// before anything can iterate on it — then a remark outranks tips, since asking
    /// for the next version is the bigger move and the tips typed with it travel into
    /// that version rather than costing a second call.
    private func submit(_ capture: CapturePage.Capture) async {
        if !capture.change.isEmpty {
            await writeDownChange(capture)
        } else if !capture.remarks.isEmpty {
            await requestNextVersion(
                rating: capture.rating,
                remarks: capture.remarks,
                tips: capture.tips,
                photo: capture.photoBase64
            )
        } else if !capture.tips.isEmpty {
            await requestTips(rating: capture.rating, tips: capture.tips, photo: capture.photoBase64)
        } else if let rating = capture.rating {
            if await recordAttempt(rating: rating, photo: capture.photoBase64) { finish() }
        }
    }

    // A change is not a request: the cook made it at the stove and ate the result, so
    // the AI only writes it down — the version it transcribes has been cooked, and the
    // note, the photo and the remarks are the verdict on IT, not on the version shown.
    // An improvement typed beside it is held back for after: it iterates on the
    // version being written, which does not exist yet.
    private func writeDownChange(_ capture: CapturePage.Capture) async {
        pendingAttempt = capture.rating.map {
            Attempt(rating: $0, remarks: capture.remarks, photoBase64: capture.photoBase64)
        }
        chained = capture.remarks.isEmpty ? nil : capture
        proposalIsCooked = true
        // Grow first so the Siri loader fills the sheet.
        detent = .large
        thinking = "L’IA écrit votre version…"
        defer { thinking = nil }
        do {
            var next = try await ProposalAPI.requestChange(
                recipeId: request.recipeId,
                versionNumber: request.versionNumber,
                change: capture.change
            )
            // Advice typed beside the change belongs to the version it describes.
            if !capture.tips.isEmpty {
                next.tips.append(capture.tips)
            }
            await show(next)
        } catch {
            errorPresenter.message = reportError(error)
        }
    }

    // The second half of a capture carrying both: the version just written down is
    // what the improvement iterates on, so the recipe is reloaded — it now holds it —
    // before asking. The cook has already been recorded on it, which is why the
    // proposal that comes back carries nothing to write.
    private func chainImprovement(_ capture: CapturePage.Capture, from versionNumber: Int) async {
        chained = nil
        thinking = "L’IA imagine la prochaine version…"
        defer { thinking = nil }
        do {
            recipe = try await RecipeAPI.getRecipe(id: request.recipeId)
            let next =
                if let rating = capture.rating {
                    try await ExecutionAPI.requestProposal(
                        recipeId: request.recipeId,
                        versionNumber: versionNumber,
                        rating: rating,
                        remarks: capture.remarks
                    )
                } else {
                    try await ProposalAPI.requestImprovement(
                        recipeId: request.recipeId,
                        versionNumber: versionNumber,
                        improvement: capture.remarks
                    )
                }
            await show(next)
        } catch {
            errorPresenter.message = reportError(error)
        }
    }

    /// Put a proposal on screen, with the coffee vocabulary its form needs. Its own
    /// generation, so one replacing another is a page of its own rather than the
    /// previous one's editable rows filled with new text.
    private func show(_ next: Proposal) async {
        proposal = next
        proposalAccepted = false
        if next.content.coffeeParameters != nil {
            vocabulary = (try? await RecipeAPI.coffeeVocabulary()) ?? .empty
        }
        proposalGeneration += 1
        if path.isEmpty { path.append(.proposal) }
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
            await show(next)
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
    /// Already written — the tips proposal it preceded was closed and validated
    /// again — it is not written a second time: a cook is an event, not a form.
    private func recordAttempt(rating: Int, photo: String?) async -> Bool {
        guard !attemptRecorded else { return true }
        isSaving = true
        defer { isSaving = false }
        do {
            try await ExecutionAPI.recordAttempt(
                recipeId: request.recipeId,
                versionNumber: request.versionNumber,
                rating: rating,
                photoBase64: photo
            )
            attemptRecorded = true
            return true
        } catch {
            errorPresenter.message = reportError(error)
            return false
        }
    }

    // Accepting is what writes the cook down. On a proposal, it lands on the version
    // it was made on — the one this iterates from — while the version created is one
    // to test, since nobody has made it. On a change, the version created IS the one
    // that was made: it is saved cooked and takes the verdict itself. Closing the
    // proposal instead records nothing at all, and a remark written with no note
    // behind it carries no cook to write.
    //
    // A change that came with an improvement chains straight into it, from the
    // version just written rather than from the one on screen: what is asked to be
    // improved is what was eaten.
    private func acceptProposal(_ edited: ProposalEdit) async {
        // Already written, and still on screen because what was to follow it failed:
        // the way out of it is Fermer.
        guard !proposalAccepted else { return finish() }
        isAcceptingProposal = true
        defer { isAcceptingProposal = false }
        do {
            let created = try await ProposalAPI.accept(
                recipeId: request.recipeId,
                proposal: edited,
                attempt: pendingAttempt,
                cooked: proposalIsCooked
            )
            versionCreated = true
            proposalAccepted = true
            // The cook is an event: written once, on the version it was eaten on,
            // and never carried into whatever is asked next.
            pendingAttempt = nil
            attemptRecorded = true
            guard proposalIsCooked, let chained, let created else { return finish() }
            proposalIsCooked = false
            await chainImprovement(chained, from: created)
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

    /// Closing a proposal is a step back, not a way out of the flow: the ephemeral
    /// proposal is dropped and the capture comes back, still holding the note, the
    /// remark, the photo and the tips that were typed — reword and ask again. The
    /// flow's own Fermer is what leaves.
    ///
    /// Unless this run already wrote a version down: the form has been honoured, and
    /// coming back to it with the same text still in place would invite writing it
    /// twice. Closing then ends the flow, leaving what was created in place.
    private func discardProposal() {
        guard !versionCreated else { return finish() }
        path = []
        detent = Self.capture
        proposal = nil
        proposedTips = []
        pendingAttempt = nil
        proposalIsCooked = false
        chained = nil
    }

    private func finish() {
        onFinished()
        dismiss()
    }
}
