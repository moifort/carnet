import Foundation

/// The ways a library can be ordered, exposed through the sort menu. Pure design
/// tokens (label + icon); the mapping to the GraphQL `RecipeSort`/`SortOrder` pair
/// lives in `LibraryAPI` so this stays decoupled from the generated types. Which
/// options a tab offers is the tab's call — `cooking` and `coffee` below.
enum RecipeSortOption: String, CaseIterable, Identifiable, Sendable {
    /// Most recently modified first (`UPDATED_AT` / `DESC`) — the default.
    case lastModified
    /// Fixed dish-course order (`CATEGORY`) — starter → main → dessert → soup →
    /// sauce → baking, most recently modified first within a course.
    case dishCategory
    /// Fixed brewing order (`METHOD`) — espresso → … → cold brew, most recently
    /// modified first within a method.
    case brewMethod

    var id: String { rawValue }

    /// What the cooking notebook offers: a coffee is never sorted by dish course.
    static let cooking: [RecipeSortOption] = [.lastModified, .dishCategory]
    /// What the coffee tab offers.
    static let coffee: [RecipeSortOption] = [.lastModified, .brewMethod]

    var label: String {
        switch self {
        case .lastModified: "Dernière modification"
        case .dishCategory: "Type de plat"
        case .brewMethod: "Méthode"
        }
    }

    var icon: String {
        switch self {
        case .lastModified: "clock"
        case .dishCategory: "fork.knife"
        case .brewMethod: "cup.and.saucer"
        }
    }
}
