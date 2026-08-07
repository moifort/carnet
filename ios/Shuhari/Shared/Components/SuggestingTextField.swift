import SwiftUI

/// A free-text field that offers what the cook has already typed elsewhere — the
/// same water, the same machine, the same bag of beans. Suggestions are a
/// shortcut, never a constraint: anything typed is accepted, and typing something
/// new is what adds it to the list next time. Primitive-first, so it serves any
/// field.
struct SuggestingTextField: View {
    let title: String
    @Binding var text: String
    /// Already-used values, most recent first. Empty hides the suggestion row.
    var suggestions: [String] = []

    @FocusState private var focused: Bool

    /// What is worth offering right now: everything while the field is empty,
    /// otherwise the values that continue what is being typed — minus an exact
    /// match, which would be a button that does nothing.
    private var offered: [String] {
        let typed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !typed.isEmpty else { return suggestions }
        return suggestions.filter {
            $0.localizedCaseInsensitiveContains(typed) && $0.localizedCaseInsensitiveCompare(typed) != .orderedSame
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            // The label stays visible once the field is filled — a placeholder
            // vanishes exactly when a form of fifteen fields needs it most.
            LabeledContent(title) {
                TextField(title, text: $text)
                    .focused($focused)
                    .autocorrectionDisabled()
                    .multilineTextAlignment(.trailing)
                    .foregroundStyle(.secondary)
            }
            // Only while the field has the keyboard: a row of chips under every
            // resting field would drown the form.
            if focused, !offered.isEmpty {
                ScrollView(.horizontal) {
                    HStack(spacing: Theme.Spacing.s) {
                        ForEach(offered, id: \.self) { suggestion in
                            Button(suggestion) { text = suggestion }
                                .buttonStyle(.plain)
                                .font(.caption.weight(.medium))
                                .padding(.horizontal, 10)
                                .padding(.vertical, 5)
                                .background(Color(.systemFill), in: Capsule())
                        }
                    }
                }
                .scrollIndicators(.hidden)
                .scrollClipDisabled()
            }
        }
    }
}

#Preview("Vide — tout est proposé") {
    @Previewable @State var text = ""
    Form {
        Section("Eau") {
            SuggestingTextField(
                title: "Type d’eau",
                text: $text,
                suggestions: ["Robinet (dureté 3/5)", "Volvic", "Volvic + minéralisation Lotus"]
            )
        }
    }
}

#Preview("En cours de frappe") {
    @Previewable @State var text = "Vol"
    Form {
        Section("Eau") {
            SuggestingTextField(
                title: "Type d’eau",
                text: $text,
                suggestions: ["Robinet (dureté 3/5)", "Volvic", "Volvic + minéralisation Lotus"]
            )
        }
    }
}

#Preview("Sans suggestion — un champ ordinaire") {
    @Previewable @State var text = ""
    Form {
        Section("Matériel") {
            SuggestingTextField(title: "Machine", text: $text)
        }
    }
}
