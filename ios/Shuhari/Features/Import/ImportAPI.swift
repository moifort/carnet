import Apollo
import ApolloAPI
import Foundation

enum ImportAPI {
    /// What the AI is asked to read. Photos carry an optional `text` — the pages of
    /// a book plus what the cook typed to complete them, read as ONE recipe. A URL
    /// stands alone; the server refuses it mixed with the rest.
    enum Source {
        case photos([String], text: String? = nil) // base64 JPEGs, no data-URL prefix
        case url(String)
        case text(String)
    }

    /// The refusals the review sheet answers with a dedicated screen instead of
    /// an alert: the AI found nothing to import, the monthly allowance is spent, or
    /// the source was a link on the free plan.
    enum ImportError: Error {
        case noRecipeFound
        case quotaExhausted
        case premiumRequired
    }

    /// Analyze a source as a coffee: its brew method and its dials, never an
    /// ingredient list nor steps. Which flow runs is decided by the tab the cook
    /// launched the import from, never guessed from the source.
    static func analyzeCoffee(_ source: Source) async throws -> CoffeeImportAnalysis {
        let (photos, url, text) = arguments(source)
        let data: ShuhariGraphQL.AnalyzeCoffeeImportMutation.Data = try await analyzing {
            try await GraphQLHelpers.perform(
                GraphQLClient.shared.apollo,
                mutation: ShuhariGraphQL.AnalyzeCoffeeImportMutation(
                    photos: photos, url: url, text: text
                )
            )
        }
        let analysis = data.analyzeCoffeeImport
        return CoffeeImportAnalysis(
            title: normalizedTitle(analysis.title),
            method: BrewMethod(graphql: analysis.method) ?? .other,
            parameters: parameters(analysis.parameters.fragments.coffeeParametersFields),
            tips: analysis.tips,
            sourceLabel: analysis.sourceLabel
        )
    }

    /// Analyze a source as something cooked: a dish or a Thermomix recipe, with its
    /// ingredients and its steps.
    static func analyzeCooking(_ source: Source) async throws -> CookingImportAnalysis {
        let (photos, url, text) = arguments(source)
        let data: ShuhariGraphQL.AnalyzeCookingImportMutation.Data = try await analyzing {
            try await GraphQLHelpers.perform(
                GraphQLClient.shared.apollo,
                mutation: ShuhariGraphQL.AnalyzeCookingImportMutation(
                    photos: photos, url: url, text: text
                )
            )
        }
        let analysis = data.analyzeCookingImport
        return CookingImportAnalysis(
            title: normalizedTitle(analysis.title),
            type: RecipeType(graphql: analysis.type),
            category: DishCategory(graphql: analysis.category),
            ingredients: analysis.ingredients.map {
                Ingredient(name: $0.name, quantity: $0.quantity)
            },
            steps: analysis.steps.map { step in
                ImportStep(
                    text: step.text,
                    thermomix: ThermomixSettings(
                        time: step.thermomix.time,
                        temperature: step.thermomix.temperature,
                        speed: step.thermomix.speed,
                        reverse: step.thermomix.reverse ?? false
                    )
                )
            },
            tips: analysis.tips,
            sourceLabel: analysis.sourceLabel
        )
    }

    /// Create a coffee recipe and its v1 from a confirmed preview. Returns the id.
    static func createCoffee(_ analysis: CoffeeImportAnalysis) async throws -> String {
        try await RecipeAPI.createRecipe(
            title: analysis.title,
            type: .coffee,
            // A coffee is filed as a drink; its own axis is the brew method.
            category: .drink,
            method: analysis.method,
            content: .coffee(parameters: analysis.parameters),
            tips: analysis.tips,
            sourceLabel: analysis.sourceLabel
        )
    }

    /// The same for something cooked: the content arm mirrors the detected type — a
    /// dish keeps plain-text steps, a Thermomix recipe its machine settings.
    static func createCooking(_ analysis: CookingImportAnalysis) async throws -> String {
        let content: VersionContent =
            analysis.type == .thermomix
                ? .thermomix(
                    ingredients: analysis.ingredients,
                    steps: analysis.steps.map(\.asThermomixStep)
                )
                : .dish(ingredients: analysis.ingredients, steps: analysis.steps.map(\.text))
        return try await RecipeAPI.createRecipe(
            title: analysis.title,
            type: analysis.type,
            category: analysis.category,
            method: nil,
            content: content,
            tips: analysis.tips,
            sourceLabel: analysis.sourceLabel
        )
    }

    /// The three mutation arguments a source resolves to. The photo list is total: a
    /// URL/text import sends `[]`, never a null.
    private static func arguments(
        _ source: Source
    ) -> ([String], GraphQLNullable<String>, GraphQLNullable<String>) {
        switch source {
        case .photos(let list, let note):
            // A blank note is no note: it must not read as a second, empty source.
            return (list, .none, GraphQLHelpers.graphQLNullable(note?.isEmpty == false ? note : nil))
        case .url(let value): return ([], GraphQLHelpers.graphQLNullable(value), .none)
        case .text(let value): return ([], .none, GraphQLHelpers.graphQLNullable(value))
        }
    }

    /// The refusals both flows answer with, turned into the errors the review sheet
    /// shows a screen for. Written once so the two can never drift apart.
    private static func analyzing<T>(_ run: () async throws -> T) async throws -> T {
        do {
            return try await run()
        } catch let error as APIError {
            if case .graphQL(_, let codes) = error {
                if codes.contains("NO_RECIPE_FOUND") { throw ImportError.noRecipeFound }
                if codes.contains("QUOTA_EXHAUSTED") { throw ImportError.quotaExhausted }
                if codes.contains("PREMIUM_REQUIRED") { throw ImportError.premiumRequired }
            }
            throw error
        }
    }

    private static func parameters(
        _ coffee: ShuhariGraphQL.CoffeeParametersFields
    ) -> CoffeeParameters {
        CoffeeParameters(
            beans: CoffeeBeans(
                name: coffee.beans.name,
                country: coffee.beans.country,
                producer: coffee.beans.producer,
                roastedOn: coffee.beans.roastedOn.flatMap { GraphQLHelpers.parseISO8601($0) },
                dose: coffee.beans.dose
            ),
            water: CoffeeWaterSpec(
                kind: coffee.water.kind,
                amount: coffee.water.amount,
                temperature: coffee.water.temperature
            ),
            extraction: CoffeeExtraction(
                grind: coffee.extraction.grind,
                time: coffee.extraction.time,
                cupYield: coffee.extraction.yield
            ),
            milk: coffee.milk.map {
                CoffeeMilk(kind: $0.kind, amount: $0.amount, temperature: $0.temperature)
            },
            gear: CoffeeGear(machine: coffee.gear.machine, grinder: coffee.gear.grinder)
        )
    }

    /// AI sources sometimes hand back an all-caps title ("COOKIES AUX NOIX DE
    /// PÉCAN"). Normalize a fully-uppercase title to sentence case; leave any
    /// mixed-case title untouched (it's already how the source wrote it).
    private static func normalizedTitle(_ raw: String) -> String {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed == trimmed.uppercased(), trimmed != trimmed.lowercased() else { return trimmed }
        return trimmed.prefix(1).uppercased() + trimmed.dropFirst().lowercased()
    }
}
