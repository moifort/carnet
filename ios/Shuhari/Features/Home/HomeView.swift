import SwiftUI

/// The notebook content tab (cooking — dishes & Thermomix). Owns the
/// NavigationStack, the settings sheet and the recipe flow (recipe sheet → history →
/// version → proposal + execution cover), and a `LibraryStore` for the paginated,
/// server-sorted recipe library that fills the screen.
struct HomeView: View {
    @Binding var importedRecipe: ImportedRecipe?

    @State private var library = LibraryStore()
    /// The recipe flow's one state, for every screen the stack pushes.
    @State private var recipes = RecipeStore()
    @State private var path = NavigationPath()
    @State private var showSettings = false
    /// The notebook opens on the whole library — every type, no facet.
    @State private var lens: LibraryLens = .all

    var body: some View {
        @Bindable var library = library
        NavigationStack(path: $path) {
            Group {
                // Full-screen error only on an empty first load — a transient
                // load-more failure keeps the populated list and surfaces through
                // the in-list "Réessayer" row (libraryLoadMoreFailed) instead.
                if let error = library.error, library.items.isEmpty {
                    ContentUnavailableView("Erreur", systemImage: "exclamationmark.triangle", description: Text(error))
                } else {
                    HomePage(
                        library: library.items,
                        // Month sections apply whenever the effective order is
                        // chronological — that includes an active category filter,
                        // which the server coerces to updatedAt desc regardless of
                        // `sort` (and leaves a single course to section anyway).
                        libraryGrouping: library.sort == .lastModified || library.category != nil
                            ? .month
                            : .course,
                        libraryLoading: library.isLoading,
                        libraryHasMore: library.hasMore,
                        libraryLoadMoreFailed: library.loadMoreFailed,
                        title: lens.label,
                        lensPicker: .init(options: [.all, .favorites], selection: $lens),
                        sortOptions: RecipeSortOption.cooking,
                        sort: $library.sort,
                        facet: .course(selection: $library.category),
                        onSettings: { showSettings = true },
                        onPrefetch: { library.prefetchIfNeeded(for: $0) },
                        onLoadMore: { await library.loadMore() }
                    )
                }
            }
            .recipeFlow(
                store: recipes,
                path: $path,
                onReload: { Task { await reloadAll() } },
                onDelete: { library.delete(recipeId: $0) },
                onDeleteVersion: { library.deleteVersion(recipeId: $0, number: $1) }
            )
        }
        .task {
            await loadLibraryIfNeeded()
        }
        .refreshable { await reloadAll() }
        .onChange(of: lens) { _, newValue in
            apply(newValue)
        }
        .sheet(isPresented: $showSettings) {
            SettingsHomeView(onDataReplaced: { await reloadAll() })
        }
        .onChange(of: importedRecipe) { _, _ in navigateToImportedIfNeeded() }
        .onAppear { navigateToImportedIfNeeded() }
    }

    /// Point the library at a lens: its facet, and the order it opens on.
    private func apply(_ lens: LibraryLens) {
        library.favorite = lens == .favorites
        library.sort = lens.defaultSort
    }

    /// Kick off the first library page. The facets reload via their `didSet` when they
    /// change; on an unchanged lens, load explicitly.
    private func loadLibraryIfNeeded() async {
        let before = (library.favorite, library.sort)
        apply(lens)
        if (library.favorite, library.sort) == before, library.items.isEmpty {
            await library.load()
        }
    }

    /// Reload the library after a mutation, pull-to-refresh, or a new import.
    private func reloadAll() async {
        await library.load()
    }

    /// Push the freshly imported recipe's recipe sheet, back on the whole library —
    /// a favourites lens would hide the newcomer behind the sheet. Handles both the
    /// already-mounted tab (`onChange`) and the tab that mounts on selection right
    /// after the import (`onAppear`).
    private func navigateToImportedIfNeeded() {
        guard let recipe = importedRecipe else { return }
        lens = .all
        path.append(RecipeRoute.recipe(id: recipe.id))
        importedRecipe = nil
        Task { await reloadAll() }
    }
}

#Preview {
    HomeView(importedRecipe: .constant(nil))
}
