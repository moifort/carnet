import SwiftUI

/// The recipe sheet's reference version — the best-rated one: its steps (with
/// their per-step machine or extraction settings when present). The ingredients
/// are shown inline above by `IngredientsSection`. Composes as a `Section`
/// directly inside a `List`.
struct ReferenceVersionSection: View {
    let version: RecipeVersion
    /// Step indices changed vs the previous version — flagged with an orange dot.
    /// Empty (the default) renders exactly like the plain recipe sheet.
    var modified: Set<Int> = []

    var body: some View {
        if !version.steps.isEmpty {
            Section {
                switch version.content {
                case .dish(_, let steps):
                    StepsList(steps: steps, modified: modified)
                case .thermomix(_, let steps):
                    ThermomixStepsList(steps: steps, modified: modified)
                case .coffee(_, let steps):
                    CoffeeStepsList(steps: steps, modified: modified)
                }
            } header: {
                Text("Étapes")
            }
        }
    }
}

#if DEBUG
#Preview {
    List {
        ReferenceVersionSection(version: Fixtures.bourguignonV3)
        ReferenceVersionSection(version: Fixtures.risottoV2)
        ReferenceVersionSection(version: Fixtures.v60V2)
    }
}
#endif
