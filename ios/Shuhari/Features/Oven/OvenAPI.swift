import Apollo
import ApolloAPI
import Foundation

/// What the app knows about the connected oven. `nil` from `OvenAPI.state()` is
/// not a failure: it says this account has no oven, and the app then shows no oven
/// controls at all rather than a button nobody can enable.
struct OvenState: Sendable, Equatable {
    var reachable: Bool
    var remoteControlEnabled: Bool
    /// What the dials are set to right now — what "copy the oven's settings" copies.
    var settings: OvenSettings
    /// The cooking under way, or nil when the oven is idle.
    var running: OvenRun?
}

/// What the oven's dials are set to right now, whoever turned them — including the
/// cook standing in front of it. Plain numbers: the appliance's readings, not what
/// anyone wrote down.
struct OvenSettings: Sendable, Equatable {
    var program: OvenProgram?
    /// The oven's own programme code when one is selected — what makes an assisted
    /// cooking reproducible.
    var assisted: String?
    var temperature: Int?
    var duration: Int?
    var core: Int?

    /// Whether these dials are worth copying at all — one reading is enough. The
    /// copy used to require a heating function AND a temperature, which hid the
    /// button on a real oven baking bread at 230 °C for an hour: its programme code
    /// was one the notebook had no word for, so the mode alone was missing and the
    /// two settings that WERE there went with it. What the oven says is copyable
    /// even when it does not say everything.
    ///
    /// An assisted programme without its code is not a mode — it starts nothing —
    /// so it does not, on its own, make a copy worth offering.
    var isCopyable: Bool {
        copyableProgram != nil || temperature != nil || duration != nil || core != nil
    }

    /// The mode to copy, or nil when the oven names none the notebook can use.
    var copyableProgram: OvenProgram? {
        guard let program else { return nil }
        return program == .assisted && assisted == nil ? nil : program
    }
}

/// A cooking under way. Only how long is left: WHAT is cooking is `settings`.
struct OvenRun: Sendable, Equatable {
    /// Minutes left on the oven's own timer, nil on a probe cook.
    var remaining: Int?
}

enum OvenAPI {
    /// The oven's live state, or nil when this account owns none.
    static func state() async throws -> OvenState? {
        let data = try await GraphQLHelpers.fetch(
            GraphQLClient.shared.apollo,
            // The helper never touches the normalized cache, which is what this
            // needs: a stale "idle" would offer a button the oven then refuses.
            query: ShuhariGraphQL.OvenQuery()
        )
        guard let oven = data.oven else { return nil }
        return mapOven(
            reachable: oven.reachable,
            remoteControlEnabled: oven.remoteControlEnabled,
            program: oven.settings.program,
            assisted: oven.settings.assisted,
            temperature: oven.settings.temperature,
            duration: oven.settings.duration,
            core: oven.settings.core,
            remaining: oven.running.map(\.remaining)
        )
    }

    /// Start this version's cooking on the oven. What is sent is the profile the
    /// VERSION carries — the caller passes no settings, so the oven and the
    /// notebook can never disagree. Answers the oven's fresh state.
    static func start(recipeId: String, version: Int) async throws -> OvenState {
        let data = try await GraphQLHelpers.perform(
            GraphQLClient.shared.apollo,
            mutation: ShuhariGraphQL.StartOvenMutation(recipeId: recipeId, version: version)
        )
        let oven = data.startOven
        return mapOven(
            reachable: oven.reachable,
            remoteControlEnabled: oven.remoteControlEnabled,
            program: oven.settings.program,
            assisted: oven.settings.assisted,
            temperature: oven.settings.temperature,
            duration: oven.settings.duration,
            core: oven.settings.core,
            remaining: oven.running.map(\.remaining)
        )
    }

    /// The query and the mutation answer the same `Oven`, in two generated types
    /// Apollo will not let us share. Taken apart into primitives here so the shape
    /// is assembled once — the last version of this file mapped it twice, and
    /// changing the model meant remembering to fix both.
    private static func mapOven(
        reachable: Bool,
        remoteControlEnabled: Bool,
        program: GraphQLEnum<ShuhariGraphQL.OvenProgram>?,
        assisted: String?,
        temperature: Int?,
        duration: Int?,
        core: Int?,
        remaining: Int??
    ) -> OvenState {
        OvenState(
            reachable: reachable,
            remoteControlEnabled: remoteControlEnabled,
            settings: OvenSettings(
                program: program.map { OvenProgram(graphql: $0) },
                assisted: assisted,
                temperature: temperature,
                duration: duration,
                core: core
            ),
            // A double optional: the outer says whether a cooking is under way, the
            // inner whether that cooking counts down.
            running: remaining.map { OvenRun(remaining: $0) }
        )
    }
}
