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

    /// Encode a date back into the ISO-8601 string a GraphQL DateTime scalar takes.
    static func formatISO8601(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.string(from: date)
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

    /// The oven profile as its input. A dish that never bakes sends the field
    /// ABSENT, not null: the server reads absence as "no oven cooking", and there is
    /// no "no oven" value to spell.
    static func ovenProfileInput(
        _ oven: OvenProfile?
    ) -> GraphQLNullable<ShuhariGraphQL.OvenProfileInput> {
        guard let oven else { return .null }
        // Apollo orders an input's parameters alphabetically, hence core → program.
        return .some(ShuhariGraphQL.OvenProfileInput(
            core: oven.core.map { GraphQLNullable.some($0) } ?? .null,
            duration: oven.duration.map { GraphQLNullable.some($0) } ?? .null,
            program: oven.program.graphQLValue,
            temperature: oven.temperature
        ))
    }

    /// A version body as the `content` oneOf input: EXACTLY ONE arm is set,
    /// matching the recipe type — `dish` for plain-text steps, `thermomix` for
    /// steps carrying their machine settings, `coffee` for its parameters alone.
    static func versionContentInput(_ content: VersionContent) -> ShuhariGraphQL.VersionContentInput {
        switch content {
        case .dish(let ingredients, let steps, let oven):
            return .dish(ShuhariGraphQL.DishContentInput(
                ingredients: ingredients.map { ShuhariGraphQL.IngredientInput(name: $0.name, quantity: $0.quantity) },
                oven: ovenProfileInput(oven),
                steps: steps
            ))
        case .thermomix(let ingredients, let steps, let oven):
            return .thermomix(ShuhariGraphQL.ThermomixContentInput(
                ingredients: ingredients.map { ShuhariGraphQL.IngredientInput(name: $0.name, quantity: $0.quantity) },
                oven: ovenProfileInput(oven),
                steps: steps.map {
                    ShuhariGraphQL.ThermomixStepInput(settings: thermomixSettingsInput($0.settings), text: $0.text)
                }
            ))
        case .coffee(let parameters):
            return .coffee(ShuhariGraphQL.CoffeeContentInput(
                beans: .some(beansInput(parameters.beans)),
                extraction: .some(extractionInput(parameters.extraction)),
                gear: .some(gearInput(parameters.gear)),
                // No milk block at all on a drink that has none: the server reads
                // its absence as the information, not as an unfilled form.
                milk: parameters.milk.map { .some(milkInput($0)) } ?? .null,
                water: .some(waterInput(parameters.water))
            ))
        }
    }

    /// A coffee version's parameters as the correction mutation expects them. An
    /// empty field is sent absent, never as an empty string: the server reads
    /// absence as "nothing known", and a blank would fail its branded constructor.
    static func coffeeParametersInput(
        _ parameters: CoffeeParameters
    ) -> ShuhariGraphQL.CoffeeParametersInput {
        ShuhariGraphQL.CoffeeParametersInput(
            beans: .some(beansInput(parameters.beans)),
            extraction: .some(extractionInput(parameters.extraction)),
            gear: .some(gearInput(parameters.gear)),
            milk: parameters.milk.map { .some(milkInput($0)) } ?? .null,
            water: .some(waterInput(parameters.water))
        )
    }

    private static func beansInput(_ beans: CoffeeBeans) -> ShuhariGraphQL.CoffeeBeansInput {
        ShuhariGraphQL.CoffeeBeansInput(
            country: graphQLNullable(beans.country),
            dose: graphQLNullable(beans.dose),
            name: graphQLNullable(beans.name),
            producer: graphQLNullable(beans.producer),
            roastedOn: beans.roastedOn.map { .some(formatISO8601($0)) } ?? .null
        )
    }

    private static func waterInput(_ water: CoffeeWaterSpec) -> ShuhariGraphQL.CoffeeWaterSpecInput {
        ShuhariGraphQL.CoffeeWaterSpecInput(
            amount: graphQLNullable(water.amount),
            kind: graphQLNullable(water.kind),
            temperature: graphQLNullable(water.temperature)
        )
    }

    private static func extractionInput(
        _ extraction: CoffeeExtraction
    ) -> ShuhariGraphQL.CoffeeExtractionInput {
        ShuhariGraphQL.CoffeeExtractionInput(
            grind: graphQLNullable(extraction.grind),
            time: graphQLNullable(extraction.time),
            yield: graphQLNullable(extraction.cupYield)
        )
    }

    private static func milkInput(_ milk: CoffeeMilk) -> ShuhariGraphQL.CoffeeMilkInput {
        ShuhariGraphQL.CoffeeMilkInput(
            amount: graphQLNullable(milk.amount),
            kind: graphQLNullable(milk.kind),
            temperature: graphQLNullable(milk.temperature)
        )
    }

    private static func gearInput(_ gear: CoffeeGear) -> ShuhariGraphQL.CoffeeGearInput {
        ShuhariGraphQL.CoffeeGearInput(
            grinder: graphQLNullable(gear.grinder),
            machine: graphQLNullable(gear.machine)
        )
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
