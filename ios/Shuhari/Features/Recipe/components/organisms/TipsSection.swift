import SwiftUI

/// The recipe sheet's closing section: the displayed version's cooking tips, one
/// row each. Renders nothing when the version carries none (never an empty
/// section). Composes as a `Section` directly inside a `List`.
struct TipsSection: View {
    let tips: [String]

    var body: some View {
        if !tips.isEmpty {
            Section("Conseils") {
                ForEach(Array(tips.enumerated()), id: \.offset) { _, tip in
                    HStack(alignment: .top, spacing: 12) {
                        Image(systemName: "lightbulb")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                        Text(tip)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
            }
        }
    }
}

#Preview {
    List {
        TipsSection(tips: ["Servir avec des tagliatelles fraîches.", "Se congèle très bien."])
        // No tips: the section renders nothing at all.
        TipsSection(tips: [])
    }
}
