import SwiftUI

/// The recipe's shopping list, inline in the recipe sheet: name + quantity rows through
/// a small dedicated grid. Renders nothing when there are no ingredients (never
/// an empty section). Composes as a `Section` directly inside a `List`.
struct IngredientsSection: View {
    let ingredients: [Ingredient]
    /// Names of ingredients changed vs the previous version — flagged with an
    /// orange dot. Empty (the default) renders exactly like the plain recipe sheet.
    var modified: Set<String> = []
    /// Pulls the header up under the badge line above it — the plain recipe sheet's
    /// compact look. False when a card sits above instead, which needs its own air.
    var compactHeader: Bool = true
    /// When set, the shopping list is adjustable: scalable rows grow −/+ steppers,
    /// every quantity renders through the factor, and the header grows a reset once
    /// the factor leaves 1. Nil (the default) keeps the plain read-only grid — the
    /// attempt view, whose quantities must show the stored version.
    var scale: Binding<Double>? = nil
    /// The factor "Réinitialiser" goes back to, and below which the header says
    /// nothing. 1 on a recipe opened on its own; the link's weight on one opened from
    /// the recipe that uses it — there, the stored quantities are not what was asked for.
    var resetsTo: Double = 1

    /// Rows whose quantity leads with a number — the ones a stepper can move.
    private var scalableRows: Set<Int> {
        Set(ingredients.indices.filter { IngredientScaling.isScalable(ingredients[$0].quantity) })
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

    @ViewBuilder
    private var grid: some View {
        if let scale {
            let factor = scale.wrappedValue
            IngredientsGrid(
                items: ingredients.map { ($0.name, IngredientScaling.scaled($0.quantity, by: factor)) },
                steppable: scalableRows,
                scaledRows: factor == resetsTo ? [] : scalableRows,
                onStep: { index, direction in
                    guard
                        let next = IngredientScaling.factorAfterStep(
                            on: ingredients[index].quantity,
                            from: factor,
                            direction: direction
                        )
                    else { return }
                    scale.wrappedValue = next
                }
            )
        } else {
            IngredientsGrid(items: ingredients.map { ($0.name, $0.quantity) }, modified: modified)
        }
    }

    // The header says when the list no longer shows the stored recipe: the factor
    // badge and a reset, only once the factor leaves 1.
    private var header: some View {
        HStack {
            Text("Ingrédients")
            Spacer()
            if let scale, scale.wrappedValue != resetsTo {
                Text(IngredientScaling.factorLabel(scale.wrappedValue))
                    .monospacedDigit()
                    .foregroundStyle(Theme.Status.changed)
                Button("Réinitialiser") {
                    scale.wrappedValue = resetsTo
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
    /// Rows that grow a −/+ stepper. Only honoured when `onStep` is set.
    var steppable: Set<Int> = []
    /// Rows whose displayed quantity no longer matches the stored recipe — tinted
    /// with the changed accent.
    var scaledRows: Set<Int> = []
    /// Steps row `index` one tick up (+1) or down (−1). Nil (the default) keeps
    /// the read-only grid.
    var onStep: ((_ index: Int, _ direction: Int) -> Void)? = nil

    var body: some View {
        ForEach(Array(items.enumerated()), id: \.offset) { index, item in
            row(index: index, item: item)
        }
    }

    @ViewBuilder
    private func row(index: Int, item: (name: String, quantity: String)) -> some View {
        if let onStep, steppable.contains(index) {
            Stepper {
                HStack(spacing: Theme.Spacing.s) {
                    Text(item.name)
                    Spacer(minLength: Theme.Spacing.s)
                    quantity(item.quantity, index: index)
                }
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
            HStack(spacing: 10) {
                Circle()
                    .fill(modified.contains(item.name) ? Theme.Status.changed : .clear)
                    .frame(width: 7, height: 7)
                Text(item.name)
                Spacer(minLength: 8)
                quantity(item.quantity, index: index)
            }
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
#Preview {
    List {
        IngredientsSection(ingredients: Fixtures.bourguignonV3.ingredients)
        IngredientsSection(ingredients: Fixtures.risottoV2.ingredients)
    }
}

#Preview("Ajustable — facteur 1") {
    @Previewable @State var factor: Double = 1
    List {
        IngredientsSection(ingredients: Fixtures.bourguignonV3.ingredients, scale: $factor)
    }
}

#Preview("Ajustable — facteur 0,7") {
    @Previewable @State var factor: Double = 0.7
    List {
        IngredientsSection(ingredients: Fixtures.bourguignonV3.ingredients, scale: $factor)
    }
}

#Preview("Ajustable — ligne non scalable") {
    @Previewable @State var factor: Double = 0.7
    List {
        IngredientsSection(
            ingredients: Fixtures.risottoV2.ingredients + [Ingredient(name: "Sel", quantity: "à goût")],
            scale: $factor
        )
    }
}
#endif
