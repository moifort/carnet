import Foundation

/// The one recipe state of a flow. The recipe sheet, the version screens it pushes,
/// the history sheet and the to-cook sheet all read from here, so they can never
/// disagree on what is rated, what is left to test, or how many versions there are —
/// each screen holding its own copy is what let the flask CTA and the version list
/// tell two different stories.
///
/// Owned by the tab that hosts the flow (like `LibraryStore`) and handed down the
/// stack, so a version already read opens with no round trip: what is known is drawn
/// at once, and the fetch behind it only ever corrects it.
@MainActor @Observable
final class RecipeStore {
    private var recipes: [String: Recipe] = [:]
    private var failures: [String: String] = [:]
    /// A fixture-backed store never calls the server: the gallery and the previews
    /// are offline screens, and a screen that refreshes on appearance would otherwise
    /// spend a failing request each time one is opened.
    private let isPreview: Bool

    init() {
        isPreview = false
    }

    /// Seeds a fixture recipe for previews and the debug gallery, so the whole flow
    /// renders offline.
    init(previewRecipe: Recipe) {
        isPreview = true
        recipes[previewRecipe.id] = previewRecipe
    }

    /// What is known of that recipe right now — nil only before the first read.
    func recipe(_ id: String) -> Recipe? { recipes[id] }

    /// The last read's failure, kept beside the recipe: a screen that has something
    /// to draw keeps drawing it, and only an empty one turns the failure into a page.
    func error(_ id: String) -> String? { failures[id] }

    /// Read the recipe and hand it to every screen showing it. Called on each screen
    /// appearance: what is cached shows immediately and this only corrects it.
    func load(_ id: String) async {
        guard !isPreview else { return }
        do {
            recipes[id] = try await RecipeAPI.getRecipe(id: id)
            failures[id] = nil
        } catch {
            failures[id] = reportError(error)
        }
    }

    /// Drop what is known of a recipe — after a deletion, so the next visit reads the
    /// lineage as it now stands instead of flashing the version that just went.
    func forget(_ id: String) {
        recipes[id] = nil
        failures[id] = nil
    }
}
