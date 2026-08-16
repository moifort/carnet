import SwiftUI

/// The oven settings a version bakes at, read the way the cook sets the dials: the
/// heating function, the temperature, then how it ends — a timer, a probe target,
/// or both. `big` enlarges everything for the hands-busy execution mode.
/// Primitive-first: no domain struct crosses this boundary, the page above formats
/// the values.
struct OvenProfileSection: View {
    /// One profile's worth of already-formatted values.
    struct Item {
        /// The heating function, written out ("Chaleur tournante") — or the dish an
        /// assisted programme runs ("Quiche et tarte fine"). One line, always: the
        /// mode is a value like the temperature is, never a value plus a caption.
        var program: String
        /// The SF Symbol of that function, chosen by the page.
        var programIcon: String
        /// The dial temperature, written out ("180 °C").
        var temperature: String
        /// The cooking time, written out ("25 min"). nil on a probe cook.
        var duration: String?
        /// The probe target, written out ("63 °C"). nil when there is no probe.
        var core: String?
    }

    let item: Item
    var big: Bool = false
    /// The connected oven's CTA. nil when this account owns no oven, and the section
    /// then shows the settings alone — which is all it ever showed before an oven
    /// was connected.
    var start: Start?
    /// What to select on the appliance when the cooking cannot be started from here,
    /// written out ("Sélectionne « Quiche et tarte fine » sur l’écran du four").
    /// Mutually exclusive with `start`: an oven's own programme is refused as a
    /// command, so the row that would light it gives way to the one that says where
    /// it does start.
    var onAppliance: String?

    /// What it takes to start the cooking from here.
    struct Start {
        /// The oven's own doing, written out ("Cuisson en cours · 12 min"). nil
        /// when it is idle.
        var running: String?
        var isStarting: Bool
        var onStart: () -> Void
    }

    var body: some View {
        Section {
            // An HStack, not a Label: as a LabeledContent's value, a Label lays its
            // icon out in a column of its own — half a row away from the title it
            // belongs to. Here the symbol sits against its name and follows its size.
            LabeledContent("Mode") {
                HStack(spacing: Theme.Spacing.xs) {
                    Image(systemName: item.programIcon)
                    Text(item.program)
                        .multilineTextAlignment(.trailing)
                }
                .font(valueFont)
            }
            .font(valueFont)
            .accessibilityElement(children: .combine)

            row("Température", item.temperature)
            if let duration = item.duration { row("Durée", duration) }
            // The probe replaces the clock rather than joining it, so it reads as
            // what ends the cooking, not as one more number.
            if let core = item.core { row("Sonde", core) }

            if let start {
                OvenStartButton(
                    summary: summary,
                    running: start.running,
                    isStarting: start.isStarting,
                    onStart: start.onStart
                )
            }

            // Not a disabled button: there is nothing to wait for and nothing to
            // switch on, so the row states the one thing left to do instead of
            // dangling an action that will never become available.
            if let onAppliance {
                Label(onAppliance, systemImage: "hand.tap")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .accessibilityIdentifier("oven-start-on-appliance")
            }
        } header: {
            Text("Four")
        }
    }

    private var valueFont: Font { big ? .title3 : .body }

    /// The profile in one line, for the start dialog: lighting a heating element is
    /// never one tap away, the settings being sent are repeated first.
    private var summary: String {
        [item.program, item.temperature, item.duration, item.core.map { "sonde \($0)" }]
            .compactMap { $0 }
            .joined(separator: " · ")
    }

    private func row(_ label: String, _ value: String) -> some View {
        LabeledContent(label) {
            Text(value)
                .font(valueFont)
                .monospacedDigit()
        }
        .font(valueFont)
        .accessibilityElement(children: .combine)
    }
}

#Preview("Minuteur") {
    List {
        OvenProfileSection(
            item: .init(
                program: "Chaleur tournante",
                programIcon: "fan",
                temperature: "180 °C",
                duration: "25 min"
            )
        )
    }
}

#Preview("Sonde") {
    List {
        OvenProfileSection(
            item: .init(
                program: "Sole et voûte",
                programIcon: "thermometer.medium",
                temperature: "160 °C",
                duration: nil,
                core: "63 °C"
            )
        )
    }
}

#Preview("Cuisson assistée") {
    List {
        OvenProfileSection(
            item: .init(
                program: "Quiche et tarte fine",
                programIcon: "wand.and.stars",
                temperature: "180 °C",
                duration: "35 min"
            ),
            onAppliance: "Sélectionne « Quiche et tarte fine » sur l’écran du four."
        )
    }
}

#Preview("Cuisson assistée inconnue") {
    List {
        OvenProfileSection(
            item: .init(
                program: "Cuisson assistée",
                programIcon: "wand.and.stars",
                temperature: "180 °C",
                duration: "45 min"
            ),
            onAppliance: "Cette cuisson assistée se lance sur l’écran du four."
        )
    }
}

#Preview("Four connecté") {
    List {
        OvenProfileSection(
            item: .init(
                program: "Chaleur tournante",
                programIcon: "fan",
                temperature: "180 °C",
                duration: "30 min"
            ),
            start: .init(running: nil, isStarting: false, onStart: {})
        )
    }
}

#Preview("Cuisson en cours") {
    List {
        OvenProfileSection(
            item: .init(
                program: "Chaleur tournante",
                programIcon: "fan",
                temperature: "180 °C",
                duration: "30 min"
            ),
            start: .init(running: "Cuisson en cours · 12 min", isStarting: false, onStart: {})
        )
    }
}

#Preview("Mode exécution") {
    List {
        OvenProfileSection(
            item: .init(
                program: "Gril",
                programIcon: "flame",
                temperature: "220 °C",
                duration: "8 min"
            ),
            big: true
        )
    }
}
