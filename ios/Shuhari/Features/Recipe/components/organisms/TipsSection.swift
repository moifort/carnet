import SwiftUI

/// The recipe sheet's closing section: the displayed version's cooking tips, one
/// row each. Renders nothing when the version carries none (never an empty
/// section). Composes as a `Section` directly inside a `List`.
struct TipsSection: View {
    let tips: [String]
    /// Opens the tips editor. Nil (the default) keeps the section read-only — the
    /// execution mode and the previews.
    var onEdit: (() -> Void)? = nil

    var body: some View {
        // Editable, the section survives an empty list: otherwise the first tip of a
        // version that has none could never be written.
        if !tips.isEmpty || onEdit != nil {
            Section {
                if tips.isEmpty {
                    Text("Aucun conseil")
                        .foregroundStyle(.secondary)
                } else {
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
            } header: {
                HStack {
                    Text("Conseils")
                    if let onEdit {
                        Spacer()
                        Button("Modifier", action: onEdit)
                            .font(.caption)
                            .textCase(nil)
                            .accessibilityIdentifier("tips-edit")
                    }
                }
            }
        }
    }
}

#Preview {
    List {
        TipsSection(tips: ["Servir avec des tagliatelles fraîches.", "Se congèle très bien."])
        // No tips and no editor: the section renders nothing at all.
        TipsSection(tips: [])
        // Editable, it survives an empty list so the first tip can be written.
        TipsSection(tips: [], onEdit: {})
    }
}
