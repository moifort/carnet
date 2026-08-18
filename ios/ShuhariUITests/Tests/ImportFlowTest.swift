import XCTest

/// Import loop: raw text → AI analysis → editable preview → createRecipe (v1) →
/// the new recipe's recipe sheet.
final class ImportFlowTest: BaseUITest {

    func testImportFromText() async throws {
        let tabBar = TabBarPage(app: app)
        try tabBar.verify()

        let importPage = try tabBar.goToImport()
        _ = try importPage.typeRecipe("Cacio e pepe : 200 g de spaghetti, 100 g de pecorino romano, 2 c. à café de poivre noir, un peu d'eau de cuisson.")

        let preview = try importPage.analyze().verify()
        try preview.verifyTitleField()
        try preview.verifyCategoryPicker()

        let recipe = try preview.save()
        try recipe.verify()
    }
}
