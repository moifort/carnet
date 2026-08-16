import SwiftUI

/// Resolves a `RecipeRoute` push into its screen. Shared by every tab that hosts
/// the recipe flow (notebook and Importer), so navigation behaves identically.
struct RecipeRouteView: View {
    let route: RecipeRoute
    /// The flow's one recipe state, owned by the tab: a version pushed here reads
    /// what the screen behind already read, so it opens on the recipe rather than on
    /// a spinner.
    let store: RecipeStore
    @Binding var path: NavigationPath
    let onReload: () -> Void
    let onDelete: (String) -> Void
    let onDeleteVersion: (String, Int) -> Void

    var body: some View {
        switch route {
        case .recipe(let id, let scale):
            RecipeDetailView(
                recipeId: id,
                openedAt: scale,
                store: store,
                path: $path,
                onReload: onReload,
                onDelete: onDelete,
                onDeleteVersion: onDeleteVersion
            )
        }
    }
}

/// Installs the recipe push destinations.
struct RecipeFlowModifier: ViewModifier {
    let store: RecipeStore
    @Binding var path: NavigationPath
    let onReload: () -> Void
    let onDelete: (String) -> Void
    let onDeleteVersion: (String, Int) -> Void

    func body(content: Content) -> some View {
        content
            .navigationDestination(for: RecipeRoute.self) { route in
                RecipeRouteView(
                    route: route,
                    store: store,
                    path: $path,
                    onReload: onReload,
                    onDelete: onDelete,
                    onDeleteVersion: onDeleteVersion
                )
            }
    }
}

extension View {
    func recipeFlow(
        store: RecipeStore,
        path: Binding<NavigationPath>,
        onReload: @escaping () -> Void,
        onDelete: @escaping (String) -> Void,
        onDeleteVersion: @escaping (String, Int) -> Void
    ) -> some View {
        modifier(RecipeFlowModifier(
            store: store,
            path: path,
            onReload: onReload,
            onDelete: onDelete,
            onDeleteVersion: onDeleteVersion
        ))
    }
}
