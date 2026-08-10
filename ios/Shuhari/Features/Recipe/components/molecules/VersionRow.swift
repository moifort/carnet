import SwiftUI

/// One version in the history sheet: the change it carries as the title, then —
/// pushed to the right — the rating its attempt earned as stars and the version
/// number as a chip closing the row. The chip wears the attempt accent on the
/// version the recipe sheet behind is showing.
struct VersionRow: View {
    let number: Int
    let change: String?
    let rating: Int?
    /// The version the recipe sheet behind is showing — the only row whose chip
    /// wears the attempt accent.
    let isFocus: Bool
    /// Waiting to be cooked: the row wears a flask where a cooked version wears its
    /// stars — the two are exclusive, a version to cook has no rating yet.
    var toTest: Bool = false

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.s) {
            Text(change?.isEmpty == false ? change! : "Version d’origine")
                .font(.subheadline.weight(.semibold))
                .monospacedDigit()
            Spacer(minLength: Theme.Spacing.s)
            if toTest {
                Image(systemName: "flask")
                    .font(.footnote)
                    .foregroundStyle(Theme.Status.attempt)
                    .accessibilityLabel("À tester")
            } else if let rating {
                RatingStars(rating: Double(rating))
                    .accessibilityLabel("Notée \(rating) sur 5")
            }
            Chip(text: "v\(number)", compact: true, highlighted: isFocus)
        }
        // The row is the tap target of a button, and its middle is empty space: without
        // a shape of its own, only the drawn text and chips answer a tap and every tap
        // between them falls through — the version list looks like it ignores the pick.
        .contentShape(.rect)
        .accessibilityElement(children: .combine)
    }
}

#Preview {
    List {
        VersionRow(number: 4, change: "Température 93 → 92 °C", rating: nil, isFocus: true, toTest: true)
        VersionRow(number: 3, change: "Mouture plus fine", rating: 4, isFocus: false)
        VersionRow(number: 1, change: nil, rating: 3, isFocus: false)
    }
}
