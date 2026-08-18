import SwiftUI

/// A coffee version's parameters, read the way the cook logs them: the coffee
/// (with how long the beans rested), the water, the extraction, the milk when
/// there is some, the gear. Each block is a `List` section that disappears
/// entirely when nothing in it is filled in — a row of blanks teaches less than no
/// row at all. `big` enlarges everything for the hands-busy execution mode.
/// Primitive-first: no domain struct crosses this boundary.
///
/// Handed a `scale`, the cup becomes adjustable the way a shopping list is: the four
/// quantities it is brewed on grow a field and a −/+, and moving any one of them moves
/// the three others by the same factor. Nil (the default) renders strictly what is
/// stored — the import preview and the execution mode read, they do not resize.
struct CoffeeParametersSection: View {
    /// One block's worth of already-formatted values. Nested because the section
    /// takes far more than five parameters, and because the page above is the one
    /// that knows how to write a date in French.
    struct Item {
        var beanName: String?
        var country: String?
        var producer: String?
        /// The roast date, already written out ("12 juin 2026").
        var roastLabel: String?
        /// How long the beans rested, already written out ("J+14").
        var restLabel: String?
        var dose: String?
        var waterKind: String?
        var waterAmount: String?
        var waterTemperature: String?
        var grind: String?
        var time: String?
        var cupYield: String?
        var milkKind: String?
        var milkAmount: String?
        var milkTemperature: String?
        var machine: String?
        var grinder: String?
        /// The profile the machine runs, by the name it is saved under on it.
        var profile: String?
    }

    /// The four quantities a cup is a ratio of — they move together. Everything else
    /// stays where the cook wrote it: a bigger cup is not a longer extraction, nor a
    /// hotter water. The list is named here rather than detected, precisely because
    /// "93°C" and "28 s" would read as quantities and follow along.
    ///
    /// Declaration order is block order, which is what puts the factor badge on the
    /// first block that can be resized.
    enum Quantity: String, CaseIterable {
        case dose
        case water
        case cupYield
        case milk

        /// The block the quantity is read in — where its badge and reset belong.
        var block: String {
            switch self {
            case .dose: "Café"
            case .water: "Eau"
            case .cupYield: "Extraction"
            case .milk: "Lait"
            }
        }
    }

    let item: Item
    var big: Bool = false
    /// The factor the four quantities are rendered through, owned by the sheet so it
    /// dies with it. Nil renders the parameters exactly as stored, with no field and
    /// no stepper.
    var scale: Binding<Double>? = nil
    /// The factor "Réinitialiser" goes back to, and below which the header says
    /// nothing.
    var resetsTo: Double = 1

    /// A quantity as the cook is currently typing it, held only while the field has
    /// the focus: a field being written into cannot be rewritten under their fingers.
    /// Everything else is derived from the single factor.
    @State private var typing: [Quantity: String] = [:]
    @FocusState private var focused: Quantity?

    private var factor: Double {
        scale?.wrappedValue ?? 1
    }

    var body: some View {
        block("Café", rows: [
            Row("Café", item.beanName),
            Row("Pays", item.country),
            Row("Producteur", item.producer),
            Row("Torréfaction", roastValue),
            Row("Dose", item.dose, .dose),
        ])
        block("Eau", rows: [
            Row("Type", item.waterKind),
            Row("Quantité", item.waterAmount, .water),
            Row("Température", item.waterTemperature),
        ])
        block("Extraction", rows: [
            Row("Mouture", item.grind),
            Row("Temps", item.time),
            Row("En tasse", item.cupYield, .cupYield),
        ])
        block("Lait", rows: [
            Row("Type", item.milkKind),
            Row("Quantité", item.milkAmount, .milk),
            Row("Température", item.milkTemperature),
        ])
        block("Matériel", rows: [
            Row("Machine", item.machine),
            Row("Profil", item.profile),
            Row("Moulin", item.grinder),
        ])
    }

    /// "12 juin 2026 · J+14" — the roast date and how long the beans rested before
    /// this cup. The rest rides along with the date rather than taking a row of its
    /// own: it is that date read from the cup, not a second fact.
    private var roastValue: String? {
        guard let roastLabel = item.roastLabel else { return nil }
        guard let restLabel = item.restLabel else { return roastLabel }
        return "\(roastLabel) · \(restLabel)"
    }

    /// One row as the section lays it out: a label, what is filled in, and — on the
    /// four the cup is brewed on — which quantity it is.
    private struct Row {
        let label: String
        let value: String?
        let quantity: Quantity?

        init(_ label: String, _ value: String?, _ quantity: Quantity? = nil) {
            self.label = label
            self.value = value
            self.quantity = quantity
        }
    }

    // MARK: - Blocks

    @ViewBuilder
    private func block(_ title: String, rows: [Row]) -> some View {
        let filled = rows.filter { $0.value != nil }
        if !filled.isEmpty {
            Section {
                ForEach(filled, id: \.label) { row in
                    self.row(row)
                }
            } header: {
                header(title)
            }
        }
    }

    // The block that carries the factor badge and « Réinitialiser » says the cup is
    // no longer the one stored. It is not always "Café": a V60 logged without a dose
    // is resized on its water, and a block nothing is filled in for is not rendered
    // at all — hosting the reset there would let it vanish with the block.
    private var factorHost: String? {
        guard scale != nil else { return nil }
        return Quantity.allCases.first { stored($0).map(QuantityScaling.isScalable) == true }?.block
    }

    @ViewBuilder
    private func header(_ title: String) -> some View {
        HStack {
            Text(title)
            if title == factorHost, factor != resetsTo {
                Spacer()
                Text(QuantityScaling.factorLabel(factor))
                    .monospacedDigit()
                    .foregroundStyle(Theme.Status.changed)
                Button("Réinitialiser") {
                    focused = nil
                    rescale(to: resetsTo)
                }
                .font(.footnote)
                .accessibilityIdentifier("coffee-reset")
            }
        }
        .font(big ? .headline : .subheadline)
    }

    // MARK: - Rows

    @ViewBuilder
    private func row(_ row: Row) -> some View {
        if let quantity = row.quantity, let value = row.value,
           scale != nil, QuantityScaling.isScalable(value) {
            adjustable(row.label, quantity: quantity, stored: value)
        } else {
            LabeledContent(row.label) {
                Text(row.value ?? "")
                    .font(big ? .title3 : .body)
                    .monospacedDigit()
                    .multilineTextAlignment(.trailing)
            }
            .font(big ? .title3 : .body)
            .accessibilityElement(children: .combine)
        }
    }

    /// A quantity the whole cup follows: the wanted amount is typed, or walked with
    /// the −/+. The field and the stepper are siblings, never nested — a field inside
    /// a stepper's label fights it for the tap, and the quantity is what the cook
    /// aims at first.
    private func adjustable(_ label: String, quantity: Quantity, stored: String) -> some View {
        HStack(spacing: Theme.Spacing.s) {
            Text(label)
            Spacer(minLength: Theme.Spacing.s)
            TextField("", text: text(quantity, stored: stored))
                .multilineTextAlignment(.trailing)
                .monospacedDigit()
                .foregroundStyle(factor == resetsTo ? Color.primary : Theme.Status.changed)
                .focused($focused, equals: quantity)
                .submitLabel(.done)
                .onSubmit { focused = nil }
                .frame(maxWidth: 110)
                .accessibilityIdentifier("coffee-quantity-\(quantity.rawValue)")
            Stepper("", onIncrement: { step(quantity, 1) }, onDecrement: { step(quantity, -1) })
                .labelsHidden()
                .accessibilityIdentifier("coffee-stepper-\(quantity.rawValue)")
        }
        .font(big ? .title3 : .body)
        // Leaving a line is what reads what was typed into it — there is no "OK" on a
        // quantity, and the −/+ of another line count as leaving. Each row watches for
        // its own departure, so one focus change commits exactly one quantity.
        .onChange(of: focused) { previous, _ in
            if previous == quantity { commit(quantity) }
        }
    }

    // MARK: - Resizing

    private func stored(_ quantity: Quantity) -> String? {
        switch quantity {
        case .dose: item.dose
        case .water: item.waterAmount
        case .cupYield: item.cupYield
        case .milk: item.milkAmount
        }
    }

    private func text(_ quantity: Quantity, stored: String) -> Binding<String> {
        Binding(
            get: { typing[quantity] ?? QuantityScaling.scaled(stored, by: factor) },
            set: { typing[quantity] = $0 }
        )
    }

    /// What was typed on a line becomes the factor of the whole cup. A quantity the
    /// line cannot be read as (another unit, a word) leaves the factor where it was,
    /// and the line goes back to what it showed.
    private func commit(_ quantity: Quantity) {
        guard let stored = stored(quantity), let typed = typing[quantity] else { return }
        rescale(to: QuantityScaling.factor(from: stored, to: typed) ?? factor)
    }

    private func step(_ quantity: Quantity, _ direction: Int) {
        // A quantity being typed is read before the tick moves anything: the tick
        // starts from what the cook wrote, not from what it replaced.
        if let focused { commit(focused) }
        focused = nil
        guard
            let stored = stored(quantity),
            let next = QuantityScaling.factorAfterStep(on: stored, from: factor, direction: direction)
        else { return }
        rescale(to: next)
    }

    /// The single way the cup moves: one factor, and every quantity redrawn from it.
    private func rescale(to next: Double) {
        scale?.wrappedValue = next
        typing.removeAll()
    }
}

extension CoffeeParametersSection {
    /// Feed the section straight from the domain parameters — the one place the
    /// dates become French text, so the recipe sheet and the import preview cannot
    /// word them differently. The view itself stays primitive-first.
    init(
        parameters: CoffeeParameters,
        restDays: Int? = nil,
        big: Bool = false,
        scale: Binding<Double>? = nil,
        resetsTo: Double = 1
    ) {
        self.item = Item(
            beanName: parameters.beans.name,
            country: parameters.beans.country,
            producer: parameters.beans.producer,
            roastLabel: parameters.beans.roastedOn?
                .formatted(.dateTime.day().month(.wide).year()),
            restLabel: restDays.map { "J+\($0)" },
            dose: parameters.beans.dose,
            waterKind: parameters.water.kind,
            waterAmount: parameters.water.amount,
            waterTemperature: parameters.water.temperature,
            grind: parameters.extraction.grind,
            time: parameters.extraction.time,
            cupYield: parameters.extraction.cupYield,
            milkKind: parameters.milk?.kind,
            milkAmount: parameters.milk?.amount,
            milkTemperature: parameters.milk?.temperature,
            machine: parameters.gear.machine,
            grinder: parameters.gear.grinder,
            profile: parameters.gear.profile
        )
        self.big = big
        self.scale = scale
        self.resetsTo = resetsTo
    }
}

#Preview("Espresso complet") {
    List {
        CoffeeParametersSection(item: CoffeeParametersSection.Item(
            beanName: "Belleville — Guji",
            country: "Éthiopie",
            producer: "Coop. Hambela",
            roastLabel: "12 juin 2026",
            restLabel: "J+14",
            dose: "18 g",
            waterKind: "Robinet (dureté 3/5)",
            waterAmount: "36 g",
            waterTemperature: "93°C",
            grind: "Niveau 12",
            time: "28 s",
            cupYield: "36 g",
            machine: "Rancilio Silvia",
            grinder: "Niche Zero",
            profile: "Sera Modern Arc"
        ))
    }
}

#Preview("Espresso — redimensionnable") {
    @Previewable @State var factor: Double = 1
    List {
        CoffeeParametersSection(
            item: CoffeeParametersSection.Item(
                beanName: "Belleville — Guji",
                roastLabel: "12 juin 2026",
                restLabel: "J+14",
                dose: "18 g",
                waterKind: "Robinet (dureté 3/5)",
                waterAmount: "36 g",
                waterTemperature: "93°C",
                grind: "Niveau 12",
                time: "28 s",
                cupYield: "36 g",
                machine: "Rancilio Silvia"
            ),
            scale: $factor
        )
    }
}

#Preview("Latte — avec son lait") {
    List {
        CoffeeParametersSection(item: CoffeeParametersSection.Item(
            beanName: "Belleville — Guji",
            dose: "18 g",
            grind: "Niveau 12",
            cupYield: "36 g",
            milkKind: "Avoine Oatly",
            milkAmount: "150 ml",
            milkTemperature: "65°C",
            machine: "Rancilio Silvia"
        ))
    }
}

#Preview("Latte — doublé") {
    @Previewable @State var factor: Double = 2
    List {
        CoffeeParametersSection(
            item: CoffeeParametersSection.Item(
                beanName: "Belleville — Guji",
                dose: "18 g",
                grind: "Niveau 12",
                cupYield: "36 g",
                milkKind: "Avoine Oatly",
                milkAmount: "150 ml",
                milkTemperature: "65°C",
                machine: "Rancilio Silvia"
            ),
            scale: $factor
        )
    }
}

#Preview("V60 — à moitié rempli, resizé sur son eau") {
    @Previewable @State var factor: Double = 1
    List {
        CoffeeParametersSection(
            item: CoffeeParametersSection.Item(
                beanName: "Belleville — Sidamo",
                waterAmount: "300 g",
                waterTemperature: "94°C",
                grind: "moyenne"
            ),
            scale: $factor
        )
    }
}

#Preview("Rien de renseigné") {
    List {
        CoffeeParametersSection(item: CoffeeParametersSection.Item())
    }
}

#Preview("En grand — le mode exécution") {
    List {
        CoffeeParametersSection(
            item: CoffeeParametersSection.Item(
                beanName: "Belleville — Guji",
                roastLabel: "12 juin 2026",
                restLabel: "J+14",
                dose: "18 g",
                waterTemperature: "93°C",
                grind: "Niveau 12",
                time: "28 s",
                cupYield: "36 g"
            ),
            big: true
        )
    }
}
