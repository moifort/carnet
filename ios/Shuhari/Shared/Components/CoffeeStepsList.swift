import SwiftUI

/// Numbered brewing steps: the instruction plus capsule badges for the extraction
/// settings (grind / water / temperature / time / yield). Renders one row per step
/// (List/Form-friendly), like `ThermomixStepsList`; `big` enlarges everything for
/// the hands-busy execution mode.
struct CoffeeStepsList: View {
    struct Item {
        let text: String
        let grind: String?
        let water: String?
        let temperature: String?
        let time: String?
        let cupYield: String?

        var hasSettings: Bool {
            grind != nil || water != nil || temperature != nil || time != nil || cupYield != nil
        }
    }

    let items: [Item]
    var big: Bool = false
    /// Step indices changed vs the previous version — flagged with a leading
    /// orange dot. Empty (the default) renders exactly like the plain recipe sheet.
    var modified: Set<Int> = []

    var body: some View {
        if big {
            VStack(alignment: .leading, spacing: 16) {
                ForEach(Array(items.enumerated()), id: \.offset) { index, item in
                    row(index: index, item: item)
                }
            }
        } else {
            ForEach(Array(items.enumerated()), id: \.offset) { index, item in
                row(index: index, item: item)
            }
        }
    }

    private func row(index: Int, item: Item) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            if !modified.isEmpty {
                Circle()
                    .fill(modified.contains(index) ? Theme.Status.changed : .clear)
                    .frame(width: 7, height: 7)
            }
            Text("\(index + 1)")
                .font((big ? Font.title2 : .subheadline).weight(.semibold))
                .monospacedDigit()
                .foregroundStyle(.secondary)
                .frame(minWidth: big ? 28 : 20, alignment: .trailing)
            VStack(alignment: .leading, spacing: big ? 10 : 6) {
                Text(item.text)
                    .font(big ? .title3 : .body)
                if item.hasSettings {
                    CoffeeSettingBadges(
                        grind: item.grind,
                        water: item.water,
                        temperature: item.temperature,
                        time: item.time,
                        cupYield: item.cupYield,
                        big: big
                    )
                }
            }
        }
    }
}

extension CoffeeStepsList {
    /// Feed the list straight from the nested `CoffeeStep` model — each step
    /// already carries its own settings, so there is nothing to re-align.
    init(steps: [CoffeeStep], big: Bool = false, modified: Set<Int> = []) {
        self.items = steps.map {
            Item(
                text: $0.text,
                grind: $0.settings.grind,
                water: $0.settings.water,
                temperature: $0.settings.temperature,
                time: $0.settings.time,
                cupYield: $0.settings.cupYield
            )
        }
        self.big = big
        self.modified = modified
    }
}

/// Read-only capsule badges for one step's extraction settings, tinted
/// `Theme.Status.coffee`. Shared by the read-only `CoffeeStepsList` and the
/// editable import preview (where step text is editable but the extraction
/// settings stay read-only).
struct CoffeeSettingBadges: View {
    let grind: String?
    let water: String?
    let temperature: String?
    let time: String?
    let cupYield: String?
    var big: Bool = false

    var hasSettings: Bool {
        grind != nil || water != nil || temperature != nil || time != nil || cupYield != nil
    }

    var body: some View {
        // Read in the order the gesture happens: grind, pour, heat, wait, serve.
        FlowLayout(spacing: 6) {
            if let grind {
                badge(grind, icon: "circle.grid.3x3")
            }
            if let water {
                badge(water, icon: "drop")
            }
            if let temperature {
                badge(temperature, icon: "thermometer.medium")
            }
            if let time {
                badge(time, icon: "hourglass")
            }
            if let cupYield {
                badge(cupYield, icon: "cup.and.saucer")
            }
        }
    }

    // Not a Label: Label's lazily-resolved style breaks inside a custom Layout
    // (the title vanishes and the icon stretches its capsule).
    private func badge(_ text: String, icon: String) -> some View {
        HStack(spacing: 4) {
            Image(systemName: icon)
            Text(text)
        }
        .font((big ? Font.subheadline : .caption).weight(.semibold))
        .monospacedDigit()
        .foregroundStyle(Theme.Status.coffee)
        .padding(.horizontal, big ? 10 : 8)
        .padding(.vertical, big ? 5 : 3)
        .background(Theme.Status.coffee.opacity(0.12), in: Capsule())
        .accessibilityElement(children: .combine)
    }
}

#Preview("Fiche") {
    List {
        CoffeeStepsList(items: [
            .init(
                text: "Rincer le filtre à l’eau chaude et jeter l’eau de rinçage.",
                grind: nil, water: nil, temperature: nil, time: nil, cupYield: nil
            ),
            .init(
                text: "Moudre le café et le déposer dans le cône.",
                grind: "moyenne", water: nil, temperature: nil, time: nil, cupYield: nil
            ),
            .init(
                text: "Verser l’eau de pré-infusion et laisser gonfler.",
                grind: nil, water: "50 g", temperature: "94°C", time: "45 s", cupYield: nil
            ),
            .init(
                text: "Verser le reste de l’eau en spirale, en trois fois.",
                grind: nil, water: "250 g", temperature: "94°C", time: "2 min 30", cupYield: "300 g"
            ),
        ])
    }
}

#Preview("Espresso, en grand") {
    ScrollView {
        CoffeeStepsList(
            items: [
                .init(
                    text: "Moudre 18 g de café fin dans le porte-filtre.",
                    grind: "Niveau 12", water: nil, temperature: nil, time: nil, cupYield: nil
                ),
                .init(
                    text: "Extraire jusqu’au poids cible.",
                    grind: nil, water: nil, temperature: "93°C", time: "28 s", cupYield: "36 g"
                ),
            ],
            big: true
        )
        .padding()
    }
}
