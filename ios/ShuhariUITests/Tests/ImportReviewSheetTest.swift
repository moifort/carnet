import XCTest

/// Regression: the text-entry import path must hand off to the review sheet.
/// Tapping "Analyser" dismisses the composer and, via its `onDismiss`, presents
/// the `ImportReviewSheet` (nav title "Analyse", AI loader) over the content tab.
/// Runs against the `-gallery root` harness — no server needed: we only assert
/// the review sheet is presented (analyzing phase), not the AI result.
@MainActor
final class ImportReviewSheetTest: XCTestCase {
    var app: XCUIApplication!

    override func setUp() async throws {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launchArguments = ["-gallery", "root"]
        app.launch()
    }

    override func tearDown() async throws {
        app.terminate()
    }

    func testTextEntryPresentsReviewSheet() throws {
        try app.tabBars.firstMatch.waitOrFail()

        // The import entry opens straight on the composer.
        try app.tabBars.buttons["Importer"].tapOrFail()

        // Type a recipe and analyse.
        let field = app.textViews["import-text-field"].exists
            ? app.textViews["import-text-field"]
            : app.textFields["import-text-field"]
        try field.tapOrFail()
        field.typeText("200 g de spaghetti, 100 g de pecorino")
        try app.buttons["analyze-button"].tapOrFail()

        // The review sheet (analyzing phase) must appear — its nav bar is "Analyse".
        XCTAssertTrue(
            app.navigationBars["Analyse"].waitForExistence(timeout: 6),
            "The review sheet should appear after tapping Analyser"
        )
    }
}
