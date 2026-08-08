import SwiftUI

/// The to-cook list as a sheet over the recipe sheet: the versions an improvement
/// asked for and that have not been cooked yet, newest first, cut into month sections
/// like the history. Same chrome as the other two sheets the recipe sheet opens — a
/// compact inline title and a close button.
///
/// Picking one hands its number back: the caller closes the sheet and opens that
/// version's recipe sheet in the stack behind.
struct ToTestSheet: View {
    let versions: [RecipeVersion]
    let onSelect: (_ versionNumber: Int) -> Void

    @Environment(\.dismiss) private var dismiss

    /// One month's worth of versions to cook, most recent first.
    private struct MonthGroup: Identifiable {
        let id: String
        let label: String
        let versions: [RecipeVersion]
    }

    /// Bucketed by the month each version was last worked on, like the history.
    private var monthGroups: [MonthGroup] {
        let calendar = Calendar.current
        return Dictionary(grouping: versions) { version in
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
        NavigationStack {
            Group {
                if versions.isEmpty {
                    ContentUnavailableView {
                        Label("Rien à tester", systemImage: "flask")
                    } description: {
                        Text("Demande une amélioration : la version proposée t’attendra ici.")
                    }
                } else {
                    list
                }
            }
            .navigationTitle("À tester")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: {
                        Image(systemName: "xmark")
                    }
                    .accessibilityIdentifier("close-to-test-button")
                    .accessibilityLabel("Fermer")
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }

    private var list: some View {
        List {
            ForEach(monthGroups) { group in
                Section {
                    ForEach(group.versions, id: \.number) { version in
                        Button {
                            onSelect(version.number)
                        } label: {
                            // A flask instead of stars: a version waiting to be cooked
                            // has no rating.
                            VersionRow(
                                number: version.number,
                                change: version.change,
                                rating: nil,
                                isFocus: false,
                                toTest: true
                            )
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("to-test-row-v\(version.number)")
                    }
                } header: {
                    Text(group.label)
                }
            }
        }
        .contentMargins(.top, 0, for: .scrollContent)
    }
}

#if DEBUG
#Preview("À tester") {
    Color.clear
        .sheet(isPresented: .constant(true)) {
            ToTestSheet(versions: Fixtures.bourguignon.versionsToTest, onSelect: { _ in })
        }
}

#Preview("Vide") {
    Color.clear
        .sheet(isPresented: .constant(true)) {
            ToTestSheet(versions: [], onSelect: { _ in })
        }
}
#endif
