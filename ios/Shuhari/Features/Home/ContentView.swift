import SwiftUI

/// Root once authenticated. Two content tabs — "Cuisine" (cooking: dishes &
/// Thermomix) and "Café" — plus an "Importer" entry pinned to the trailing side of
/// the tab bar (`.search`/`.prominent` role — the only system affordance that keeps
/// a tab separated and visible while the bar minimises). Selecting it opens the
/// camera-first import full-screen; closing that cover restores the content tab, so
/// the tab bar never lingers on the import entry's empty content. The one import
/// serves both tabs: on success the new recipe is routed to the tab its detected
/// type belongs to, which navigates to its recipe sheet.
struct ContentView: View {
    enum RootTab: Hashable {
        case cooking, coffee, importEntry
    }

    @State private var selectedTab: RootTab = .cooking
    /// The tab to restore when the import cover closes — where a cancelled import
    /// puts the user back.
    @State private var lastContentTab: RootTab = .cooking
    @State private var showImport = false
    /// Set when the camera hands off a picked photo / capture / text: it closes
    /// the camera cover, then `onDismiss` presents the review sheet over the
    /// content tab (so the camera is gone, not lingering behind the sheet).
    @State private var pendingImport: ImportInput?
    @State private var reviewJob: ImportJob?
    /// The imported recipe, handed to whichever tab owns its type — the other tab
    /// must not navigate to a recipe it does not list.
    @State private var importedRecipe: ImportedRecipe?
    @State private var importedCoffee: ImportedRecipe?

    /// The trailing "Importer" entry must stay detached from the content tabs.
    /// iOS 26 separates the `.search` role; iOS 27 folded `.search` back into the
    /// main tab row and introduced `.prominent` for a trailing-separated tab.
    /// Pick the role that detaches on the running OS, guarding `.prominent`
    /// behind the SDK that defines it (Swift 6.4 / Xcode 27) so the app still
    /// builds with Xcode 26.
    private var importerTabRole: TabRole {
        #if compiler(>=6.4)
        if #available(iOS 27.0, *) {
            return .prominent
        }
        #endif
        return .search
    }

    var body: some View {
        TabView(selection: $selectedTab) {
            Tab("Cuisine", systemImage: "frying.pan", value: RootTab.cooking) {
                HomeView(importedRecipe: $importedRecipe)
            }
            .accessibilityIdentifier("tab-cooking")

            Tab("Café", systemImage: "cup.and.saucer", value: RootTab.coffee) {
                CoffeeView(importedRecipe: $importedCoffee)
            }
            .accessibilityIdentifier("tab-coffee")

            Tab(value: RootTab.importEntry, role: importerTabRole) {
                Color.clear
            } label: {
                Label("Importer", systemImage: "camera")
            }
            .accessibilityIdentifier("tab-import")
        }
        .tabBarMinimizeBehavior(.onScrollDown)
        .onChange(of: selectedTab) { _, newValue in
            if newValue == .importEntry {
                showImport = true
            } else {
                lastContentTab = newValue
            }
        }
        .fullScreenCover(isPresented: $showImport, onDismiss: onImportCoverDismiss) {
            ImportScanView { input in
                pendingImport = input
                showImport = false
            }
        }
        .sheet(item: $reviewJob) { job in
            ImportReviewSheet(
                input: job.input,
                onCreated: { recipeId, type in
                    // The detected type decides where the recipe lands: a coffee
                    // photographed from the cooking tab still opens in the coffee tab,
                    // which is the only one that lists it.
                    let imported = ImportedRecipe(id: recipeId)
                    if type == .coffee {
                        importedCoffee = imported
                        selectedTab = .coffee
                    } else {
                        importedRecipe = imported
                        selectedTab = .cooking
                    }
                    reviewJob = nil
                },
                onCancel: { reviewJob = nil }
            )
            .presentationDetents([.large])
        }
    }

    /// When the camera cover closes: restore the content tab the user came from,
    /// then — if they picked a photo / captured / typed — present the review sheet
    /// over it, so the camera is fully gone rather than lingering behind the sheet.
    private func onImportCoverDismiss() {
        if selectedTab == .importEntry { selectedTab = lastContentTab }
        if let input = pendingImport {
            pendingImport = nil
            reviewJob = ImportJob(input: input)
        }
    }
}

#Preview {
    ContentView()
}
