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
    /// an alert: the AI found no recipe, the monthly allowance is spent, or the
    /// source was a link on the free plan.
    enum ImportError: Error {
        case noRecipeFound
        case quotaExhausted
        case premiumRequired
    }

    /// Analyze an import source into a structured, editable recipe preview.
    static func analyze(_ source: Source) async throws -> ImportAnalysis {
        // The photo list is total: a URL/text import sends `[]`, never a null.
        var photos: [String] = []
        var url: GraphQLNullable<String> = .none
        var text: GraphQLNullable<String> = .none
        switch source {
        case .photos(let list, let note):
            photos = list
            // A blank note is no note: it must not read as a second, empty source.
            text = GraphQLHelpers.graphQLNullable(note?.isEmpty == false ? note : nil)
        case .url(let value): url = GraphQLHelpers.graphQLNullable(value)
        case .text(let value): text = GraphQLHelpers.graphQLNullable(value)
        }

        let data: ShuhariGraphQL.AnalyzeImportMutation.Data
        do {
            data = try await GraphQLHelpers.perform(
                GraphQLClient.shared.apollo,
                mutation: ShuhariGraphQL.AnalyzeImportMutation(photos: photos, url: url, text: text)
            )
        } catch let error as APIError {
            if case .graphQL(_, let codes) = error {
                if codes.contains("NO_RECIPE_FOUND") { throw ImportError.noRecipeFound }
                if codes.contains("QUOTA_EXHAUSTED") { throw ImportError.quotaExhausted }
                if codes.contains("PREMIUM_REQUIRED") { throw ImportError.premiumRequired }
            }
            throw error
        }
        let analysis = data.analyzeImport
        return ImportAnalysis(
            title: normalizedTitle(analysis.title),
            type: RecipeType(graphql: analysis.type),
            category: DishCategory(graphql: analysis.category),
            method: BrewMethod(graphql: analysis.method),
            ingredients: analysis.ingredients.map { Ingredient(name: $0.name, quantity: $0.quantity) },
            steps: analysis.steps.map { step in
                ImportStep(
                    text: step.text,
                    thermomix: ThermomixSettings(
                        time: step.thermomix.time,
                        temperature: step.thermomix.temperature,
                        speed: step.thermomix.speed,
                        reverse: step.thermomix.reverse ?? false
                    ),
                    coffee: CoffeeSettings(
                        grind: step.coffee.grind,
                        water: step.coffee.water,
                        temperature: step.coffee.temperature,
                        time: step.coffee.time,
                        cupYield: step.coffee.yield
                    )
                )
            },
            tips: analysis.tips,
            sourceLabel: analysis.sourceLabel
        )
    }

    /// Create a recipe and its v1 from a confirmed preview. Returns the recipe id.
    /// The content arm mirrors the detected type: a dish keeps plain-text steps, a
    /// Thermomix recipe its machine settings, a coffee its extraction settings —
    /// the settings the type does not use are dropped here.
    static func create(_ analysis: ImportAnalysis) async throws -> String {
        let content: VersionContent
        switch analysis.type {
        case .dish:
            content = .dish(ingredients: analysis.ingredients, steps: analysis.steps.map(\.text))
        case .thermomix:
            content = .thermomix(
                ingredients: analysis.ingredients,
                steps: analysis.steps.map(\.asThermomixStep)
            )
        case .coffee:
            content = .coffee(
                ingredients: analysis.ingredients,
                steps: analysis.steps.map(\.asCoffeeStep)
            )
        }
        return try await RecipeAPI.createRecipe(
            title: analysis.title,
            type: analysis.type,
            category: analysis.category,
            // A coffee always carries a method; the server rejects one without.
            method: analysis.type == .coffee ? (analysis.method ?? .other) : nil,
            content: content,
            tips: analysis.tips,
            sourceLabel: analysis.sourceLabel
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
