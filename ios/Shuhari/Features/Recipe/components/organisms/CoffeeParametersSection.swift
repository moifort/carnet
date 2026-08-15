import SwiftUI

/// A coffee version's parameters, read the way the cook logs them: the coffee
/// (with how long the beans rested), the water, the extraction, the milk when
/// there is some, the gear. Each block is a `List` section that disappears
/// entirely when nothing in it is filled in — a row of blanks teaches less than no
/// row at all. `big` enlarges everything for the hands-busy execution mode.
/// Primitive-first: no domain struct crosses this boundary.
struct CoffeeParametersSection: View {
    /// One block's worth of already-formatted values. Nested because the section
    /// takes far more than five parameters, and because the page above is the one
    /// that knows how to write a date in French.
    struct Item {
        var beanName: String?
        var country: String?
        var producer: String?
        /// How far the roaster took the beans ("Torréfaction claire").
        var roast: String?
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
    }

    let item: Item
    var big: Bool = false

    var body: some View {
        block("Café", rows: [
            ("Café", item.beanName),
            ("Pays", item.country),
            ("Producteur", item.producer),
            ("Profil", item.roast),
            ("Torréfaction", roastValue),
            ("Dose", item.dose),
        ])
        block("Eau", rows: [
            ("Type", item.waterKind),
            ("Quantité", item.waterAmount),
            ("Température", item.waterTemperature),
        ])
        block("Extraction", rows: [
            ("Mouture", item.grind),
            ("Temps", item.time),
            ("En tasse", item.cupYield),
        ])
        block("Lait", rows: [
            ("Type", item.milkKind),
            ("Quantité", item.milkAmount),
            ("Température", item.milkTemperature),
        ])
        block("Matériel", rows: [
            ("Machine", item.machine),
            ("Moulin", item.grinder),
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

    @ViewBuilder
    private func block(_ title: String, rows: [(String, String?)]) -> some View {
        let filled = rows.compactMap { label, value in value.map { (label: label, value: $0) } }
        if !filled.isEmpty {
            Section {
                ForEach(filled, id: \.label) { row in
                    LabeledContent(row.label) {
                        Text(row.value)
                            .font(big ? .title3 : .body)
                            .monospacedDigit()
                            .multilineTextAlignment(.trailing)
                    }
                    .font(big ? .title3 : .body)
                    .accessibilityElement(children: .combine)
                }
            } header: {
                Text(title)
                    .font(big ? .headline : .subheadline)
            }
        }
    }
}

extension CoffeeParametersSection {
    /// Feed the section straight from the domain parameters — the one place the
    /// dates become French text, so the recipe sheet and the import preview cannot
    /// word them differently. The view itself stays primitive-first.
    init(parameters: CoffeeParameters, restDays: Int? = nil, big: Bool = false) {
        self.item = Item(
            beanName: parameters.beans.name,
            country: parameters.beans.country,
            producer: parameters.beans.producer,
            roast: parameters.beans.roast,
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
            grinder: parameters.gear.grinder
        )
        self.big = big
    }
}

#Preview("Espresso complet") {
    List {
        CoffeeParametersSection(item: CoffeeParametersSection.Item(
            beanName: "Belleville — Guji",
            country: "Éthiopie",
            producer: "Coop. Hambela",
            roast: "Torréfaction claire",
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
            grinder: "Niche Zero"
        ))
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

#Preview("V60 — à moitié rempli") {
    List {
        CoffeeParametersSection(item: CoffeeParametersSection.Item(
            beanName: "Belleville — Sidamo",
            waterAmount: "300 g",
            waterTemperature: "94°C",
            grind: "moyenne"
        ))
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
