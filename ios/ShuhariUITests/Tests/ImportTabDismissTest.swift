import XCTest

/// Regression: closing the camera import cover with the X must return to the
/// previously selected category tab — not leave the tab bar stuck on the empty
/// "Importer" entry. Runs against the `-gallery root` harness so it needs no
/// server or signed-in user (the tab-selection logic is pure client state).
@MainActor
final class ImportTabDismissTest: XCTestCase {
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

    func testClosingImportReturnsToPreviousTab() throws {
        let tabBar = app.tabBars.firstMatch
        try tabBar.waitOrFail()

        // Start on the cooking tab (the default one).
        XCTAssertTrue(app.tabBars.buttons["Cuisine"].isSelected, "Cuisine should be selected on launch")

        // Open the camera import cover, then close it with the X.
        try app.tabBars.buttons["Importer"].tapOrFail()
        try app.buttons["scan-close-button"].tapOrFail()

        // Back on the tab bar: the cooking tab must still be selected, and the
        // "Importer" entry must never appear selected (its content is empty).
        try tabBar.waitOrFail()
        XCTAssertFalse(app.tabBars.buttons["Importer"].isSelected, "Importer must not stay selected after closing the cover")
        XCTAssertTrue(app.tabBars.buttons["Cuisine"].isSelected, "Cuisine should be restored after closing the cover")
    }
}
