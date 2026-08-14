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
    /// Opens the picker that says which recipe a line IS, by ingredient index. Nil
    /// (the default) renders the list read-only — the attempt view and the previews.
    var onLink: ((Int) -> Void)? = nil

    /// Rows whose quantity leads with a number — the ones a stepper can move. A line
    /// that IS a recipe is left out: the row unfolds instead, and a −/+ inside the
    /// disclosure label would fight it for the tap. Its quantity still follows the
    /// factor the other rows set — only the control it could have started moves away.
    private var scalableRows: Set<Int> {
        Set(
            ingredients.indices.filter {
                ingredients[$0].component == nil
                    && IngredientScaling.isScalable(ingredients[$0].quantity)
            }
        )
    }

    var body: some View {
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
                components: componentItems,
                onLink: onLink,
                steppable: scalableRows,
                scaledRows: factor == 1 ? [] : scalableRows,
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
            IngredientsGrid(
                items: ingredients.map { ($0.name, $0.quantity) },
                modified: modified,
                components: componentItems,
                onLink: onLink
            )
        }
    }

    // The lines that ARE a recipe, keyed by name like `modified` — the grid's row
    // identity throughout. Flattened here: the grid below is primitive-first.
    private var componentItems: [String: IngredientsGrid.Component] {
        Dictionary(
            uniqueKeysWithValues: ingredients.compactMap { ingredient in
                ingredient.component.map {
                    (
                        ingredient.name,
                        IngredientsGrid.Component(
                            title: $0.title,
                            rating: $0.rating,
                            ingredients: $0.ingredients.map { ($0.name, $0.quantity) },
                            steps: $0.steps
                        )
                    )
                }
            }
        )
    }

    // The header says when the list no longer shows the stored recipe: the factor
    // badge and a reset, only once the factor leaves 1.
    private var header: some View {
        HStack {
            Text("Ingrédients")
            if let scale, scale.wrappedValue != 1 {
                Spacer()
                Text(IngredientScaling.factorLabel(scale.wrappedValue))
                    .monospacedDigit()
                    .foregroundStyle(Theme.Status.changed)
                Button("Réinitialiser") {
                    scale.wrappedValue = 1
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
    /// The recipe an ingredient line IS, flattened for display: no domain struct, no
    /// Apollo type. `rating` is the best one it ever earned — nil when it was never
    /// cooked, and the chip then shows the title alone.
    struct Component: Hashable {
        let title: String
        let rating: Int?
        let ingredients: [(name: String, quantity: String)]
        let steps: [String]

        static func == (a: Component, b: Component) -> Bool {
            a.title == b.title && a.rating == b.rating && a.steps == b.steps
                && a.ingredients.map(\.name) == b.ingredients.map(\.name)
                && a.ingredients.map(\.quantity) == b.ingredients.map(\.quantity)
        }

        func hash(into hasher: inout Hasher) {
            hasher.combine(title)
            hasher.combine(rating)
        }
    }

    let items: [(name: String, quantity: String)]
    /// Names to flag as changed. Empty (the default) keeps the exact plain-recipe-sheet
    /// `LabeledContent` layout — no leading dot, no shift.
    var modified: Set<String> = []
    /// The lines that are a recipe of their own, keyed by ingredient name — the row
    /// identity `modified` already uses. A row absent from here is a plain ingredient
    /// and renders exactly as it always has.
    var components: [String: Component] = [:]
    /// Opens the picker for row `index`. Nil keeps the grid read-only.
    var onLink: ((_ index: Int) -> Void)? = nil
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
                .swipeActions(edge: .trailing) {
                    if let onLink {
                        Button {
                            onLink(index)
                        } label: {
                            Label(
                                components[item.name] == nil ? "Lier" : "Changer",
                                systemImage: "link"
                            )
                        }
                        .tint(Theme.Status.changed)
                        .accessibilityIdentifier("ingredient-link-\(index)")
                    }
                }
        }
    }

    // A line that IS a recipe unfolds in place: its best version's shopping list and
    // gestures, without leaving the sheet the cook is reading. Every other line is
    // rendered exactly as it was before components existed.
    @ViewBuilder
    private func row(index: Int, item: (name: String, quantity: String)) -> some View {
        if let component = components[item.name] {
            DisclosureGroup {
                unfolded(component)
            } label: {
                HStack(spacing: Theme.Spacing.s) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(item.name)
                        chip(component)
                    }
                    Spacer(minLength: Theme.Spacing.s)
                    quantity(item.quantity, index: index)
                }
            }
            .accessibilityIdentifier("ingredient-component-\(index)")
        } else {
            plainRow(index: index, item: item)
        }
    }

    // The live title of the linked recipe and the best rating it ever earned — never
    // the name stored on the line above it, which is the role it plays here.
    private func chip(_ component: Component) -> some View {
        HStack(spacing: 4) {
            Image(systemName: "link")
            Text(component.title)
                .lineLimit(1)
            if let rating = component.rating {
                Text("· \(rating)/5")
                    .monospacedDigit()
            }
        }
        .font(.caption2)
        .foregroundStyle(.secondary)
    }

    // What the linked recipe's best version holds. Resolution stops here: a component
    // of the component shows as nothing at all.
    @ViewBuilder
    private func unfolded(_ component: Component) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            ForEach(Array(component.ingredients.enumerated()), id: \.offset) { _, line in
                HStack {
                    Text(line.name)
                    Spacer(minLength: Theme.Spacing.s)
                    Text(line.quantity)
                        .monospacedDigit()
                }
            }
            ForEach(Array(component.steps.enumerated()), id: \.offset) { position, step in
                HStack(alignment: .top, spacing: Theme.Spacing.s) {
                    Text("\(position + 1).")
                        .monospacedDigit()
                        .foregroundStyle(.secondary)
                    Text(step)
                }
            }
        }
        .font(.footnote)
    }

    @ViewBuilder
    private func plainRow(index: Int, item: (name: String, quantity: String)) -> some View {
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

#Preview("Une ligne qui est une recette") {
    List {
        IngredientsSection(ingredients: Fixtures.ravioliIngredients)
    }
}

#Preview("Composant jamais cuisiné") {
    List {
        IngredientsSection(
            ingredients: [
                Ingredient(
                    name: "Pâte à ravioles",
                    quantity: "400 g",
                    component: RecipeComponent(
                        id: "pate",
                        title: "Pâte à pâtes fraîches",
                        rating: nil,
                        ingredients: [Ingredient(name: "Farine T55", quantity: "300 g")],
                        steps: ["Pétrir 10 min."]
                    )
                ),
                Ingredient(name: "Champignons de Paris", quantity: "250 g"),
            ]
        )
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
