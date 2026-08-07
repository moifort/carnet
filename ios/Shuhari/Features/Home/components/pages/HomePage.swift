import SwiftUI

/// A library home screen: the paginated recipe library. Pure presentation —
/// navigation, pagination and API calls are owned by `HomeView` (cooking) and
/// `CoffeeView`. The library is a server-sorted, infinitely scrolling page
/// (`library` + the `library*` flags and callbacks).
struct HomePage: View {
    /// The lens picker of the notebook toolbar, rendered as round glass buttons —
    /// the whole library, then the favourites. `nil` hides the selector (loading
    /// gallery screens).
    struct LensPicker {
        let options: [LibraryLens]
        let selection: Binding<LibraryLens>
    }

    /// The server-side facet of the filter+sort menu, in primitives: the page knows
    /// it is filtering on *something* with a label and an icon, not whether that
    /// something is a dish course or a brew method. Each tab passes its own.
    struct Facet {
        struct Option: Identifiable {
            let id: String
            let label: String
            let systemImage: String
        }

        /// The picker's own label, e.g. `"Catégorie"` or `"Méthode"`.
        let title: String
        /// What the "no facet" row reads, e.g. `"Toutes"`.
        let allLabel: String
        let options: [Option]
        /// The selected option's id — `nil` = no facet.
        let selection: Binding<String?>
    }

    let library: [LibraryRecipe]
    /// The library section axis: month of last update, dish course, or brew method.
    let libraryGrouping: LibraryGrouping
    let libraryLoading: Bool
    let libraryHasMore: Bool
    let libraryLoadMoreFailed: Bool
    let title: String
    let lensPicker: LensPicker?
    /// The orders this tab offers — `RecipeSortOption.cooking` or `.coffee`.
    var sortOptions: [RecipeSortOption] = RecipeSortOption.cooking
    let sort: Binding<RecipeSortOption>
    let facet: Facet
    /// Copy for the genuinely empty, unfiltered library — the first-run nudge.
    var emptyFirstRunMessage = "Importe ta première recette depuis l’onglet Importer — photo, texte ou lien."
    let onSettings: () -> Void
    var onPrefetch: (String) -> Void = { _ in }
    var onLoadMore: () async -> Void = {}

    var body: some View {
        content
            .navigationTitle(title)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button(action: onSettings) {
                        Image(systemName: "gearshape")
                    }
                    .accessibilityIdentifier("home-settings-button")
                    .accessibilityLabel("Réglages")
                }
                if let picker = lensPicker {
                    ToolbarItemGroup(placement: .topBarTrailing) {
                        ForEach(picker.options) { lens in
                            let isSelected = picker.selection.wrappedValue == lens
                            Button {
                                picker.selection.wrappedValue = lens
                            } label: {
                                lens.iconImage(filled: isSelected)
                            }
                            .tint(isSelected ? lens.selectedTint : .primary)
                            .accessibilityLabel(lens.label)
                            .accessibilityIdentifier("home-lens-\(lens.id)")
                        }
                    }
                    // Break out of the lens capsule so the filter+sort menu reads as
                    // its own control on Liquid Glass (otherwise they merge).
                    ToolbarSpacer(.fixed, placement: .topBarTrailing)
                }
                // The combined filter + sort menu, detached from the type filter.
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Picker("Trier", selection: sort) {
                            ForEach(sortOptions) { option in
                                Label(option.label, systemImage: option.icon).tag(option)
                            }
                        }
                        Divider()
                        Picker(facet.title, selection: facet.selection) {
                            Label(facet.allLabel, systemImage: "circle.dashed")
                                .tag(String?.none)
                                .accessibilityIdentifier("library-facet-all")
                            ForEach(facet.options) { option in
                                Label(option.label, systemImage: option.systemImage)
                                    .tag(String?.some(option.id))
                                    .accessibilityIdentifier("library-facet-\(option.id)")
                            }
                        }
                    } label: {
                        Image(systemName: "line.3.horizontal.decrease")
                            .symbolVariant(facet.selection.wrappedValue != nil ? .fill : .none)
                    }
                    .accessibilityLabel("Filtrer et trier")
                    .accessibilityIdentifier("library-sort-menu")
                }
            }
    }

    /// Empty-library copy. A facet that yields nothing (favourites, a dish course, a
    /// brew method) isn't a first-run state — the library may well hold other
    /// recipes — so only the genuinely empty, unfiltered one nudges the user to import.
    private var emptyStateMessage: String {
        if facet.selection.wrappedValue != nil {
            return "Aucune recette dans cette catégorie pour l’instant."
        }
        if lensPicker?.selection.wrappedValue == .favorites {
            return "Aucun favori pour l’instant — ajoute-les depuis la fiche d’une recette."
        }
        // The `.all` lens narrows nothing: an empty library there IS the first-run state.
        return emptyFirstRunMessage
    }

    @ViewBuilder
    private var content: some View {
        if library.isEmpty {
            if libraryLoading {
                // Cold functions make the first load slow: the looping flask
                // (fill → boil away → refill) owns the wait instead of a bare spinner.
                VStack(spacing: 16) {
                    LiquidFlask(size: 80, tint: .primary)
                    Text("Chargement des recettes…")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            } else {
                ContentUnavailableView {
                    Label("Aucune recette", systemImage: "camera.viewfinder")
                } description: {
                    Text(emptyStateMessage)
                }
            }
        } else {
            List {
                LibrarySection(
                    recipes: library,
                    grouping: libraryGrouping,
                    hasMore: libraryHasMore,
                    loadMoreFailed: libraryLoadMoreFailed,
                    onPrefetch: onPrefetch,
                    onLoadMore: onLoadMore
                )
            }
            .scrollEdgeEffectStyle(.soft, for: .top)
        }
    }
}

// MARK: - Facet builders

extension HomePage.Facet {
    /// The dish-course facet, bridging `DishCategory` to the page's primitives.
    static func course(selection: Binding<DishCategory?>) -> Self {
        Self(
            title: "Catégorie",
            allLabel: "Toutes",
            options: DishCategory.allCases.map {
                Option(id: $0.rawValue, label: $0.label, systemImage: $0.iconName)
            },
            selection: Binding(
                get: { selection.wrappedValue?.rawValue },
                set: { selection.wrappedValue = $0.flatMap(DishCategory.init(rawValue:)) }
            )
        )
    }

    /// The brew-method facet, the coffee tab's counterpart.
    static func method(selection: Binding<BrewMethod?>) -> Self {
        Self(
            title: "Méthode",
            allLabel: "Toutes",
            options: BrewMethod.allCases.map {
                Option(id: $0.rawValue, label: $0.label, systemImage: $0.iconName)
            },
            selection: Binding(
                get: { selection.wrappedValue?.rawValue },
                set: { selection.wrappedValue = $0.flatMap(BrewMethod.init(rawValue:)) }
            )
        )
    }
}

#if DEBUG
private struct HomePagePreview: View {
    @State private var lens: LibraryLens = .all
    @State private var sort: RecipeSortOption = .lastModified
    @State private var category: DishCategory?

    var body: some View {
        let library = Fixtures.libraryRecipes.filter { recipe in
            switch lens {
            case .all: true
            case .favorites: recipe.favorite
            }
        }
        NavigationStack {
            HomePage(
                library: library,
                libraryGrouping: sort == .lastModified ? .month : .course,
                libraryLoading: false,
                libraryHasMore: false,
                libraryLoadMoreFailed: false,
                title: "Cuisine",
                lensPicker: .init(options: [.all, .favorites], selection: $lens),
                sort: $sort,
                facet: .course(selection: $category),
                onSettings: {}
            )
        }
    }
}

private struct CoffeePagePreview: View {
    @State private var sort: RecipeSortOption = .brewMethod
    @State private var method: BrewMethod?

    var body: some View {
        NavigationStack {
            HomePage(
                library: Fixtures.coffeeRecipes,
                libraryGrouping: sort == .lastModified ? .month : .method,
                libraryLoading: false,
                libraryHasMore: false,
                libraryLoadMoreFailed: false,
                title: "Café",
                lensPicker: nil,
                sortOptions: RecipeSortOption.coffee,
                sort: $sort,
                facet: .method(selection: $method),
                onSettings: {}
            )
        }
    }
}

#Preview {
    HomePagePreview()
}

#Preview("Café") {
    CoffeePagePreview()
}

#Preview("Premier chargement") {
    NavigationStack {
        HomePage(
            library: [],
            libraryGrouping: .month,
            libraryLoading: true,
            libraryHasMore: false,
            libraryLoadMoreFailed: false,
            title: "Cuisine",
            lensPicker: nil,
            sort: .constant(.lastModified),
            facet: .course(selection: .constant(nil)),
            onSettings: {}
        )
    }
}

#Preview("Chargement de plus") {
    NavigationStack {
        HomePage(
            library: Fixtures.libraryRecipes,
            libraryGrouping: .month,
            libraryLoading: false,
            libraryHasMore: true,
            libraryLoadMoreFailed: false,
            title: "Cuisine",
            lensPicker: nil,
            sort: .constant(.lastModified),
            facet: .course(selection: .constant(nil)),
            onSettings: {}
        )
    }
}
#endif
