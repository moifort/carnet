import XCTest

@MainActor
struct ImportPage {
    let app: XCUIApplication

    @discardableResult
    func typeRecipe(_ text: String) throws -> Self {
        let field = app.textViews["import-text-field"].exists ? app.textViews["import-text-field"] : app.textFields["import-text-field"]
        try field.tapOrFail()
        field.typeText(text)
        return self
    }

    @discardableResult
    func analyze() throws -> ImportPreviewPage {
        try app.buttons["analyze-button"].tapOrFail()
        return ImportPreviewPage(app: app)
    }
}

@MainActor
struct ImportPreviewPage {
    let app: XCUIApplication

    @discardableResult
    func verify() throws -> Self {
        // The analysis overlay can take a few seconds (AI round-trip).
        try app.buttons["save-recipe-button"].waitOrFail(timeout: 20)
        return self
    }

    func verifyTitleField() throws {
        try app.textFields["import-title-field"].waitOrFail()
    }

    /// The cooking-only preview surfaces a dish-category Picker (Entrée, Plat, …)
    /// the AI pre-selects; assert it is present so the model change is covered.
    func verifyCategoryPicker() throws {
        // A Form Picker surfaces as a button (menu) or an otherElement depending
        // on the OS; match on the identifier regardless of element type.
        let picker = app.descendants(matching: .any)["import-category-picker"].firstMatch
        try picker.waitOrFail(timeout: 2, "category picker not shown in the import preview")
    }

    @discardableResult
    func save() throws -> RecipeDetailPage {
        try app.buttons["save-recipe-button"].tapOrFail()
        return RecipeDetailPage(app: app)
    }
}
