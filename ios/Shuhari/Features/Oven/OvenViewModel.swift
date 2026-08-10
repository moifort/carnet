import SwiftUI

/// The connected oven, as one recipe sheet sees it. Loads its state when the sheet
/// opens, keeps it fresh while the sheet is there, and starts the cooking the
/// displayed version asks for.
///
/// `state == nil` after a load means this account owns no oven: the sheet then
/// shows no oven controls at all, rather than a button nobody could ever enable.
@MainActor
@Observable
final class OvenViewModel {
    private(set) var state: OvenState?
    var error = ErrorPresenter()

    /// When a cooking was last asked to start. The appliance reports through the
    /// cloud and takes a few seconds to admit it is RUNNING, so the reads right
    /// after a start are the quick ones.
    private var startedAt: Date?
    /// When the appliance was last read, whatever it answered — what the next read
    /// is due from.
    private var lastRead = Date.now

    /// True while the appliance is being asked. Read off the presenter rather than
    /// tracked twice: two flags for one wait is one flag too many.
    var isStarting: Bool { error.isRunning }

    /// Whether the recipe sheet should offer to start a cooking. An oven that does
    /// not answer, or refuses remote operation, still shows the button — pressing
    /// it is how the cook learns WHY, and the error says what to do about it.
    var isAvailable: Bool { state != nil }

    /// True while the oven reports a cooking under way — the button then says so
    /// instead of offering a second one.
    var isRunning: Bool { state?.running != nil }

    func load() async {
        lastRead = .now
        state = try? await OvenAPI.state()
    }

    /// Keep asking the appliance for as long as the sheet is on screen. Nothing
    /// pushes: the oven answers a cloud API, so a cooking started here reads as
    /// RUNNING only seconds later — and one dialled in on the oven's own panel
    /// never reaches the sheet at all otherwise. Cancelled with the view's task,
    /// so nothing polls behind a screen nobody is looking at.
    func watch() async {
        while !Task.isCancelled {
            // Ticking every second and deciding here, rather than sleeping the whole
            // interval: pressing start shortens it, and a sleep already under way
            // would not hear about it — which is a cook watching an unchanged button
            // for half a minute.
            try? await Task.sleep(for: .seconds(1))
            guard !Task.isCancelled else { return }
            guard Date.now.timeIntervalSince(lastRead) >= interval else { continue }
            await refresh()
        }
    }

    /// Seconds until the next read is due. Quick while a start is settling, slow the
    /// rest of the time: the appliance sits behind a rate-limited API and a recipe
    /// sheet can stay open all afternoon, while a running cooking only ever counts
    /// whole minutes down.
    private var interval: TimeInterval {
        guard !isRunning, let startedAt, Date.now.timeIntervalSince(startedAt) < 30 else {
            return 30
        }
        return 3
    }

    /// Read the state again without losing what is on screen: a read that fails
    /// means the network blinked, not that the oven vanished. Skipped while a start
    /// is in flight — that call answers with a fresher state than this one would.
    private func refresh() async {
        guard !isStarting else { return }
        lastRead = .now
        guard let fresh = try? await OvenAPI.state() else { return }
        state = fresh
    }

    /// Start the version's cooking. Reports the oven's refusal as a sentence rather
    /// than a code — `APIError` is what turns one into the other.
    func start(recipeId: String, version: Int) async {
        await error.run {
            self.state = try await OvenAPI.start(recipeId: recipeId, version: version)
        } onSuccess: {
            // The oven has taken the command but usually still reads as idle. That
            // gap is exactly what the quick polls are for; a refusal has no gap to
            // close, and keeps the slow pace.
            self.startedAt = .now
        }
    }
}
