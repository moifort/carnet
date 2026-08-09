import SwiftUI

/// A 5-star rating on the app's native 1–5 scale: tapping star `i` sets the rating
/// to `i`, tapping it again clears it — the note is optional wherever it is asked,
/// and a star tapped by mistake must be takeable back. The rating stays an `Int?`
/// so the domain (best rating, colour thresholds, "/5") reads it directly.
struct StarRating: View {
    @Binding var selection: Int?

    /// Number of filled stars for the current rating (0 until one is picked).
    private var filledStars: Int { selection ?? 0 }

    var body: some View {
        HStack(spacing: Theme.Spacing.s) {
            ForEach(1...5, id: \.self) { star in
                Button {
                    selection = selection == star ? nil : star
                } label: {
                    Image(systemName: star <= filledStars ? "star.fill" : "star")
                        .font(.title3)
                        .foregroundStyle(star <= filledStars ? Color.yellow : Color(.tertiaryLabel))
                        .frame(minWidth: 40, minHeight: 32)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("\(star) étoile\(star > 1 ? "s" : "") sur 5")
                .accessibilityAddTraits(star == filledStars ? .isSelected : [])
                .accessibilityIdentifier("star-\(star)")
            }
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Note de l’essai")
    }
}

#Preview {
    struct Demo: View {
        @State private var rating: Int? = 3
        var body: some View {
            Form {
                Section {
                    StarRating(selection: $rating)
                        .listRowBackground(Color.clear)
                }
                Text(rating.map { "Note : \($0)/5" } ?? "Pas de note")
            }
        }
    }
    return Demo()
}
