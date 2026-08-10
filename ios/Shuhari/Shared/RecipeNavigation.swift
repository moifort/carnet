import Foundation

/// Push destinations inside the notebook `NavigationStack`. One entry: a recipe. The
/// version shown inside it is a state of that screen, not a destination of its own —
/// picking versions is reading one recipe, and a stack that grew one screen per pick
/// kept every one of them alive, reloading and redrawing behind the one on top.
enum RecipeRoute: Hashable {
    case recipe(id: String)
}

/// A request to run the execution flow on a given version, presented as a sheet from
/// the recipe's record CTA.
struct ExecutionRequest: Identifiable, Hashable {
    let recipeId: String
    let versionNumber: Int

    var id: String { "\(recipeId)#\(versionNumber)" }
}

/// Identifiable wrapper to drive a `.sheet(item:)` from a recipe id.
struct RecipeIdWrapper: Identifiable {
    let id: String
}

/// A freshly imported recipe handed from the import flow to the notebook tab,
/// which then navigates to the new recipe sheet.
struct ImportedRecipe: Equatable {
    let id: String
}
