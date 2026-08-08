import SwiftUI

/// The version list, newest first, cut into month sections the way the library is —
/// the body of the sheet the recipe sheet's bottom bar opens, dressed like the
/// attempt sheet: a compact inline title and a close button, no subtitle (the recipe
/// it belongs to sits right behind) and no hint. Rows are plain buttons, not links:
/// picking a version hands it back to the caller, which closes the sheet and opens
/// that version's recipe sheet — so no chevron is drawn.
struct HistoryPage: View {
    let recipe: Recipe
    let onSelect: (_ versionNumber: Int) -> Void

    /// One month's worth of versions, most recent version first.
    private struct MonthGroup: Identifiable {
        let id: String
        let label: String
        let versions: [RecipeVersion]
    }

    /// The versions bucketed by the month they were last worked on, most recent month
    /// first — the grouping the library already uses for its own rows, which files a
    /// recipe under its last modification too.
    private var monthGroups: [MonthGroup] {
        let calendar = Calendar.current
        return Dictionary(grouping: recipe.versions) { version in
            calendar.dateComponents([.year, .month], from: version.updatedAt)
        }
        .map { components, versions in
            MonthGroup(
                id: MonthLabel.id(components),
                label: MonthLabel.of(components, calendar: calendar),
                versions: versions.sorted { $0.number > $1.number }
            )
        }
        .sorted { $0.id > $1.id }
    }

    var body: some View {
        List {
            ForEach(monthGroups) { group in
                Section {
                    ForEach(group.versions, id: \.number) { version in
                        Button {
                            onSelect(version.number)
                        } label: {
                            VersionRow(
                                number: version.number,
                                change: version.change,
                                rating: version.rating,
                                isFocus: version.number == recipe.versionToOpen.number,
                                toTest: version.toTest
                            )
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("version-row-v\(version.number)")
                    }
                } header: {
                    Text(group.label)
                }
            }
        }
        .contentMargins(.top, 0, for: .scrollContent)
        // Same chrome as the attempt sheet: a compact inline title over the list,
        // the close button coming from the sheet itself.
        .navigationTitle("Versions")
        .navigationBarTitleDisplayMode(.inline)
    }
}

#if DEBUG
#Preview {
    HistoryPage(recipe: Fixtures.bourguignon, onSelect: { _ in })
}
#endif
