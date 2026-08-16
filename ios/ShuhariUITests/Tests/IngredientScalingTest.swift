import XCTest

/// Ephemeral quantity scaling on the recipe sheet: stepping one ingredient's
/// quantity rescales the whole shopping list proportionally, and reset lands back
/// on the stored recipe. Runs offline against the debug gallery's fixture
/// (Bœuf bourguignon v3) — no server, deterministic quantities.
@MainActor
final class IngredientScalingTest: XCTestCase {
    var app: XCUIApplication!

    override func setUp() async throws {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launchArguments = ["-gallery", "recipe"]
        app.launch()
    }

    override func tearDown() async throws {
        app.terminate()
    }

    func testSteppingOneIngredientRescalesTheWholeList() throws {
        let recipe = RecipeDetailPage(app: app)

        // The stored v3 quantities: beef 1,2 kg / lardons 200 g / red wine 75 cl / flour 30 g.
        let beef = try recipe.ingredientQuantity(0).waitOrFail()
        XCTAssertEqual(beef.label, "1,2 kg")

        // Above a kilo a tick is worth 100 g — a tenth of the unit it displays as.
        // Two of them: 1200 → 1000 g, factor 0,8333.
        for _ in 0..<2 { try recipe.stepIngredient(0, down: true) }
        XCTAssertEqual(beef.label, "1 kg")

        // Every other line followed the factor, each on its own kitchen grain.
        XCTAssertEqual(recipe.ingredientQuantity(1).label, "165 g") // lardons 200 × 0,8333
        XCTAssertEqual(recipe.ingredientQuantity(4).label, "62,5 cl") // red wine 75 cl, kept in cl
        XCTAssertEqual(recipe.ingredientQuantity(6).label, "25 g") // flour 30 g

        // Reset drops the factor: back to the stored recipe.
        try recipe.resetScaling()
        XCTAssertEqual(beef.label, "1,2 kg")
        XCTAssertEqual(recipe.ingredientQuantity(1).label, "200 g")
        XCTAssertFalse(app.buttons["ingredients-reset"].exists)
    }

    func testSpoonQuantityRescalesItsGramEquivalent() throws {
        let recipe = RecipeDetailPage(app: app)

        // The AI writes spoon quantities with their gram estimate in parentheses.
        let spoon = try recipe.ingredientQuantity(8).waitOrFail()
        XCTAssertEqual(spoon.label, "1 c. à soupe (15 g)")

        // One −½ tick on the spoon: the grams follow the count, and the whole
        // list follows the factor 0,5.
        try recipe.stepIngredient(8, down: true)
        XCTAssertEqual(spoon.label, "0,5 c. à soupe (7,5 g)")
        XCTAssertEqual(recipe.ingredientQuantity(0).label, "600 g") // beef 1,2 kg × 0,5

        try recipe.resetScaling()
        XCTAssertEqual(spoon.label, "1 c. à soupe (15 g)")
    }
}
