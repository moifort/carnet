import XCTest

/// Resizing a recipe from its edit sheet: stepping one quantity carries the whole
/// list along the same factor, and what the sheet shows is what it would save. Runs
/// offline against the debug gallery's bread fixture, picked so every rung of the
/// ladder shows — a value off its grain, one written with a decimal, one unmeasured.
@MainActor
final class IngredientsEditScalingTest: XCTestCase {
    var app: XCUIApplication!

    override func setUp() async throws {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launchArguments = ["-gallery", "ingredients-edit-bread"]
        app.launch()
    }

    override func tearDown() async throws {
        app.terminate()
    }

    /// A tick snaps onto the grain instead of being added to the value, and every
    /// other line follows the factor it produced.
    func testSteppingOffTheGrainSnapsOntoItAndCarriesTheList() throws {
        let levain = try quantity(2).waitOrFail()
        XCTAssertEqual(levain.value as? String, "12 g")

        // Between 10 g and a kilo the grain is 5: 12 g goes down to 10, not to 7.
        try step(2, down: true)
        XCTAssertEqual(levain.value as? String, "10 g")

        // Factor 10/12 — the whole loaf shrank with it.
        XCTAssertEqual(quantity(0).value as? String, "415 g") // farine 500
        XCTAssertEqual(quantity(1).value as? String, "265 g") // eau 320
        XCTAssertEqual(quantity(3).value as? String, "1 g") // levure 1,2

        // A quantity the AI left unmeasured has nothing to multiply: no stepper, and
        // it stays exactly as written while everything around it moves.
        XCTAssertFalse(app.steppers["ingredient-edit-stepper-4"].exists)
        XCTAssertEqual(quantity(4).value as? String, "à goût")

        // Reset lands back on the stored list.
        try app.buttons["ingredient-edit-reset"].tapOrFail()
        XCTAssertEqual(levain.value as? String, "12 g")
        XCTAssertEqual(quantity(0).value as? String, "500 g")
        XCTAssertFalse(app.buttons["ingredient-edit-reset"].exists)
    }

    /// A quantity written with a decimal moves by tenths — rounding the 1,2 g of
    /// fresh yeast to a whole gram would change the loaf.
    func testADecimalQuantityMovesByTenths() throws {
        let yeast = try quantity(3).waitOrFail()
        XCTAssertEqual(yeast.value as? String, "1,2 g")

        try step(3, down: true)
        XCTAssertEqual(yeast.value as? String, "1,1 g")

        // Factor 1,1/1,2, and the rest of the list followed on its own grain.
        XCTAssertEqual(quantity(0).value as? String, "460 g") // farine 500
        XCTAssertEqual(quantity(2).value as? String, "11 g") // levain 12

        // And the tick is reversible: back up lands exactly on what was stored.
        try step(3, down: false)
        XCTAssertEqual(yeast.value as? String, "1,2 g")
        XCTAssertEqual(quantity(0).value as? String, "500 g")
    }

    // MARK: - Helpers

    private func quantity(_ index: Int) -> XCUIElement {
        app.textFields["ingredient-edit-quantity-\(index)"]
    }

    /// One −/+ tick on the row at `index`. The stepper's inner buttons carry system
    /// labels (locale-dependent), so fall back on their order: minus left, plus right.
    private func step(_ index: Int, down: Bool) throws {
        let stepper = try app.steppers["ingredient-edit-stepper-\(index)"].waitOrFail()
        let label = down ? "Decrement" : "Increment"
        let button = stepper.buttons[label].exists
            ? stepper.buttons[label]
            : stepper.buttons.element(boundBy: down ? 0 : 1)
        try button.tapOrFail()
    }
}
