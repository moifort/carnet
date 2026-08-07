import SwiftUI

/// The paginated library, always cut into sections along the axis it is sorted on:
/// the month of the last update ("Juillet 2026"), the dish course ("Entrée",
/// "Plat", …) or the brew method ("Espresso", "V60", …), the server ordering the
/// rows within a section either way. Each row navigates into the recipe sheet and
/// prefetches the next page as it appears; a `LoadMoreRow` sentinel closes the
/// list while more pages remain. Composes as `Section`s / rows directly inside a
/// `List`. Serves both the cooking notebook and the coffee tab.
struct LibrarySection: View {
    let recipes: [LibraryRecipe]
    /// The section axis: `.month` for the "Dernière modification" sort, `.course`
    /// for "Type de plat", `.method` for the coffee tab's "Méthode".
    let grouping: LibraryGrouping
    var hasMore: Bool = false
    var loadMoreFailed: Bool = false
    var onPrefetch: (String) -> Void = { _ in }
    var onLoadMore: () async -> Void = {}

    var body: some View {
        switch grouping {
        case .month:
            ForEach(LibraryMonthGroup.grouping(recipes)) { group in
                section(group.label, group.recipes)
            }
        case .course:
            ForEach(LibraryCourseGroup.grouping(recipes)) { group in
                section(group.label, group.recipes)
            }
        case .method:
            ForEach(LibraryMethodGroup.grouping(recipes)) { group in
                section(group.label, group.recipes)
            }
        }

        if hasMore {
            LoadMoreRow(
                failed: loadMoreFailed,
                loadingLabel: "Chargement d’autres recettes",
                onLoadMore: onLoadMore
            )
        }
    }

    private func section(_ label: String, _ recipes: [LibraryRecipe]) -> some View {
        Section {
            ForEach(recipes) { recipe in
                row(recipe)
            }
        } header: {
            Text(label)
        }
    }

    @ViewBuilder
    private func row(_ recipe: LibraryRecipe) -> some View {
        ZStack {
            // A zero-opacity link keeps the row tappable without the List's chevron.
            NavigationLink(value: RecipeRoute.recipe(id: recipe.id)) { EmptyView() }
                .opacity(0)
            LibraryRow(
                title: recipe.title,
                type: recipe.type,
                category: recipe.category,
                method: recipe.method,
                versionCount: recipe.versionCount,
                toTestCount: recipe.toTestCount,
                bestRating: recipe.bestRating,
                favorite: recipe.favorite
            )
        }
        .accessibilityIdentifier("recipe-row-\(recipe.id)")
        .onAppear { onPrefetch(recipe.id) }
    }
}

#if DEBUG
#Preview("Par mois") {
    NavigationStack {
        List {
            LibrarySection(recipes: Fixtures.libraryRecipes, grouping: .month, hasMore: true)
        }
    }
}

#Preview("Par type de plat") {
    NavigationStack {
        List {
            LibrarySection(recipes: Fixtures.libraryRecipes, grouping: .course)
        }
    }
}

#Preview("Par méthode") {
    NavigationStack {
        List {
            LibrarySection(recipes: Fixtures.coffeeRecipes, grouping: .method)
        }
    }
}
#endif
