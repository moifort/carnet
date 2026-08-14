import SwiftUI

/// The recipe sheet's reference version — the best-rated one: its steps (with
/// their per-step machine settings when present). The ingredients are shown inline
/// above by `IngredientsSection`, a coffee's dials by `CoffeeParametersSection`.
/// Composes as a `Section` directly inside a `List`.
struct ReferenceVersionSection: View {
    let version: RecipeVersion
    /// Step indices changed vs the previous version — flagged with an orange dot.
    /// Empty (the default) renders exactly like the plain recipe sheet.
    var modified: Set<Int> = []
    /// Opens the method editor. Nil (the default) keeps the steps read-only — the
    /// execution mode and the previews.
    var onEdit: (() -> Void)? = nil

    var body: some View {
        // Editable, the section survives an empty method: a coffee has none by
        // construction and never gets the action, but an import that produced no step
        // must still be fixable.
        if !version.steps.isEmpty || onEdit != nil {
            Section {
                switch version.content {
                case .dish(_, let steps, _):
                    StepsList(steps: steps, modified: modified)
                case .thermomix(_, let steps, _):
                    ThermomixStepsList(steps: steps, modified: modified)
                // A coffee has no steps at all — its dials say everything.
                case .coffee:
                    EmptyView()
                }
                if version.steps.isEmpty {
                    Text("Aucune étape")
                        .foregroundStyle(.secondary)
                }
            } header: {
                HStack {
                    Text("Étapes")
                    if let onEdit {
                        Spacer()
                        Button("Modifier", action: onEdit)
                            .font(.caption)
                            .textCase(nil)
                            .accessibilityIdentifier("steps-edit")
                    }
                }
            }
        }
    }
}

#if DEBUG
#Preview {
    List {
        ReferenceVersionSection(version: Fixtures.bourguignonV3)
        ReferenceVersionSection(version: Fixtures.risottoV2)
    }
}
#endif
