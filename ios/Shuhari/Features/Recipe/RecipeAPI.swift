import Apollo
import Foundation

enum RecipeAPI {
    // MARK: - Queries

    static func getRecipe(id: String) async throws -> Recipe {
        let data = try await GraphQLHelpers.fetch(
            GraphQLClient.shared.apollo,
            query: ShuhariGraphQL.RecipeQuery(id: id)
        )
        guard let recipe = data.recipe else { throw APIError.invalidResponse }
        return mapRecipe(recipe)
    }

    // MARK: - Mutations

    /// Create a recipe and its v1 in one go. Returns the new recipe's id. Two ways in:
    /// a confirmed import preview, and a proposal saved as a recipe of its own rather
    /// than as the next version of the one it was proposed for.
    static func createRecipe(
        title: String,
        type: RecipeType,
        category: DishCategory,
        method: BrewMethod? = nil,
        content: VersionContent,
        tips: [String] = [],
        sourceLabel: String?
    ) async throws -> String {
        let input = ShuhariGraphQL.CreateRecipeInput(
            category: category.graphQLValue,
            content: GraphQLHelpers.versionContentInput(content),
            method: GraphQLHelpers.graphQLNullable(method?.graphQLValue),
            sourceLabel: GraphQLHelpers.graphQLNullable(sourceLabel),
            tips: tips,
            title: title,
            type: type.graphQLValue
        )
        let data = try await GraphQLHelpers.perform(
            GraphQLClient.shared.apollo,
            mutation: ShuhariGraphQL.CreateRecipeMutation(input: input)
        )
        return data.createRecipe.id
    }

    static func deleteRecipe(id: String) async throws {
        _ = try await GraphQLHelpers.perform(
            GraphQLClient.shared.apollo,
            mutation: ShuhariGraphQL.DeleteRecipeMutation(id: id)
        )
    }

    /// Delete one version from the lineage; the versions built on it are re-based
    /// onto the one it iterated on, its number is never reused.
    static func deleteVersion(recipeId: String, number: Int) async throws {
        _ = try await GraphQLHelpers.perform(
            GraphQLClient.shared.apollo,
            mutation: ShuhariGraphQL.DeleteVersionMutation(recipeId: recipeId, number: number)
        )
    }

    /// Retouch the aggregate: rename it, refile it under another course or another
    /// brew method, mark it a favourite, or any combination. A field left nil is
    /// left alone. The type itself is fixed for good.
    static func updateRecipe(
        id: String,
        title: String? = nil,
        category: DishCategory? = nil,
        method: BrewMethod? = nil,
        favorite: Bool? = nil
    ) async throws {
        let input = ShuhariGraphQL.UpdateRecipeInput(
            category: GraphQLHelpers.graphQLNullable(category?.graphQLValue),
            favorite: GraphQLHelpers.graphQLNullable(favorite),
            method: GraphQLHelpers.graphQLNullable(method?.graphQLValue),
            title: GraphQLHelpers.graphQLNullable(title)
        )
        _ = try await GraphQLHelpers.perform(
            GraphQLClient.shared.apollo,
            mutation: ShuhariGraphQL.UpdateRecipeMutation(id: id, input: input)
        )
    }

    /// Correct one version's rating — the verdict mistyped, or never logged. In
    /// place: no version created, and the photo and remarks of the attempt stay
    /// (unlike recording an attempt, which replaces the whole outcome). A version
    /// that had never been cooked counts as cooked from here on.
    static func updateRating(recipeId: String, versionNumber: Int, rating: Int) async throws {
        _ = try await GraphQLHelpers.perform(
            GraphQLClient.shared.apollo,
            mutation: ShuhariGraphQL.UpdateRatingMutation(
                recipeId: recipeId,
                versionNumber: versionNumber,
                rating: rating
            )
        )
    }

    /// Correct one coffee version's parameters — the roast date read wrong, the
    /// grinder left out. Full replacement, in place: no version is created and the
    /// brewing steps are untouched.
    static func updateCoffeeParameters(
        recipeId: String,
        versionNumber: Int,
        parameters: CoffeeParameters
    ) async throws {
        _ = try await GraphQLHelpers.perform(
            GraphQLClient.shared.apollo,
            mutation: ShuhariGraphQL.UpdateCoffeeParametersMutation(
                recipeId: recipeId,
                versionNumber: versionNumber,
                parameters: GraphQLHelpers.coffeeParametersInput(parameters)
            )
        )
    }

    /// What each free-text coffee field suggests: the values this cook has already
    /// typed, most recent first. One keyed document read, whatever the library size.
    static func coffeeVocabulary() async throws -> CoffeeVocabulary {
        let data = try await GraphQLHelpers.fetch(
            GraphQLClient.shared.apollo,
            query: ShuhariGraphQL.CoffeeVocabularyQuery()
        )
        let vocabulary = data.coffeeVocabulary
        return CoffeeVocabulary(
            beanNames: vocabulary.beanNames,
            countries: vocabulary.countries,
            producers: vocabulary.producers,
            waterKinds: vocabulary.waterKinds,
            milkKinds: vocabulary.milkKinds,
            machines: vocabulary.machines,
            grinders: vocabulary.grinders
        )
    }

    /// Replace the recipe's cautions with the complete list — rewritten in place,
    /// no version created. An empty list clears the banner.
    static func updateWarnings(id: String, warnings: [String]) async throws {
        _ = try await GraphQLHelpers.perform(
            GraphQLClient.shared.apollo,
            mutation: ShuhariGraphQL.UpdateWarningsMutation(recipeId: id, warnings: warnings)
        )
    }
}

// MARK: - Mapping

func mapRecipe(_ r: ShuhariGraphQL.RecipeQuery.Data.Recipe) -> Recipe {
    Recipe(
        id: r.id,
        title: r.title,
        type: RecipeType(graphql: r.type),
        category: DishCategory(graphql: r.category),
        method: BrewMethod(graphql: r.method),
        favorite: r.favorite,
        warnings: r.warnings,
        versions: r.versions.map { mapVersion($0.fragments.versionFields) },
        bestRating: r.bestRating,
        versionToOpen: mapVersion(r.versionToOpen.fragments.versionFields)
    )
}

func mapVersion(_ v: ShuhariGraphQL.VersionFields) -> RecipeVersion {
    RecipeVersion(
        number: v.number,
        basedOn: v.basedOn,
        change: v.change,
        why: v.why,
        originKind: VersionOriginKind(graphql: v.originKind),
        originDetail: v.originDetail,
        content: mapVersionContent(v.content.fragments.versionContentFields),
        tips: v.tips,
        recipeId: v.recipeId,
        toTest: v.toTest,
        rating: v.rating,
        remarks: v.remarks,
        executedAt: v.executedAt.flatMap { GraphQLHelpers.parseISO8601($0) },
        photoUrl: v.photoUrl,
        createdAt: GraphQLHelpers.parseISO8601(v.createdAt) ?? Date(),
        updatedAt: GraphQLHelpers.parseISO8601(v.updatedAt) ?? Date()
    )
}

func mapProposal(_ d: ShuhariGraphQL.ProposalFields) -> Proposal {
    Proposal(
        basedOn: d.basedOn,
        changeSummary: d.changeSummary,
        rationale: d.rationale,
        content: mapVersionContent(d.content.fragments.versionContentFields),
        tips: d.tips
    )
}

/// The version-body union → the Swift `VersionContent`. An unknown `__typename`
/// (a content type the app doesn't know yet) maps to an empty dish, matching the
/// lenient unknown-enum style in `RecipeType+GraphQL.swift`.
func mapVersionContent(_ c: ShuhariGraphQL.VersionContentFields) -> VersionContent {
    if let dish = c.asDishContent {
        return .dish(
            ingredients: dish.ingredients.map { Ingredient(name: $0.name, quantity: $0.quantity) },
            steps: dish.dishSteps
        )
    }
    if let thermomix = c.asThermomixContent {
        return .thermomix(
            ingredients: thermomix.ingredients.map { Ingredient(name: $0.name, quantity: $0.quantity) },
            steps: thermomix.thermomixSteps.map { step in
                ThermomixStep(
                    text: step.text,
                    settings: ThermomixSettings(
                        time: step.settings.time,
                        temperature: step.settings.temperature,
                        speed: step.settings.speed,
                        reverse: step.settings.reverse ?? false
                    )
                )
            }
        )
    }
    if let coffee = c.asCoffeeContent {
        return .coffee(
            parameters: CoffeeParameters(
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
                // A nil block is a drink with no milk at all — not an empty one.
                milk: coffee.milk.map {
                    CoffeeMilk(kind: $0.kind, amount: $0.amount, temperature: $0.temperature)
                },
                gear: CoffeeGear(machine: coffee.gear.machine, grinder: coffee.gear.grinder)
            )
        )
    }
    return .dish(ingredients: [], steps: [])
}
