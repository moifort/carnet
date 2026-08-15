import SwiftUI

/// The editable state of a coffee's parameters — every field a string, because
/// every field is typed. Held by the page above the form so the three screens that
/// write a coffee (the correction sheet, the import preview, the AI proposal) share
/// one shape and one conversion back to the domain.
struct CoffeeParametersDraft: Sendable, Equatable {
    var beanName: String
    var country: String
    var producer: String
    /// How far the roaster took the beans ("Torréfaction claire", "Medium roast").
    var roast: String
    /// The roast date cannot be "left blank" by typing nothing — a picker always
    /// shows a date — so its presence gets its own flag.
    var roastedOn: Date
    var knowsRoastDate: Bool
    var dose: String
    var waterKind: String
    var waterAmount: String
    var waterTemperature: String
    var grind: String
    var time: String
    var cupYield: String
    /// A drink either has milk or has not: the absence is the information, so it is
    /// a toggle rather than three fields left empty.
    var hasMilk: Bool
    var milkKind: String
    var milkAmount: String
    var milkTemperature: String
    var machine: String
    var grinder: String

    /// - Parameters:
    ///   - parameters: what is already known — every unknown field starts blank.
    ///   - method: opens the milk block on a drink that has some by definition.
    ///   - gear: the machine and grinder to fall back on (the previous version's,
    ///     or the most recent ones the cook used) when the parameters carry none.
    init(_ parameters: CoffeeParameters, method: BrewMethod? = nil, gear: CoffeeGear = .empty) {
        beanName = parameters.beans.name ?? ""
        country = parameters.beans.country ?? ""
        producer = parameters.beans.producer ?? ""
        roast = parameters.beans.roast ?? ""
        roastedOn = parameters.beans.roastedOn ?? Date()
        knowsRoastDate = parameters.beans.roastedOn != nil
        dose = parameters.beans.dose ?? ""
        waterKind = parameters.water.kind ?? ""
        waterAmount = parameters.water.amount ?? ""
        waterTemperature = parameters.water.temperature ?? ""
        grind = parameters.extraction.grind ?? ""
        time = parameters.extraction.time ?? ""
        cupYield = parameters.extraction.cupYield ?? ""
        hasMilk = parameters.milk != nil || Self.pouredWithMilk(method)
        milkKind = parameters.milk?.kind ?? ""
        milkAmount = parameters.milk?.amount ?? ""
        milkTemperature = parameters.milk?.temperature ?? ""
        machine = parameters.gear.machine ?? gear.machine ?? ""
        grinder = parameters.gear.grinder ?? gear.grinder ?? ""
    }

    /// A milk drink shows its milk block from the start — the cook will fill it in.
    /// Every other method keeps the toggle closed: an espresso has no milk, and that
    /// absence is information, not an unfilled field.
    private static func pouredWithMilk(_ method: BrewMethod?) -> Bool {
        switch method {
        case .flatWhite, .cappuccino, .latte: true
        default: false
        }
    }

    /// The form's current state as parameters. A blank field is absent, never an
    /// empty string: the server reads absence as "nothing known", and a blank would
    /// be rejected by its branded constructor.
    var parameters: CoffeeParameters {
        CoffeeParameters(
            beans: CoffeeBeans(
                name: trimmed(beanName),
                country: trimmed(country),
                producer: trimmed(producer),
                roast: trimmed(roast),
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

/// The five blocks a coffee is set by, as a form. **Every field is always shown**,
/// filled or not: a coffee is reproducible only if the cook can see what is missing
/// from it. Free-text fields suggest what has already been typed on other coffees.
///
/// Used by the correction sheet, the import preview and the AI proposal — the three
/// moments a coffee is written — so there is a single place that knows what a coffee
/// looks like. Sections only, no `Form`: the page above supplies the container.
struct CoffeeParametersForm: View {
    @Binding var draft: CoffeeParametersDraft
    /// What each free-text field offers, most recent first.
    var vocabulary: CoffeeVocabulary = .empty
    /// The version this one iterates from: a field whose value differs carries the
    /// changed dot. Absent on a correction or an import, where there is nothing to
    /// differ from and nothing is ever marked.
    var changedFrom: CoffeeParameters?

    /// Whether the coffee arrived with a roast date. Read once, at open: a date
    /// somebody already knows is shown as itself, and the toggle that declares a
    /// missing one stays put for the whole session — flipping it on must never
    /// take away the way back to "unknown".
    @State private var roastDateWasRead: Bool

    init(
        draft: Binding<CoffeeParametersDraft>,
        vocabulary: CoffeeVocabulary = .empty,
        changedFrom: CoffeeParameters? = nil
    ) {
        _draft = draft
        self.vocabulary = vocabulary
        self.changedFrom = changedFrom
        _roastDateWasRead = State(initialValue: draft.wrappedValue.knowsRoastDate)
    }

    var body: some View {
        Section("Café") {
            suggesting("Café", $draft.beanName, vocabulary.beanNames, changedFrom?.beans.name)
                .accessibilityIdentifier("coffee-bean-name-field")
            suggesting("Pays", $draft.country, vocabulary.countries, changedFrom?.beans.country)
                .accessibilityIdentifier("coffee-country-field")
            suggesting(
                "Producteur", $draft.producer, vocabulary.producers, changedFrom?.beans.producer
            )
            .accessibilityIdentifier("coffee-producer-field")
            suggesting("Profil", $draft.roast, vocabulary.roasts, changedFrom?.beans.roast)
                .accessibilityIdentifier("coffee-roast-field")
            // A date read off the bag is a fact, not a question: it is shown as
            // itself, and only a coffee that arrived without one asks.
            if !roastDateWasRead {
                row {
                    Toggle("Date de torréfaction connue", isOn: $draft.knowsRoastDate)
                }
                .accessibilityIdentifier("coffee-roast-date-toggle")
            }
            if draft.knowsRoastDate {
                row {
                    DatePicker(
                        "Torréfaction",
                        selection: $draft.roastedOn,
                        in: ...Date(),
                        displayedComponents: .date
                    )
                }
                .accessibilityIdentifier("coffee-roast-date-picker")
            }
            quantity("Dose", $draft.dose, changedFrom?.beans.dose, step: 0.5, unit: "g")
                .accessibilityIdentifier("coffee-dose-field")
        }

        Section("Eau") {
            suggesting(
                "Type d’eau", $draft.waterKind, vocabulary.waterKinds, changedFrom?.water.kind
            )
            .accessibilityIdentifier("coffee-water-kind-field")
            quantity("Quantité", $draft.waterAmount, changedFrom?.water.amount, step: 10, unit: "g")
                .accessibilityIdentifier("coffee-water-amount-field")
            labelled("Température", $draft.waterTemperature, changedFrom?.water.temperature)
                .accessibilityIdentifier("coffee-water-temperature-field")
        }

        Section("Extraction") {
            labelled("Mouture", $draft.grind, changedFrom?.extraction.grind)
                .accessibilityIdentifier("coffee-grind-field")
            labelled("Temps", $draft.time, changedFrom?.extraction.time)
                .accessibilityIdentifier("coffee-time-field")
            quantity(
                "En tasse", $draft.cupYield, changedFrom?.extraction.cupYield, step: 1, unit: "g"
            )
            .accessibilityIdentifier("coffee-yield-field")
        }

        Section("Lait") {
            row {
                Toggle("Boisson lactée", isOn: $draft.hasMilk)
            }
            .accessibilityIdentifier("coffee-milk-toggle")
            if draft.hasMilk {
                suggesting(
                    "Type de lait", $draft.milkKind, vocabulary.milkKinds, changedFrom?.milk?.kind
                )
                .accessibilityIdentifier("coffee-milk-kind-field")
                quantity(
                    "Quantité", $draft.milkAmount, changedFrom?.milk?.amount, step: 10, unit: "ml"
                )
                .accessibilityIdentifier("coffee-milk-amount-field")
                labelled("Température", $draft.milkTemperature, changedFrom?.milk?.temperature)
                    .accessibilityIdentifier("coffee-milk-temperature-field")
            }
        }

        Section("Matériel") {
            suggesting("Machine", $draft.machine, vocabulary.machines, changedFrom?.gear.machine)
                .accessibilityIdentifier("coffee-machine-field")
            suggesting("Moulin", $draft.grinder, vocabulary.grinders, changedFrom?.gear.grinder)
                .accessibilityIdentifier("coffee-grinder-field")
        }
    }

    /// A free-text field: what the cook has already typed is one tap away, typing
    /// something new is always allowed.
    private func suggesting(
        _ title: String,
        _ text: Binding<String>,
        _ suggestions: [String],
        _ base: String?
    ) -> some View {
        row(changed(text.wrappedValue, base), alignment: .top) {
            SuggestingTextField(title: title, text: text, suggestions: suggestions)
        }
    }

    /// A measurement field, labelled like the read-only sheet: the label stays put
    /// once a value is typed, where a placeholder would vanish.
    private func labelled(_ title: String, _ text: Binding<String>, _ base: String?) -> some View {
        row(changed(text.wrappedValue, base)) {
            measure(title, text)
        }
    }

    /// A quantity — a dose, a pour, what lands in the cup. The same labelled field,
    /// plus the native stepper: a mass is a dial the cook nudges one notch at a
    /// time far more often than a number they retype.
    private func quantity(
        _ title: String,
        _ text: Binding<String>,
        _ base: String?,
        step: Double,
        unit: String
    ) -> some View {
        row(changed(text.wrappedValue, base)) {
            measure(title, text)
            // Label hidden and the field kept outside it: a `Stepper` swallows the
            // taps on its own label, and typing a quantity must stay possible.
            Stepper("") {
                text.wrappedValue = stepped(text.wrappedValue, by: step, unit: unit)
            } onDecrement: {
                text.wrappedValue = stepped(text.wrappedValue, by: -step, unit: unit)
            }
            .labelsHidden()
        }
    }

    private func measure(_ title: String, _ text: Binding<String>) -> some View {
        LabeledContent(title) {
            TextField(title, text: text)
                .multilineTextAlignment(.trailing)
                .foregroundStyle(.secondary)
        }
    }

    /// The measurement nudged by one notch: the leading number moves, whatever
    /// follows it — the unit, a remark — is kept exactly as typed. A field with no
    /// number yet starts at one step of its own unit, so the buttons always do
    /// something, and nothing ever goes below zero.
    private func stepped(_ value: String, by step: Double, unit: String) -> String {
        let text = value.trimmingCharacters(in: .whitespacesAndNewlines)
        let number = text.prefix { $0.isNumber || $0 == "," || $0 == "." }
        guard let amount = Double(number.replacingOccurrences(of: ",", with: ".")) else {
            return step > 0 ? "\(formatted(step)) \(unit)" : text
        }
        return formatted(max(0, amount + step)) + text.dropFirst(number.count)
    }

    /// Written the way the cook would: no trailing zero on a round number, and the
    /// decimal separator of the language the app speaks.
    private func formatted(_ amount: Double) -> String {
        amount.formatted(.number.precision(.fractionLength(0...1)).grouping(.never))
    }

    /// Every row shares one leading gutter, so the labels line up whatever the row
    /// holds. The dot's column only exists where a dot can appear: outside a
    /// proposal nothing is ever marked, and the form keeps the standard inset.
    private func row(
        _ changed: Bool = false,
        alignment: VerticalAlignment = .center,
        @ViewBuilder content: () -> some View
    ) -> some View {
        HStack(alignment: alignment, spacing: Theme.Spacing.s) {
            if changedFrom != nil { changeDot(changed) }
            content()
        }
    }

    /// The same rule as the proposal's ingredient and step rows: a value that moved
    /// from the base version is marked. Nothing to compare against outside a
    /// proposal, so nothing is ever marked there.
    private func changed(_ value: String, _ base: String?) -> Bool {
        guard changedFrom != nil else { return false }
        return value.trimmingCharacters(in: .whitespacesAndNewlines) != (base ?? "")
    }

    /// The orange dot marking a changed field. Filled clear (not removed) on an
    /// unchanged one so every row keeps the same leading alignment.
    private func changeDot(_ changed: Bool) -> some View {
        Circle()
            .fill(changed ? Theme.Status.changed : .clear)
            .frame(width: 7, height: 7)
            .accessibilityHidden(true)
    }
}

#if DEBUG
private struct CoffeeParametersFormPreview: View {
    @State var draft: CoffeeParametersDraft
    var changedFrom: CoffeeParameters?

    var body: some View {
        Form {
            CoffeeParametersForm(
                draft: $draft,
                vocabulary: Fixtures.coffeeVocabulary,
                changedFrom: changedFrom
            )
        }
    }
}

#Preview("Déjà renseigné") {
    CoffeeParametersFormPreview(draft: CoffeeParametersDraft(Fixtures.espressoParameters))
}

#Preview("Vide — le matériel pré-rempli") {
    CoffeeParametersFormPreview(
        draft: CoffeeParametersDraft(
            .empty,
            method: .espresso,
            gear: CoffeeGear(machine: "Rancilio Silvia", grinder: "Niche Zero")
        )
    )
}

#Preview("Une seule variable déplacée") {
    CoffeeParametersFormPreview(
        draft: CoffeeParametersDraft(
            CoffeeParameters(
                beans: Fixtures.espressoParameters.beans,
                water: Fixtures.espressoParameters.water,
                extraction: CoffeeExtraction(grind: "Niveau 10", time: "28 s", cupYield: "36 g"),
                milk: nil,
                gear: Fixtures.espressoParameters.gear
            )
        ),
        changedFrom: Fixtures.espressoParameters
    )
}
#endif
