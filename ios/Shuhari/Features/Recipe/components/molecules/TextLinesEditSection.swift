import SwiftUI

/// A list of free-text lines being corrected — the cautions, and the tips. One field
/// per line, swipe to delete, a row to add one that opens focused. Primitive-first:
/// it is told what it is writing, it does not know which of the two it serves.
/// Composes as a `Section` inside a `Form`.
struct TextLinesEditSection: View {
    let title: String
    /// What an empty field says it is waiting for ("Attention à…").
    let placeholder: String
    let addLabel: String
    var footer: String?
    var addIdentifier: String
    @Binding var draft: TextListDraft

    @FocusState private var focused: UUID?

    var body: some View {
        Section {
            ForEach($draft.rows) { $row in
                TextField(placeholder, text: $row.text, axis: .vertical)
                    .lineLimit(1...6)
                    .focused($focused, equals: row.id)
            }
            .onDelete { draft.rows.remove(atOffsets: $0) }
            .onMove { draft.rows.move(fromOffsets: $0, toOffset: $1) }
            Button(addLabel, systemImage: "plus") {
                draft.add()
                focused = draft.rows.last?.id
            }
            .accessibilityIdentifier(addIdentifier)
        } header: {
            Text(title)
        } footer: {
            if let footer { Text(footer) }
        }
    }
}

#if DEBUG
private struct SectionHost: View {
    @State var draft: TextListDraft

    var body: some View {
        Form {
            TextLinesEditSection(
                title: "Avertissements",
                placeholder: "Attention à…",
                addLabel: "Ajouter un avertissement",
                footer: "Affichés en bannière en haut de la recette. Glisser pour supprimer.",
                addIdentifier: "warning-add",
                draft: $draft
            )
        }
    }
}

#Preview("Avec avertissements") {
    SectionHost(draft: TextListDraft(Fixtures.risottoV2.warnings))
}

#Preview("Vide — prêt à saisir") {
    SectionHost(draft: TextListDraft([]))
}
#endif
