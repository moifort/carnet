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
}

/// The opaque sheet presented over the camera: runs the AI analysis (glowing
/// loader), then hands off to the editable `ImportPreviewPage`, and creates the
/// recipe on Valider. Fermer / failure "close" abandons the whole import.
struct ImportReviewSheet: View {
    let input: ImportInput
    /// Success → create the recipe and route the tab (dismisses the whole cover).
    let onCreated: (String, RecipeType) -> Void
    /// Fermer / analysis-failure close → abandon the import and close the flow.
    let onCancel: () -> Void

    enum Phase: Equatable {
        case analyzing
        case form(ImportAnalysis)
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

    init(input: ImportInput, onCreated: @escaping (String, RecipeType) -> Void, onCancel: @escaping () -> Void) {
        self.input = input
        self.onCreated = onCreated
        self.onCancel = onCancel
        frozen = false
    }

    #if DEBUG
    /// Gallery/preview entry: show a phase frozen, with inert callbacks.
    init(galleryPhase: Phase) {
        input = .source(.text(""))
        onCreated = { _, _ in }
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
                case .form(let analysis):
                    ImportPreviewPage(analysis: analysis, isSaving: isSaving, onCancel: onCancel) { edited in
                        Task { await save(edited) }
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
            let analysis = try await ImportAPI.analyze(source)
            _ = await minimumShown.value
            phase = .form(analysis)
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

    private func save(_ analysis: ImportAnalysis) async {
        isSaving = true
        defer { isSaving = false }
        do {
            let recipeId = try await ImportAPI.create(analysis)
            onCreated(recipeId, analysis.type)
        } catch {
            errorPresenter.message = reportError(error)
        }
    }
}
