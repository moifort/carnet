import SwiftUI

/// Correcting one coffee version's parameters — a roast date read wrong, the
/// grinder left out. The form itself is `CoffeeParametersForm`, shared with the
/// import preview and the AI proposal; this sheet is what saves it.
struct CoffeeParametersEditSheet: View {
    let initial: CoffeeParameters
    /// What each free-text field offers, most recent first.
    var vocabulary: CoffeeVocabulary = .empty
    /// The gear of the version before this one — pre-fills the two fields when
    /// this version carries none, so a new version does not re-ask what never
    /// changes.
    var previousGear: CoffeeGear = .empty
    let onSave: (CoffeeParameters) async throws -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var draft: CoffeeParametersDraft
    @State private var error = ErrorPresenter()

    init(
        initial: CoffeeParameters,
        vocabulary: CoffeeVocabulary = .empty,
        previousGear: CoffeeGear = .empty,
        onSave: @escaping (CoffeeParameters) async throws -> Void
    ) {
        self.initial = initial
        self.vocabulary = vocabulary
        self.previousGear = previousGear
        self.onSave = onSave
        _draft = State(initialValue: CoffeeParametersDraft(initial, gear: previousGear))
    }

    var body: some View {
        NavigationStack {
            Form {
                CoffeeParametersForm(draft: $draft, vocabulary: vocabulary)
            }
            .navigationTitle("Paramètres")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: {
                        Image(systemName: "xmark")
                    }
                    .disabled(error.isRunning)
                    .accessibilityLabel("Annuler")
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        Task {
                            await error.run { try await onSave(draft.parameters) } onSuccess: { dismiss() }
                        }
                    } label: {
                        ActionIcon(systemImage: "checkmark", isRunning: error.isRunning)
                    }
                    .disabled(error.isRunning)
                    .accessibilityLabel("Enregistrer")
                }
            }
            .errorAlert(error)
        }
        // A swipe while the correction is being written would orphan the task.
        .interactiveDismissDisabled(error.isRunning)
    }
}

#if DEBUG
#Preview("Espresso — déjà renseigné") {
    Text("Fond")
        .sheet(isPresented: .constant(true)) {
            CoffeeParametersEditSheet(
                initial: Fixtures.espressoParameters,
                vocabulary: Fixtures.coffeeVocabulary
            ) { _ in }
        }
}

#Preview("Neuf — le matériel pré-rempli") {
    Text("Fond")
        .sheet(isPresented: .constant(true)) {
            CoffeeParametersEditSheet(
                initial: .empty,
                vocabulary: Fixtures.coffeeVocabulary,
                previousGear: CoffeeGear(machine: "Rancilio Silvia", grinder: "Niche Zero")
            ) { _ in }
        }
}

#Preview("Latte — la section lait ouverte") {
    Text("Fond")
        .sheet(isPresented: .constant(true)) {
            CoffeeParametersEditSheet(
                initial: CoffeeParameters(
                    beans: Fixtures.espressoParameters.beans,
                    water: Fixtures.espressoParameters.water,
                    extraction: Fixtures.espressoParameters.extraction,
                    milk: CoffeeMilk(kind: "Avoine Oatly", amount: "150 ml", temperature: "65°C"),
                    gear: Fixtures.espressoParameters.gear
                ),
                vocabulary: Fixtures.coffeeVocabulary
            ) { _ in }
        }
}
#endif
