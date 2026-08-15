import PhotosUI
import SwiftUI

/// What the user handed us to import. Resolved to an `ImportAPI.Source` inside
/// the sheet's task so the sheet can appear *immediately* (showing the AI loader)
/// while a photo is still being read/encoded — nothing lingers over the camera.
enum ImportInput {
    case library(PhotosPickerItem)
    case capture(Data)
    /// What the composer assembled when it holds at least one photo: the photos
    /// (already loaded) plus the text typed alongside them, which may be empty.
    /// Text with no photo resolves to `.source` in the composer, where a lone link
    /// is still routed to the AI web search.
    case composed(photos: [Data], text: String)
    case source(ImportAPI.Source)   // text / link, already resolved
}

struct ImportJob: Identifiable {
    let id = UUID()
    let input: ImportInput
    /// Which notebook this import is for — the tab it was launched from, not a
    /// guess about the source.
    let flow: ImportFlow
}

/// What the composer held, so that closing the analysis can put it back exactly as
/// it was left. It is rebuilt from the input being analysed rather than kept alive
/// beside the review sheet: the import already carries everything that was typed.
struct ImportDraft {
    let photos: [Data]
    let text: String
}

extension ImportInput {
    /// The composer this import came from, when it came from one. A photo shot or
    /// picked straight from the camera screen never went through it — there is
    /// nothing to restore, the camera itself is what it came from.
    var draft: ImportDraft? {
        switch self {
        case .composed(let photos, let text):
            return ImportDraft(photos: photos, text: text)
        case .source(.text(let text)):
            return ImportDraft(photos: [], text: text)
        case .source(.url(let url)):
            return ImportDraft(photos: [], text: url)
        case .source(.photos), .capture, .library:
            return nil
        }
    }
}

/// The opaque sheet presented over the camera: runs the AI analysis (glowing
/// loader), then hands off to the editable `ImportPreviewPage`, and creates the
/// recipe on Valider. Fermer / failure "close" drops the analysis and hands the
/// import back to where it was typed — the caller reopens the composer on this
/// job's `draft`.
struct ImportReviewSheet: View {
    let input: ImportInput
    /// Which flow reads the source: the coffee one (dials) or the cooking one
    /// (ingredients and steps). Decided by the tab, never by the source.
    let flow: ImportFlow
    /// Success → create the recipe and route the tab (dismisses the whole cover).
    let onCreated: (String) -> Void
    /// Fermer / analysis-failure close → drop the analysis and go back to the
    /// screen the import was typed on. Nothing was created.
    let onCancel: () -> Void

    enum Phase: Equatable {
        case analyzing
        case cookingForm(CookingImportAnalysis)
        case coffeeForm(CoffeeImportAnalysis, CoffeeVocabulary)
        case failed
        case nothingFound
        case quotaExhausted
        case premiumRequired
    }

    @Environment(SubscriptionStore.self) private var subscription
    @State private var phase: Phase = .analyzing
    @State private var isSaving = false
    @State private var showPremium = false
    @State private var errorPresenter = ErrorPresenter()
    // A frozen sheet renders its initial phase and never runs the analysis —
    // keeps every phase previewable in the gallery without a server.
    private let frozen: Bool

    init(
        input: ImportInput,
        flow: ImportFlow,
        onCreated: @escaping (String) -> Void,
        onCancel: @escaping () -> Void
    ) {
        self.input = input
        self.flow = flow
        self.onCreated = onCreated
        self.onCancel = onCancel
        frozen = false
    }

    #if DEBUG
    /// Gallery/preview entry: show a phase frozen, with inert callbacks.
    init(galleryPhase: Phase) {
        input = .source(.text(""))
        flow = .cooking
        onCreated = { _ in }
        onCancel = {}
        _phase = State(initialValue: galleryPhase)
        frozen = true
    }
    #endif

    var body: some View {
        NavigationStack {
            // A stable ZStack root keeps NavigationStack from hard-swapping its
            // root view — the children crossfade instead of hard-cutting when the
            // analysis resolves (loader → form, or → error state).
            ZStack {
                switch phase {
                case .analyzing:
                    analyzingView
                        .transition(.opacity)
                case .cookingForm(let analysis):
                    ImportPreviewPage(analysis: analysis, isSaving: isSaving, onCancel: onCancel) { edited in
                        Task { await saveCooking(edited) }
                    }
                    .transition(.opacity)
                case .coffeeForm(let analysis, let vocabulary):
                    CoffeeImportPreviewPage(
                        analysis: analysis,
                        vocabulary: vocabulary,
                        isSaving: isSaving,
                        onCancel: onCancel
                    ) { edited in
                        Task { await saveCoffee(edited) }
                    }
                    .transition(.opacity)
                case .failed:
                    failedView
                        .transition(.opacity)
                case .nothingFound:
                    nothingFoundView
                        .transition(.opacity)
                case .quotaExhausted:
                    quotaExhaustedView
                        .transition(.opacity)
                case .premiumRequired:
                    premiumRequiredView
                        .transition(.opacity)
                }
            }
            .animation(.easeInOut(duration: 0.35), value: phase)
        }
        .sheet(isPresented: $showPremium) { PremiumSheet(store: subscription) }
        .errorAlert(errorPresenter)
        // While a recipe is being created, block Fermer and swipe-to-dismiss so a
        // cancel can't orphan the create task (which would still fire onCreated).
        .interactiveDismissDisabled(isSaving)
        .task {
            guard !frozen else { return }
            await run()
        }
    }

    // MARK: - Phases

    private var analyzingView: some View {
        AIThinkingCard(message: "Analyse IA…")
            .navigationTitle("Analyse")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { onCancel() } label: {
                        Image(systemName: "xmark")
                    }
                    .accessibilityLabel("Fermer")
                }
            }
    }

    private var failedView: some View {
        ContentUnavailableView {
            Label("Analyse impossible", systemImage: "exclamationmark.triangle")
        } description: {
            Text("Réessaie ou ferme l’import.")
        } actions: {
            Button("Réessayer") { Task { await run() } }
        }
        .navigationTitle("Analyse")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button { onCancel() } label: {
                    Image(systemName: "xmark")
                }
                .accessibilityLabel("Fermer")
            }
        }
    }

    private var nothingFoundView: some View {
        ContentUnavailableView {
            Label("Aucune recette détectée", systemImage: "text.magnifyingglass")
        } description: {
            Text("L’IA n’a rien trouvé à importer ici. Réessaie avec une photo plus nette ou une autre source.")
        } actions: {
            Button("Réessayer") { Task { await run() } }
                .buttonStyle(.glassProminent)
                .controlSize(.large)
                .padding(.top, 44)
        }
        .navigationTitle("Analyse")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button { onCancel() } label: {
                    Image(systemName: "xmark")
                }
                .accessibilityLabel("Fermer")
            }
        }
    }

    /// The monthly allowance is spent: no retry — it would refuse again — just
    /// when the meters reset, and the way out that Premium is.
    private var quotaExhaustedView: some View {
        ContentUnavailableView {
            Label("Quota IA du mois épuisé", systemImage: "hourglass")
        } description: {
            Text("Tes imports IA du mois sont utilisés. Ils repartent à zéro le \(Self.renewalLabel).")
        } actions: {
            Button("Découvrir Premium") { showPremium = true }
                .buttonStyle(.glassProminent)
                .controlSize(.large)
                .padding(.top, 44)
        }
        .navigationTitle("Analyse")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button { onCancel() } label: {
                    Image(systemName: "xmark")
                }
                .accessibilityLabel("Fermer")
            }
        }
    }

    /// A link on the free plan: point at the sources that stay open, and at the
    /// subscription that opens this one.
    private var premiumRequiredView: some View {
        ContentUnavailableView {
            Label("L’import par lien est Premium", systemImage: "link")
        } description: {
            Text("Importe cette recette par photo ou en collant son texte — ou passe au Premium pour lire les pages web.")
        } actions: {
            Button("Découvrir Premium") { showPremium = true }
                .buttonStyle(.glassProminent)
                .controlSize(.large)
                .padding(.top, 44)
        }
        .navigationTitle("Analyse")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button { onCancel() } label: {
                    Image(systemName: "xmark")
                }
                .accessibilityLabel("Fermer")
            }
        }
    }

    /// When the meters reset, e.g. `"1er août 2026"` — always the 1st of next
    /// month, so it is computed here rather than fetched.
    private static var renewalLabel: String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "fr_FR")
        formatter.setLocalizedDateFormatFromTemplate("LLLL yyyy")
        let calendar = Calendar.current
        let nextMonth = calendar.date(byAdding: .month, value: 1, to: Date()) ?? Date()
        let firstOfNext = calendar.date(from: calendar.dateComponents([.year, .month], from: nextMonth)) ?? nextMonth
        return "1er \(formatter.string(from: firstOfNext))"
    }

    // MARK: - Work

    private func run() async {
        phase = .analyzing
        // Keep the loader on screen long enough to actually see the animation,
        // even when the AI answers almost instantly. Failures skip the wait.
        let minimumShown = Task { try? await Task.sleep(for: .seconds(3.5)) }
        guard let source = await resolveSource() else {
            minimumShown.cancel()
            errorPresenter.message = "Impossible de lire l’image sélectionnée."
            phase = .failed
            return
        }
        do {
            phase = try await analyzed(source, waiting: minimumShown)
        } catch ImportAPI.ImportError.noRecipeFound {
            minimumShown.cancel()
            phase = .nothingFound
        } catch ImportAPI.ImportError.quotaExhausted {
            minimumShown.cancel()
            phase = .quotaExhausted
        } catch ImportAPI.ImportError.premiumRequired {
            minimumShown.cancel()
            phase = .premiumRequired
        } catch {
            minimumShown.cancel()
            errorPresenter.message = reportError(error)
            phase = .failed
        }
    }

    /// Run the flow's analysis, and — for a coffee — load the vocabulary alongside
    /// it, so the preview opens with the gear already filled in rather than
    /// popping it in a moment later. A vocabulary that fails to load is no reason
    /// to lose the import: the fields simply suggest nothing.
    private func analyzed(_ source: ImportAPI.Source, waiting: Task<Void?, Never>) async throws -> Phase {
        switch flow {
        case .cooking:
            let analysis = try await ImportAPI.analyzeCooking(source)
            _ = await waiting.value
            return .cookingForm(analysis)
        case .coffee:
            async let vocabulary = try? RecipeAPI.coffeeVocabulary()
            let analysis = try await ImportAPI.analyzeCoffee(source)
            _ = await waiting.value
            return .coffeeForm(analysis, await vocabulary ?? .empty)
        }
    }

    private func resolveSource() async -> ImportAPI.Source? {
        switch input {
        case .source(let source):
            return source
        case .capture(let data):
            return await encode([data], text: nil)
        case .library(let item):
            guard let data = try? await item.loadTransferable(type: Data.self) else { return nil }
            return await encode([data], text: nil)
        case .composed(let photos, let text):
            let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
            return await encode(photos, text: trimmed.isEmpty ? nil : trimmed)
        }
    }

    /// Encode the photos in parallel, off the main actor — a six-photo import
    /// would otherwise resize and compress them one after the other.
    private func encode(_ photos: [Data], text: String?) async -> ImportAPI.Source? {
        let encoded = await Task.detached(priority: .userInitiated) {
            photos.compactMap { UIImage(data: $0)?.jpegBase64() }
        }.value
        guard !encoded.isEmpty else { return nil }
        return .photos(encoded, text: text)
    }

    private func saveCooking(_ analysis: CookingImportAnalysis) async {
        await saving { try await ImportAPI.createCooking(analysis) }
    }

    private func saveCoffee(_ analysis: CoffeeImportAnalysis) async {
        await saving { try await ImportAPI.createCoffee(analysis) }
    }

    private func saving(_ create: () async throws -> String) async {
        isSaving = true
        defer { isSaving = false }
        do {
            onCreated(try await create())
        } catch {
            errorPresenter.message = reportError(error)
        }
    }
}
