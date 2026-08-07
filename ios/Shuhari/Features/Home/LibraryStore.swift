import Foundation

/// The paginated library read-model, backing both the notebook's recipe list and
/// the coffee tab's. Accumulates server pages of the `recipes(...)` query and
/// reloads page 0 whenever the sort or a facet changes. Mirrors the vinarium
/// `WineListViewModel` pattern: generation token against stale responses, prefetch
/// threshold for infinite scroll, a `LoadMoreRow` sentinel that flips to a retry
/// button on failure.
@MainActor @Observable
final class LibraryStore {
    /// Which recipe types this store reads — the one thing that tells the notebook
    /// (`RecipeType.cooking`) and the coffee tab (`[.coffee]`) apart. Fixed for the
    /// store's life: a tab never changes what it is about.
    private let types: [RecipeType]

    init(types: [RecipeType] = RecipeType.cooking) {
        self.types = types
    }

    /// Pages accumulated from the server, in the current sort order.
    private(set) var items: [LibraryRecipe] = []
    /// Starts true to avoid a "Aucune recette" flash before the first load().
    var isLoading = true
    var isLoadingMore = false
    var hasMore = false
    /// Last loadMore failed: the sentinel becomes a "Réessayer" button instead of a
    /// spinner that would spin forever without retrying.
    private(set) var loadMoreFailed = false
    var error: String?

    /// The dish-course vs. last-modified ordering. Any change reloads page 0.
    var sort: RecipeSortOption = .lastModified {
        didSet { if oldValue != sort { scheduleReload() } }
    }

    /// Server-side favourites facet: `true` keeps only the recipes marked as
    /// favourites, every type mixed. Any change reloads.
    var favorite = false {
        didSet { if oldValue != favorite { scheduleReload() } }
    }

    /// Server-side dish-category facet. `nil` = every category. Any change reloads.
    /// When set, the server coerces the ordering to updatedAt desc (ranking within a
    /// single course is meaningless) regardless of `sort`.
    var category: DishCategory? {
        didSet { if oldValue != category { scheduleReload() } }
    }

    /// Server-side brew-method facet, the coffee tab's counterpart of `category`.
    /// `nil` = every method. Coerces the ordering the same way when set.
    var method: BrewMethod? {
        didSet { if oldValue != method { scheduleReload() } }
    }

    private let pageSize = 20
    // Well below pageSize, otherwise the next page would load as soon as the first
    // appears (unintended chain loading).
    private let prefetchThreshold = 5
    private var reloadTask: Task<Void, Never>?
    // Stale-response guard: Apollo fetches aren't cancellable, so a response from a
    // previous sort/filter can arrive AFTER the current one. Each scheduleReload
    // invalidates earlier generations' responses.
    private var generation = 0

    /// Reload page 0, cancelling an in-flight reload (rapid filter changes). Empties
    /// the list and shows the loader so the view restarts from scratch. Called by the
    /// `didSet` hooks and by explicit refreshes.
    func scheduleReload() {
        reloadTask?.cancel()
        generation += 1
        items = []
        hasMore = false
        isLoadingMore = false // stale loadMores bail out without touching this
        loadMoreFailed = false
        isLoading = true
        reloadTask = Task { await load() }
    }

    /// Load the first page (on appear, pull-to-refresh, and after a mutation).
    /// Bumps the generation and clears the loadMore state — WITHOUT emptying `items`,
    /// so a pull-to-refresh doesn't flash — so any loadMore already in flight (its
    /// cursor points at the pre-refresh last row) fails its generation guard and can't
    /// append a stale page onto the fresh list.
    func load() async {
        generation += 1
        let requested = generation
        isLoadingMore = false
        loadMoreFailed = false
        isLoading = true
        error = nil
        do {
            let page = try await fetchPage(after: nil)
            guard requested == generation else { return } // response from a stale view
            items = page.items
            hasMore = page.hasMore
        } catch is CancellationError {
            return
        } catch {
            guard requested == generation else { return }
            self.error = reportError(error)
        }
        isLoading = false
    }

    /// Load the next page and append it to the recipes already loaded.
    func loadMore() async {
        guard hasMore, !isLoadingMore, let last = items.last else { return }
        let requested = generation
        isLoadingMore = true
        loadMoreFailed = false
        do {
            let page = try await fetchPage(after: last.id)
            guard requested == generation else { return }
            items.append(contentsOf: page.items)
            hasMore = page.hasMore
        } catch is CancellationError {
            return
        } catch {
            guard requested == generation else { return }
            loadMoreFailed = true
            self.error = reportError(error)
        }
        isLoadingMore = false
    }

    /// Delete a recipe optimistically, in the background: the row leaves the library at
    /// once — the recipe sheet closes without waiting — and the call follows. A failure
    /// is reported and the reload puts the recipe back where it was.
    func delete(recipeId: String) {
        items.removeAll { $0.id == recipeId }
        Task {
            do {
                try await RecipeAPI.deleteRecipe(id: recipeId)
            } catch {
                self.error = reportError(error)
                await load()
            }
        }
    }

    /// Delete one version in the background: the recipe sheet closes without waiting
    /// and the call follows. A failure is reported; the reload reflects whatever
    /// survived either way (the row's version count, its best rating).
    func deleteVersion(recipeId: String, number: Int) {
        Task {
            do {
                try await RecipeAPI.deleteVersion(recipeId: recipeId, number: number)
            } catch {
                self.error = reportError(error)
            }
            await load()
        }
    }

    /// Trigger the next page when a row near the end appears (infinite scroll).
    func prefetchIfNeeded(for recipeId: String) {
        guard hasMore, !isLoadingMore else { return }
        guard let index = items.firstIndex(where: { $0.id == recipeId }) else { return }
        if items.count - index <= prefetchThreshold {
            Task { await loadMore() }
        }
    }

    private func fetchPage(after: String?) async throws -> RecipePage {
        try await LibraryAPI.list(
            types: types,
            category: category,
            method: method,
            favorite: favorite,
            sort: sort,
            limit: pageSize,
            after: after
        )
    }
}
