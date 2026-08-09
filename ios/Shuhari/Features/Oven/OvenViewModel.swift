import SwiftUI

/// The connected oven, as one recipe sheet sees it. Loads its state when the sheet
/// opens and starts the cooking the displayed version asks for.
///
/// `state == nil` after a load means this account owns no oven: the sheet then
/// shows no oven controls at all, rather than a button nobody could ever enable.
@MainActor
@Observable
final class OvenViewModel {
    private(set) var state: OvenState?
    private(set) var isStarting = false
    var error = ErrorPresenter()

    /// Whether the recipe sheet should offer to start a cooking. An oven that does
    /// not answer, or refuses remote operation, still shows the button — pressing
    /// it is how the cook learns WHY, and the error says what to do about it.
    var isAvailable: Bool { state != nil }

    /// True while the oven reports a cooking under way — the button then says so
    /// instead of offering a second one.
    var isRunning: Bool { state?.running != nil }

    func load() async {
        state = try? await OvenAPI.state()
    }

    /// Start the version's cooking. Reports the oven's refusal as a sentence rather
    /// than a code — `APIError` is what turns one into the other.
    func start(recipeId: String, version: Int) async {
        isStarting = true
        defer { isStarting = false }
        await error.run {
            self.state = try await OvenAPI.start(recipeId: recipeId, version: version)
        }
    }
}
