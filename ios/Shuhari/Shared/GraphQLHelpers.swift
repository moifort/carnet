import Apollo
import ApolloAPI
import Foundation

enum GraphQLHelpers {
    static func fetch<Q: GraphQLQuery>(_ client: ApolloClient, query: Q) async throws -> Q.Data {
        try await withCheckedThrowingContinuation { continuation in
            // Cache fully disabled: never read from nor write to the normalized
            // store — avoids a class of stale/normalization bugs.
            client.fetch(query: query, cachePolicy: .fetchIgnoringCacheCompletely) { result in
                switch result {
                case .success(let graphQLResult):
                    if let errors = graphQLResult.errors, !errors.isEmpty {
                        continuation.resume(
                            throwing: APIError.graphQL(
                                messages: errors.compactMap(\.message),
                                codes: errors.compactMap { $0.extensions?["code"] as? String }
                            )
                        )
                        return
                    }
                    guard let data = graphQLResult.data else {
                        continuation.resume(throwing: APIError.invalidResponse)
                        return
                    }
                    nonisolated(unsafe) let sendableData = data
                    continuation.resume(returning: sendableData)
                case .failure(let error):
                    continuation.resume(throwing: error)
                }
            }
        }
    }

    static func perform<M: GraphQLMutation>(_ client: ApolloClient, mutation: M) async throws -> M.Data {
        try await withCheckedThrowingContinuation { continuation in
            client.perform(mutation: mutation, publishResultToStore: false) { result in
                switch result {
                case .success(let graphQLResult):
                    if let errors = graphQLResult.errors, !errors.isEmpty {
                        continuation.resume(
                            throwing: APIError.graphQL(
                                messages: errors.compactMap(\.message),
                                codes: errors.compactMap { $0.extensions?["code"] as? String }
                            )
                        )
                        return
                    }
                    guard let data = graphQLResult.data else {
                        continuation.resume(throwing: APIError.invalidResponse)
                        return
                    }
                    nonisolated(unsafe) let sendableData = data
                    continuation.resume(returning: sendableData)
                case .failure(let error):
                    continuation.resume(throwing: error)
                }
            }
        }
    }

    /// Decode an ISO-8601 date string from a GraphQL DateTime scalar.
    static func parseISO8601(_ string: String) -> Date? {
        let withFraction = ISO8601DateFormatter()
        withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let withoutFraction = ISO8601DateFormatter()
        withoutFraction.formatOptions = [.withInternetDateTime]
        return withFraction.date(from: string) ?? withoutFraction.date(from: string)
    }

    /// Wrap an optional Swift value into the GraphQLNullable form expected by
    /// generated operation initializers (`.some(...)` vs `.none`).
    static func graphQLNullable<T>(_ value: T?) -> GraphQLNullable<T> {
        value.map { .some($0) } ?? .none
    }

    /// String overload: an empty/blank optional string is treated as absent
    /// (`.none`), never sent as `""`. Many server fields are branded types that
    /// require at least one character (PlaceName, Region, Domain, …), so sending
    /// `""` is rejected as BAD_USER_INPUT.
    static func graphQLNullable(_ value: String?) -> GraphQLNullable<String> {
        guard let value, !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        else { return .none }
        return .some(value)
    }

    /// One step's Thermomix settings as the API spells them. A plain step is an
    /// input with every field absent (`{}`) — the settings are total, never a hole
    /// (see docs/code-style.md, "Arrays never optional").
    static func thermomixSettingsInput(_ settings: ThermomixSettings) -> ShuhariGraphQL.ThermomixSettingsInput {
        ShuhariGraphQL.ThermomixSettingsInput(
            reverse: settings.reverse ? .some(true) : .none,
            speed: graphQLNullable(settings.speed),
            temperature: graphQLNullable(settings.temperature),
            time: graphQLNullable(settings.time)
        )
    }

    /// One step's extraction settings as the API spells them. Total like the
    /// Thermomix ones: a step that sets nothing is an input with every field absent.
    static func coffeeSettingsInput(_ settings: CoffeeSettings) -> ShuhariGraphQL.CoffeeSettingsInput {
        ShuhariGraphQL.CoffeeSettingsInput(
            grind: graphQLNullable(settings.grind),
            temperature: graphQLNullable(settings.temperature),
            time: graphQLNullable(settings.time),
            water: graphQLNullable(settings.water),
            yield: graphQLNullable(settings.cupYield)
        )
    }

    /// A version body as the `content` oneOf input: EXACTLY ONE arm is set,
    /// matching the recipe type — `dish` for plain-text steps, `thermomix` for
    /// steps carrying their machine settings, `coffee` for steps carrying their
    /// extraction settings.
    static func versionContentInput(_ content: VersionContent) -> ShuhariGraphQL.VersionContentInput {
        switch content {
        case .dish(let ingredients, let steps):
            return .dish(ShuhariGraphQL.DishContentInput(
                ingredients: ingredients.map { ShuhariGraphQL.IngredientInput(name: $0.name, quantity: $0.quantity) },
                steps: steps
            ))
        case .thermomix(let ingredients, let steps):
            return .thermomix(ShuhariGraphQL.ThermomixContentInput(
                ingredients: ingredients.map { ShuhariGraphQL.IngredientInput(name: $0.name, quantity: $0.quantity) },
                steps: steps.map {
                    ShuhariGraphQL.ThermomixStepInput(settings: thermomixSettingsInput($0.settings), text: $0.text)
                }
            ))
        case .coffee(let ingredients, let steps):
            return .coffee(ShuhariGraphQL.CoffeeContentInput(
                ingredients: ingredients.map { ShuhariGraphQL.IngredientInput(name: $0.name, quantity: $0.quantity) },
                steps: steps.map {
                    ShuhariGraphQL.CoffeeStepInput(settings: coffeeSettingsInput($0.settings), text: $0.text)
                }
            ))
        }
    }
}

enum APIError: LocalizedError {
    case invalidResponse
    case httpError(Int)
    case graphQL(messages: [String], codes: [String])

    var errorDescription: String? {
        switch self {
        case .invalidResponse:
            return "Réponse invalide du serveur"
        case .httpError(let code):
            return "Erreur serveur (\(code))"
        case .graphQL(let messages, let codes):
            // The server answers a refused AI call with a bare sentinel
            // ("quota-exhausted"): the app is what turns it into a sentence.
            if codes.contains("QUOTA_EXHAUSTED") {
                return "Vous avez utilisé toute votre IA du mois. Vos compteurs repartent à zéro le 1er du mois prochain."
            }
            if codes.contains("PREMIUM_REQUIRED") {
                return "L’import par lien est réservé à la formule Premium. Vous pouvez importer cette recette par photo ou en collant son texte."
            }
            return messages.joined(separator: " — ")
        }
    }
}
