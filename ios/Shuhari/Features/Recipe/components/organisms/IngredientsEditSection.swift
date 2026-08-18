import SwiftUI

/// The shopping list being corrected: a name and a quantity per line, −/+ that
/// resize the whole recipe, swipe to delete, a row to add one. Full replacement —
/// what the edit sheet saves IS the new list, so adding, deleting and reordering all
/// happen here. Composes as a `Section` inside a `Form`.
struct IngredientsEditSection: View {
    @Binding var draft: IngredientListDraft

    var body: some View {
        Section {
            ForEach(Array(draft.rows.enumerated()), id: \.element.id) { index, _ in
                row(at: index)
            }
            .onDelete { draft.rows.remove(atOffsets: $0) }
            .onMove { draft.rows.move(fromOffsets: $0, toOffset: $1) }
            Button {
                draft.add()
            } label: {
                Label("Ajouter un ingrédient", systemImage: "plus")
            }
            .accessibilityIdentifier("ingredient-add")
        } header: {
            header
        } footer: {
            Text(
                "Les − et + redimensionnent toute la recette : régler un ingrédient reconvertit les autres."
            )
        }
    }

    // The header says when the list no longer shows the version as stored — the same
    // factor badge and reset the recipe sheet carries, so the two surfaces read alike.
    private var header: some View {
        HStack {
            Text("Ingrédients")
            if draft.factor != 1 {
                Spacer()
                Text(QuantityScaling.factorLabel(draft.factor))
                    .monospacedDigit()
                    .foregroundStyle(Theme.Status.changed)
                Button("Réinitialiser") { draft.factor = 1 }
                    .font(.footnote)
                    .textCase(nil)
                    .accessibilityIdentifier("ingredient-edit-reset")
            }
        }
    }

    // A quantity that leads with a number grows a −/+; "à goût" has nothing to move
    // and renders as the plain pair of fields it always was.
    @ViewBuilder
    private func row(at index: Int) -> some View {
        let quantity = draft.displayed(at: index)
        if QuantityScaling.isScalable(quantity) {
            Stepper {
                fields(at: index, quantity: quantity)
            } onIncrement: {
                draft.step(at: index, direction: 1)
            } onDecrement: {
                draft.step(at: index, direction: -1)
            }
            .accessibilityIdentifier("ingredient-edit-stepper-\(index)")
        } else {
            fields(at: index, quantity: quantity)
        }
    }

    private func fields(at index: Int, quantity: String) -> some View {
        HStack {
            TextField("Ingrédient", text: $draft.rows[index].name)
                .frame(maxWidth: .infinity, alignment: .leading)
            TextField("Quantité", text: quantityBinding(at: index, showing: quantity))
                .fixedSize()
                .multilineTextAlignment(.trailing)
                .foregroundStyle(.secondary)
                .accessibilityIdentifier("ingredient-edit-quantity-\(index)")
        }
    }

    /// What is typed lands exactly as typed — the factor is folded into every row
    /// first, so no other line moves under the cook's eyes.
    private func quantityBinding(at index: Int, showing quantity: String) -> Binding<String> {
        Binding(
            get: { quantity },
            set: { draft.write($0, at: index) }
        )
    }
}

#if DEBUG
private struct SectionHost: View {
    @State var draft: IngredientListDraft

    var body: some View {
        Form { IngredientsEditSection(draft: $draft) }
    }
}

#Preview("Liste existante") {
    SectionHost(draft: IngredientListDraft(Fixtures.bourguignonV3.ingredients))
}

#Preview("Petites quantités et ligne non chiffrée") {
    SectionHost(draft: IngredientListDraft(Fixtures.breadIngredients))
}

#Preview("Liste vide") {
    SectionHost(draft: IngredientListDraft([]))
}
#endif
