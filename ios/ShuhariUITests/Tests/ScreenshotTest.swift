import XCTest

/// Captures a screenshot of each main screen for the design review.
@MainActor
final class ScreenshotTest: XCTestCase {
    var app: XCUIApplication!

    override func setUp() async throws {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launchArguments = ["-serverURLDev", "http://localhost:3000", "-serverMode", "dev", "-UITestPhoto"]
        app.launch()
    }

    override func tearDown() async throws {
        app.terminate()
    }

    func testCaptureAllScreenshots() throws {
        let tabBar = TabBarPage(app: app)
        try tabBar.verify()

        // 1. Home (cooking tab)
        let home = try tabBar.goToCooking().verify()
        saveScreenshot("home")

        // 2. First recipe sheet, if any
        let firstRow = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "recipe-row-")).firstMatch
        if firstRow.waitForExistence(timeout: 4) {
            firstRow.tap()
            try RecipeDetailPage(app: app).verify()
            saveScreenshot("recipe-detail")
        }
        _ = home

        // 3. Import (camera-first screen)
        _ = try tabBar.goToImport()
        saveScreenshot("import")
    }

    private func saveScreenshot(_ name: String) {
        let screenshot = XCUIScreen.main.screenshot()
        let projectRoot = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // Tests/
            .deletingLastPathComponent() // ShuhariUITests/
            .deletingLastPathComponent() // ios/
            .deletingLastPathComponent() // project root
        let dir = projectRoot.appendingPathComponent("screenshots")
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let url = dir.appendingPathComponent("\(name).png")
        do {
            try screenshot.pngRepresentation.write(to: url)
        } catch {
            XCTFail("Failed to save screenshot '\(name)' to \(url.path): \(error)")
        }
    }
}
