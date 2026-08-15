import SwiftUI

/// Root once authenticated. Two content tabs — "Cuisine" (cooking: dishes &
/// Thermomix) and "Café" — plus an "Importer" entry pinned to the trailing side of
/// the tab bar (`.search`/`.prominent` role — the only system affordance that keeps
/// a tab separated and visible while the bar minimises). Selecting it opens the
/// camera-first import full-screen; closing that cover restores the content tab, so
/// the tab bar never lingers on the import entry's empty content. The one import
/// serves both tabs: on success the new recipe is routed to the tab its detected
/// type belongs to, which navigates to its recipe sheet. Closing the analysis is a
/// step back, not an abandon: the cover reopens on the composer, refilled with the
/// text and the photos that were sent.
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
    /// Set when the analysis is closed: the import cover reopens once the review
    /// sheet is gone, on the composer this draft refills — or on the camera, when
    /// the import never went through the composer (`nil` draft).
    @State private var resumesImport = false
    @State private var resumedDraft: ImportDraft?
    /// The imported recipe, handed to whichever tab owns its type — the other tab
    /// must not navigate to a recipe it does not list.
    @State private var importedRecipe: ImportedRecipe?
    @State private var importedCoffee: ImportedRecipe?

    /// Which flow the import entry runs: the tab it was opened from.
    private var importFlow: ImportFlow { lastContentTab == .coffee ? .coffee : .cooking }

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
            ImportScanView(flow: importFlow, draft: resumedDraft) { input in
                pendingImport = input
                showImport = false
            }
        }
        .sheet(item: $reviewJob, onDismiss: onReviewSheetDismiss) { job in
            ImportReviewSheet(
                input: job.input,
                flow: job.flow,
                onCreated: { recipeId in
                    // The flow decides where the recipe lands — it is the tab the
                    // cook started from, and the only one that lists it.
                    let imported = ImportedRecipe(id: recipeId)
                    if job.flow == .coffee {
                        importedCoffee = imported
                        selectedTab = .coffee
                    } else {
                        importedRecipe = imported
                        selectedTab = .cooking
                    }
                    reviewJob = nil
                },
                onCancel: {
                    resumedDraft = job.input.draft
                    resumesImport = true
                    reviewJob = nil
                }
            )
            .presentationDetents([.large])
        }
    }

    /// When the camera cover closes: restore the content tab the user came from,
    /// then — if they picked a photo / captured / typed — present the review sheet
    /// over it, so the camera is fully gone rather than lingering behind the sheet.
    private func onImportCoverDismiss() {
        if selectedTab == .importEntry { selectedTab = lastContentTab }
        // A restored draft has been handed over: the next import starts blank.
        resumedDraft = nil
        if let input = pendingImport {
            pendingImport = nil
            reviewJob = ImportJob(input: input, flow: importFlow)
        }
    }

    /// A closed analysis is not an abandoned import: reopen the cover on what was
    /// typed, so the text and the photos can be fixed and sent again. Waiting for
    /// the sheet to be gone avoids presenting the cover over a dismissing sheet.
    /// A swipe-dismiss sets nothing and still abandons the import.
    private func onReviewSheetDismiss() {
        guard resumesImport else { return }
        resumesImport = false
        showImport = true
    }
}

#Preview {
    ContentView()
}
