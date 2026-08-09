import Apollo
import Foundation

/// What the app knows about the connected oven. `nil` from `OvenAPI.state()` is
/// not a failure: it says this account has no oven, and the app then shows no oven
/// controls at all rather than a button nobody can enable.
struct OvenState: Sendable, Equatable {
    var reachable: Bool
    var remoteControlEnabled: Bool
    /// The cooking under way, or nil when the oven is idle.
    var running: OvenRun?
    /// The oven's own assisted-cooking catalogue, offered as a prefill.
    var assisted: [AssistedProfile]
}

/// A cooking under way, as the oven reports it. Plain numbers: these are the
/// appliance's readings, not what the cook wrote down.
struct OvenRun: Sendable, Equatable {
    var program: OvenProgram?
    var temperature: Int?
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
        return OvenState(
            reachable: oven.reachable,
            remoteControlEnabled: oven.remoteControlEnabled,
            running: oven.running.map {
                OvenRun(
                    program: $0.program.map { OvenProgram(graphql: $0) },
                    temperature: $0.temperature,
                    remaining: $0.remaining
                )
            },
            assisted: oven.assistedProfiles.map {
                AssistedProfile(
                    label: $0.label,
                    program: OvenProgram(graphql: $0.program),
                    temperature: $0.temperature,
                    duration: $0.duration
                )
            }
        )
    }
}
