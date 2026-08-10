import SwiftUI

/// The version history as a sheet over the recipe sheet: "Fermer" on the left, then
/// every version, newest first. Picking one hands its number back — the caller closes
/// the sheet and opens that version's recipe sheet in the stack behind, so the sheet
/// never pushes a screen of its own.
///
/// It lists the recipe the sheet behind is already showing, never a read of its own:
/// two reads is how the flask CTA and this list came to disagree on what was left to
/// test — and how opening it cost a round trip.
struct HistorySheet: View {
    let recipe: Recipe
    let onSelect: (_ versionNumber: Int) -> Void

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            HistoryPage(recipe: recipe, onSelect: onSelect)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button {
                            dismiss()
                        } label: {
                            Image(systemName: "xmark")
                        }
                        .accessibilityIdentifier("close-history-button")
                        .accessibilityLabel("Fermer")
                    }
                }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }
}

#if DEBUG
#Preview {
    Color.clear
        .sheet(isPresented: .constant(true)) {
            HistorySheet(recipe: Fixtures.bourguignon, onSelect: { _ in })
        }
}
#endif
