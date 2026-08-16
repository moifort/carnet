import SwiftUI

/// The recipes this one is made of, at the top of the recipe sheet: the poolish of a
/// bread dough, the pasta dough of a ravioli. One row each — the linked recipe's live
/// title, the best rating it ever earned, and its first quantity at the weight it is
/// used here, so the row says how much of it goes in without opening it.
///
/// Touching a row opens that recipe on its best version, at that weight. Renders
/// nothing when the recipe stands alone (never an empty section). Composes as a
/// `Section` directly inside a `List`. Primitive-first: nested `Item`, no domain struct.
struct LinkedRecipesSection: View {
    /// One linked recipe, flattened for display.
    struct Item: Identifiable, Hashable {
        let id: String
        let title: String
        /// The best rating it ever earned, nil when it was never cooked.
        let rating: Int?
        /// What it takes of it, already written out — "Farine 100 g". Nil when nothing
        /// in its list is a quantity that can be resized.
        let summary: String?
    }

    let items: [Item]
    /// Opens the linked recipe, at the weight it was linked at.
    let onOpen: (_ id: String) -> Void
    /// Reopens the weight step on an existing link. Nil keeps the section read-only.
    var onEditWeight: ((_ id: String) -> Void)? = nil
    /// Lets go of the link. Nil keeps the section read-only.
    var onUnlink: ((_ id: String) -> Void)? = nil

    var body: some View {
        if !items.isEmpty {
            Section {
                ForEach(items) { item in
                    Button {
                        onOpen(item.id)
                    } label: {
                        row(item)
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("linked-recipe-\(item.id)")
                    .swipeActions(edge: .trailing) {
                        if let onUnlink {
                            Button("Délier", systemImage: "link.badge.plus", role: .destructive) {
                                onUnlink(item.id)
                            }
                            .accessibilityIdentifier("linked-recipe-unlink-\(item.id)")
                        }
                        if let onEditWeight {
                            Button("Poids", systemImage: "scalemass") {
                                onEditWeight(item.id)
                            }
                            .tint(Theme.Status.changed)
                            .accessibilityIdentifier("linked-recipe-weight-\(item.id)")
                        }
                    }
                }
            } header: {
                Text("Recettes liées")
            }
        }
    }

    private func row(_ item: Item) -> some View {
        HStack(spacing: Theme.Spacing.s) {
            Image(systemName: "link")
                .font(.subheadline)
                .foregroundStyle(.secondary)
            VStack(alignment: .leading, spacing: 2) {
                Text(item.title)
                    .foregroundStyle(.primary)
                if let summary = item.summary {
                    Text(summary)
                        .font(.caption2)
                        .monospacedDigit()
                        .foregroundStyle(.secondary)
                }
            }
            Spacer(minLength: Theme.Spacing.s)
            if let rating = item.rating {
                Text("\(rating)/5")
                    .font(.caption)
                    .monospacedDigit()
                    .foregroundStyle(.secondary)
            }
            Image(systemName: "chevron.right")
                .font(.caption2)
                .foregroundStyle(.tertiary)
        }
    }
}

#if DEBUG
#Preview {
    List {
        LinkedRecipesSection(
            items: [
                .init(id: "1", title: "Poolish", rating: 5, summary: "Farine 100 g"),
                .init(id: "2", title: "Pâte à pâtes fraîches", rating: nil, summary: nil),
            ],
            onOpen: { _ in },
            onEditWeight: { _ in },
            onUnlink: { _ in }
        )
        // A recipe that stands alone renders nothing at all.
        LinkedRecipesSection(items: [], onOpen: { _ in })
    }
}
#endif
