import SwiftUI

/// The recipe's shopping list, inline in the recipe sheet: name + quantity rows through
/// a small dedicated grid. Renders nothing when there are no ingredients (never
/// an empty section). Composes as a `Section` directly inside a `List`.
///
/// The list is always adjustable: scalable rows grow −/+ steppers, every quantity
/// renders through the factor, and the header grows a reset once the factor leaves
/// `resetsTo`. Resizing is a lens on what is stored and never a write, so it holds on
/// whichever version the sheet shows — the one waiting to be cooked as much as the one
/// already tried, whose change dots the steppers carry alongside.
struct IngredientsSection: View {
    let ingredients: [Ingredient]
    /// Names of ingredients changed vs the previous version — flagged with an
    /// orange dot. Empty (the default) renders exactly like the plain recipe sheet.
    var modified: Set<String> = []
    /// Pulls the header up under the badge line above it — the plain recipe sheet's
    /// compact look. False when a card sits above instead, which needs its own air.
    var compactHeader: Bool = true
    /// The factor every quantity is rendered through, owned by the sheet so it dies
    /// with it.
    @Binding var scale: Double
    /// The factor "Réinitialiser" goes back to, and below which the header says
    /// nothing. 1 on a recipe opened on its own; the link's weight on one opened from
    /// the recipe that uses it — there, the stored quantities are not what was asked for.
    var resetsTo: Double = 1

    /// Rows whose quantity leads with a number — the ones a stepper can move.
    private var scalableRows: Set<Int> {
        Set(ingredients.indices.filter { QuantityScaling.isScalable(ingredients[$0].quantity) })
    }

    var body: some View {
        // Nothing to read, nothing to render: a recipe imported without a shopping
        // list shows no empty section, it is filled from the edit sheet.
        if !ingredients.isEmpty {
            Section {
                grid
            } header: {
                header
            }
        }
    }

    private var grid: some View {
        IngredientsGrid(
            items: ingredients.map { ($0.name, QuantityScaling.scaled($0.quantity, by: scale)) },
            modified: modified,
            steppable: scalableRows,
            scaledRows: scale == resetsTo ? [] : scalableRows,
            onStep: { index, direction in
                guard
                    let next = QuantityScaling.factorAfterStep(
                        on: ingredients[index].quantity,
                        from: scale,
                        direction: direction
                    )
                else { return }
                scale = next
            }
        )
    }

    // The header says when the list no longer shows the stored recipe: the factor
    // badge and a reset, only once the factor leaves 1.
    private var header: some View {
        HStack {
            Text("Ingrédients")
            Spacer()
            if scale != resetsTo {
                Text(QuantityScaling.factorLabel(scale))
                    .monospacedDigit()
                    .foregroundStyle(Theme.Status.changed)
                Button("Réinitialiser") {
                    scale = resetsTo
                }
                .font(.footnote)
                .accessibilityIdentifier("ingredients-reset")
            }
        }
        .padding(.top, compactHeader ? -14 : 0)
    }
}

/// A compact name/quantity grid: native `LabeledContent` rows (List/Form-friendly),
/// the quantity monospaced and trailing. Primitive-first — takes `(name, quantity)`
/// pairs, no domain struct.
struct IngredientsGrid: View {
    let items: [(name: String, quantity: String)]
    /// Names to flag as changed. Empty (the default) keeps the exact plain-recipe-sheet
    /// `LabeledContent` layout — no leading dot, no shift.
    var modified: Set<String> = []
    /// Rows that grow a −/+ stepper — the ones whose quantity leads with a number.
    let steppable: Set<Int>
    /// Rows whose displayed quantity no longer matches the stored recipe — tinted
    /// with the changed accent.
    let scaledRows: Set<Int>
    /// Steps row `index` one tick up (+1) or down (−1).
    let onStep: (_ index: Int, _ direction: Int) -> Void

    var body: some View {
        ForEach(Array(items.enumerated()), id: \.offset) { index, item in
            row(index: index, item: item)
        }
    }

    @ViewBuilder
    private func row(index: Int, item: (name: String, quantity: String)) -> some View {
        if steppable.contains(index) {
            Stepper {
                label(index: index, item: item)
            } onIncrement: {
                onStep(index, 1)
            } onDecrement: {
                onStep(index, -1)
            }
            .accessibilityIdentifier("ingredient-stepper-\(index)")
        } else if modified.isEmpty {
            LabeledContent(item.name) {
                quantity(item.quantity, index: index)
            }
        } else {
            label(index: index, item: item)
        }
    }

    /// The row's own content — name, then quantity — worn as is by a plain row and as
    /// the label of a steppable one, so a version being resized keeps the dots saying
    /// what it changes.
    private func label(index: Int, item: (name: String, quantity: String)) -> some View {
        HStack(spacing: modified.isEmpty ? Theme.Spacing.s : 10) {
            if !modified.isEmpty {
                Circle()
                    .fill(modified.contains(item.name) ? Theme.Status.changed : .clear)
                    .frame(width: 7, height: 7)
            }
            Text(item.name)
            Spacer(minLength: Theme.Spacing.s)
            quantity(item.quantity, index: index)
        }
    }

    private func quantity(_ text: String, index: Int) -> some View {
        Text(text)
            .monospacedDigit()
            .foregroundStyle(scaledRows.contains(index) ? AnyShapeStyle(Theme.Status.changed) : AnyShapeStyle(.primary))
            .accessibilityIdentifier("ingredient-quantity-\(index)")
    }
}

#if DEBUG
#Preview("Facteur 1") {
    @Previewable @State var factor: Double = 1
    List {
        IngredientsSection(ingredients: Fixtures.bourguignonV3.ingredients, scale: $factor)
    }
}

#Preview("Facteur 0,7") {
    @Previewable @State var factor: Double = 0.7
    List {
        IngredientsSection(ingredients: Fixtures.bourguignonV3.ingredients, scale: $factor)
    }
}

#Preview("Ligne non scalable") {
    @Previewable @State var factor: Double = 0.7
    List {
        IngredientsSection(
            ingredients: Fixtures.risottoV2.ingredients + [Ingredient(name: "Sel", quantity: "à goût")],
            scale: $factor
        )
    }
}

#Preview("Version à tester — redimensionnée avec ses pastilles") {
    @Previewable @State var factor: Double = 0.5
    List {
        IngredientsSection(
            ingredients: Fixtures.bourguignonV3.ingredients,
            modified: ["Vin rouge"],
            compactHeader: false,
            scale: $factor
        )
    }
}
#endif
