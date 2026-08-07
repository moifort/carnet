import SwiftUI

/// The recipe sheet's header badges, in the iOS Photos "CINÉMATIQUE" style: a capsule
/// carrying the recipe type (icon + short uppercase label), then the displayed
/// version and how many versions wait to be cooked. Primitive-first: no domain struct.
struct RecipeHeaderBadges: View {
    let type: RecipeType
    let versionNumber: Int?
    /// The versions waiting to be cooked. Zero hides the flask badge.
    var toTestCount: Int = 0
    /// On a coffee, the capsule says HOW it is brewed (ESPRESSO, V60) rather than
    /// the obvious "CAFÉ": the type is given away by the tab it lives in, the
    /// method is what actually identifies the recipe. Nil on anything else.
    var methodLabel: String? = nil
    var methodIcon: Image? = nil

    var body: some View {
        HStack(spacing: Theme.Spacing.s) {
            capsule {
                methodIcon ?? type.iconImage(filled: false)
                Text((methodLabel ?? type.label).uppercased())
            }
            .accessibilityLabel(
                methodLabel.map { "Méthode \($0)" } ?? "Type \(type.label)"
            )

            if let versionNumber {
                capsule {
                    Image(systemName: "clock.arrow.circlepath")
                    Text("v\(versionNumber)")
                        .monospacedDigit()
                }
                .accessibilityLabel("Version \(versionNumber)")
            }

            if toTestCount > 0 {
                capsule {
                    Image(systemName: "flask")
                    Text("\(toTestCount)")
                        .monospacedDigit()
                }
                .accessibilityLabel("\(toTestCount) versions à tester")
            }
        }
    }

    private func capsule<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        HStack(spacing: 5) {
            content()
        }
        .font(.caption.weight(.semibold))
        .foregroundStyle(.secondary)
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .background(Color(.systemFill), in: Capsule())
        .accessibilityElement(children: .combine)
    }
}

#Preview {
    VStack(alignment: .leading, spacing: 12) {
        ForEach(RecipeType.allCases) { type in
            RecipeHeaderBadges(type: type, versionNumber: 3, toTestCount: 2)
        }
        RecipeHeaderBadges(type: .dish, versionNumber: nil)
        // A coffee wears its brew method instead of the word "café".
        ForEach([BrewMethod.espresso, .v60, .frenchPress], id: \.self) { method in
            RecipeHeaderBadges(
                type: .coffee,
                versionNumber: 2,
                methodLabel: method.label,
                methodIcon: method.iconImage
            )
        }
    }
    .padding()
}
