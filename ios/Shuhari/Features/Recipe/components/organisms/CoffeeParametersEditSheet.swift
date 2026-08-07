import SwiftUI

/// The form for one coffee version's parameters — the mirror of what the sheet
/// reads. Correcting what was logged (a roast date read wrong, the grinder left
/// out), never iterating: the brewing steps are not touched here.
///
/// Free-text fields suggest what the cook has already typed on their other
/// coffees; the gear is pre-filled from the previous version, since it is almost
/// always the same machine and the same grinder.
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
    @State private var beanName: String
    @State private var country: String
    @State private var producer: String
    @State private var roastedOn: Date
    /// The roast date is the one field that cannot be "left blank" by typing
    /// nothing — a picker always shows a date — so its presence gets its own toggle.
    @State private var knowsRoastDate: Bool
    @State private var dose: String
    @State private var waterKind: String
    @State private var waterAmount: String
    @State private var waterTemperature: String
    @State private var grind: String
    @State private var time: String
    @State private var cupYield: String
    /// A drink either has milk or has not: the absence is the information, so it
    /// is a toggle rather than three fields left empty.
    @State private var hasMilk: Bool
    @State private var milkKind: String
    @State private var milkAmount: String
    @State private var milkTemperature: String
    @State private var machine: String
    @State private var grinder: String
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
        self._beanName = State(initialValue: initial.beans.name ?? "")
        self._country = State(initialValue: initial.beans.country ?? "")
        self._producer = State(initialValue: initial.beans.producer ?? "")
        self._roastedOn = State(initialValue: initial.beans.roastedOn ?? Date())
        self._knowsRoastDate = State(initialValue: initial.beans.roastedOn != nil)
        self._dose = State(initialValue: initial.beans.dose ?? "")
        self._waterKind = State(initialValue: initial.water.kind ?? "")
        self._waterAmount = State(initialValue: initial.water.amount ?? "")
        self._waterTemperature = State(initialValue: initial.water.temperature ?? "")
        self._grind = State(initialValue: initial.extraction.grind ?? "")
        self._time = State(initialValue: initial.extraction.time ?? "")
        self._cupYield = State(initialValue: initial.extraction.cupYield ?? "")
        self._hasMilk = State(initialValue: initial.milk != nil)
        self._milkKind = State(initialValue: initial.milk?.kind ?? "")
        self._milkAmount = State(initialValue: initial.milk?.amount ?? "")
        self._milkTemperature = State(initialValue: initial.milk?.temperature ?? "")
        self._machine = State(initialValue: initial.gear.machine ?? previousGear.machine ?? "")
        self._grinder = State(initialValue: initial.gear.grinder ?? previousGear.grinder ?? "")
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Café") {
                    SuggestingTextField(
                        title: "Café",
                        text: $beanName,
                        suggestions: vocabulary.beanNames
                    )
                    .accessibilityIdentifier("coffee-bean-name-field")
                    SuggestingTextField(
                        title: "Pays",
                        text: $country,
                        suggestions: vocabulary.countries
                    )
                    .accessibilityIdentifier("coffee-country-field")
                    SuggestingTextField(
                        title: "Producteur",
                        text: $producer,
                        suggestions: vocabulary.producers
                    )
                    .accessibilityIdentifier("coffee-producer-field")
                    Toggle("Date de torréfaction connue", isOn: $knowsRoastDate)
                        .accessibilityIdentifier("coffee-roast-date-toggle")
                    if knowsRoastDate {
                        DatePicker(
                            "Torréfaction",
                            selection: $roastedOn,
                            in: ...Date(),
                            displayedComponents: .date
                        )
                        .accessibilityIdentifier("coffee-roast-date-picker")
                    }
                    labelled("Dose", text: $dose)
                        .accessibilityIdentifier("coffee-dose-field")
                }

                Section("Eau") {
                    SuggestingTextField(
                        title: "Type d’eau",
                        text: $waterKind,
                        suggestions: vocabulary.waterKinds
                    )
                    .accessibilityIdentifier("coffee-water-kind-field")
                    labelled("Quantité", text: $waterAmount)
                        .accessibilityIdentifier("coffee-water-amount-field")
                    labelled("Température", text: $waterTemperature)
                        .accessibilityIdentifier("coffee-water-temperature-field")
                }

                Section("Extraction") {
                    labelled("Mouture", text: $grind)
                        .accessibilityIdentifier("coffee-grind-field")
                    labelled("Temps", text: $time)
                        .accessibilityIdentifier("coffee-time-field")
                    labelled("En tasse", text: $cupYield)
                        .accessibilityIdentifier("coffee-yield-field")
                }

                Section("Lait") {
                    Toggle("Boisson lactée", isOn: $hasMilk)
                        .accessibilityIdentifier("coffee-milk-toggle")
                    if hasMilk {
                        SuggestingTextField(
                            title: "Type de lait",
                            text: $milkKind,
                            suggestions: vocabulary.milkKinds
                        )
                        .accessibilityIdentifier("coffee-milk-kind-field")
                        labelled("Quantité", text: $milkAmount)
                            .accessibilityIdentifier("coffee-milk-amount-field")
                        labelled("Température", text: $milkTemperature)
                            .accessibilityIdentifier("coffee-milk-temperature-field")
                    }
                }

                Section("Matériel") {
                    SuggestingTextField(
                        title: "Machine",
                        text: $machine,
                        suggestions: vocabulary.machines
                    )
                    .accessibilityIdentifier("coffee-machine-field")
                    SuggestingTextField(
                        title: "Moulin",
                        text: $grinder,
                        suggestions: vocabulary.grinders
                    )
                    .accessibilityIdentifier("coffee-grinder-field")
                }
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
                            await error.run { try await onSave(edited) } onSuccess: { dismiss() }
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

    /// A measurement field, labelled like the read-only sheet: the label stays put
    /// once a value is typed, where a placeholder would vanish.
    private func labelled(_ title: String, text: Binding<String>) -> some View {
        LabeledContent(title) {
            TextField(title, text: text)
                .multilineTextAlignment(.trailing)
                .foregroundStyle(.secondary)
        }
    }

    /// The form's current state as parameters. A blank field is absent, never an
    /// empty string: the server reads absence as "nothing known", and a blank
    /// would be rejected by its branded constructor.
    private var edited: CoffeeParameters {
        CoffeeParameters(
            beans: CoffeeBeans(
                name: trimmed(beanName),
                country: trimmed(country),
                producer: trimmed(producer),
                roastedOn: knowsRoastDate ? roastedOn : nil,
                dose: trimmed(dose)
            ),
            water: CoffeeWaterSpec(
                kind: trimmed(waterKind),
                amount: trimmed(waterAmount),
                temperature: trimmed(waterTemperature)
            ),
            extraction: CoffeeExtraction(
                grind: trimmed(grind),
                time: trimmed(time),
                cupYield: trimmed(cupYield)
            ),
            milk: hasMilk
                ? CoffeeMilk(
                    kind: trimmed(milkKind),
                    amount: trimmed(milkAmount),
                    temperature: trimmed(milkTemperature)
                )
                : nil,
            gear: CoffeeGear(machine: trimmed(machine), grinder: trimmed(grinder))
        )
    }

    private func trimmed(_ value: String) -> String? {
        let text = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return text.isEmpty ? nil : text
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
