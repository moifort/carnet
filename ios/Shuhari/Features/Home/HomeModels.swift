import Foundation

/// A library row: how many versions the recipe has and its best attempt rating
/// ("the highest star" across every version it ever cooked).
struct LibraryRecipe: Identifiable, Sendable {
    let id: String
    let title: String
    let type: RecipeType
    let category: DishCategory
    /// How it is brewed — nil on anything that is not a coffee.
    var method: BrewMethod? = nil
    let favorite: Bool
    let versionCount: Int
    /// How many of those versions are waiting to be cooked — `0` when none is.
    let toTestCount: Int
    let bestRating: Int?
    let updatedAt: Date
}

/// How the library cuts its rows into sections — one axis per sort: the month of
/// the last update, the dish course, or the brew method in the coffee tab.
enum LibraryGrouping: Sendable {
    case month
    case course
    case method
}

/// One course's worth of library recipes — the library is grouped by dish course
/// ("Entrée", "Plat", …) when sorted by "Type de plat".
struct LibraryCourseGroup: Identifiable, Sendable {
    let id: String
    let label: String
    let recipes: [LibraryRecipe]

    /// Cut accumulated (already server-sorted) recipes into course sections. The
    /// section order is the course order itself — `DishCategory.allCases` mirrors the
    /// server's `categoryRank` — and within a course the server's order (most
    /// recently updated first) is kept as is. Empty courses have no section.
    static func grouping(_ recipes: [LibraryRecipe]) -> [LibraryCourseGroup] {
        DishCategory.allCases.compactMap { course in
            let rows = recipes.filter { $0.category == course }
            guard !rows.isEmpty else { return nil }
            return LibraryCourseGroup(id: course.rawValue, label: course.label, recipes: rows)
        }
    }
}

/// One brew method's worth of coffees — the coffee tab is grouped by method
/// ("Espresso", "V60", …) when sorted by "Méthode".
struct LibraryMethodGroup: Identifiable, Sendable {
    let id: String
    let label: String
    let recipes: [LibraryRecipe]

    /// Cut accumulated (already server-sorted) coffees into method sections. The
    /// section order is the brewing order itself — `BrewMethod.allCases` mirrors
    /// the server's `methodRank` — and within a method the server's order (most
    /// recently updated first) is kept as is. Empty methods have no section.
    static func grouping(_ recipes: [LibraryRecipe]) -> [LibraryMethodGroup] {
        BrewMethod.allCases.compactMap { method in
            let rows = recipes.filter { $0.method == method }
            guard !rows.isEmpty else { return nil }
            return LibraryMethodGroup(id: method.rawValue, label: method.label, recipes: rows)
        }
    }
}

/// One month's worth of library recipes — the library is grouped by the month of
/// each recipe's last update (e.g. "Juillet 2026") instead of by type.
struct LibraryMonthGroup: Identifiable, Sendable {
    /// A sortable `yyyy-MM` key that also identifies the section.
    let id: String
    let label: String
    let recipes: [LibraryRecipe]

    /// Group accumulated (already server-sorted) recipes by the month of their last
    /// update — most recent month first, and within a month the most recently updated
    /// first. Used by the paginated library when sorted by "Dernière modification".
    static func grouping(_ recipes: [LibraryRecipe]) -> [LibraryMonthGroup] {
        let calendar = Calendar.current
        let buckets = Dictionary(grouping: recipes) { recipe in
            calendar.dateComponents([.year, .month], from: recipe.updatedAt)
        }
        return buckets
            .map { components, recipes in
                LibraryMonthGroup(
                    id: MonthLabel.id(components),
                    label: MonthLabel.of(components, calendar: calendar),
                    recipes: recipes.sorted { $0.updatedAt > $1.updatedAt }
                )
            }
            .sorted { $0.id > $1.id }
    }
}
