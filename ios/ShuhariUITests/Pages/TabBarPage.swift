import XCTest

@MainActor
struct TabBarPage {
    let app: XCUIApplication

    @discardableResult
    func verify() throws -> Self {
        try app.tabBars.firstMatch.waitOrFail()
        return self
    }

    /// Tap the cooking content tab — "Cuisine" (all cooking recipes: dishes & Thermomix).
    /// It opens on the `.all` lens, whose label titles the navigation bar.
    @discardableResult
    func goToCooking() throws -> HomePage {
        try app.tabBars.buttons["Cuisine"].tapOrFail()
        return HomePage(app: app, title: "Tout")
    }

    @discardableResult
    func goToImport() throws -> ImportPage {
        try app.tabBars.buttons["Importer"].tapOrFail()
        return ImportPage(app: app)
    }
}
