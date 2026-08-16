import SwiftUI

/// The link the other way round: the recipes made of the one being read. The poolish's
/// sheet says which breads call for it, and touching one opens it on its best version.
///
/// Read-only by design — a link is posted, corrected and let go from the recipe that
/// uses it, never from the recipe used. Renders nothing when nothing uses it (never an
/// empty section). Composes as a `Section` directly inside a `List`.
struct UsedBySection: View {
    /// One calling recipe, flattened for display. No weight: it belongs to the recipe
    /// that posted the link, not to the one being read.
    struct Item: Identifiable, Hashable {
        let id: String
        let title: String
        let rating: Int?
    }

    let items: [Item]
    let onOpen: (_ id: String) -> Void

    var body: some View {
        if !items.isEmpty {
            Section {
                ForEach(items) { item in
                    Button {
                        onOpen(item.id)
                    } label: {
                        HStack(spacing: Theme.Spacing.s) {
                            Image(systemName: "arrow.turn.up.right")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                            Text(item.title)
                                .foregroundStyle(.primary)
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
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("used-by-\(item.id)")
                }
            } header: {
                Text("Utilisée par")
            }
        }
    }
}

#if DEBUG
#Preview {
    List {
        UsedBySection(
            items: [
                .init(id: "1", title: "Pain de campagne", rating: 4),
                .init(id: "2", title: "Baguette de tradition", rating: nil),
            ],
            onOpen: { _ in }
        )
        // Nothing uses it: the section renders nothing at all.
        UsedBySection(items: [], onOpen: { _ in })
    }
}
#endif
