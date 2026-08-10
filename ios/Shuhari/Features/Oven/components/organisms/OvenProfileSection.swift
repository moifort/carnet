import SwiftUI

/// The oven settings a version bakes at, read the way the cook sets the dials: the
/// heating function, the temperature, then how it ends — a timer, a probe target,
/// or both. `big` enlarges everything for the hands-busy execution mode.
/// Primitive-first: no domain struct crosses this boundary, the page above formats
/// the values.
struct OvenProfileSection: View {
    /// One profile's worth of already-formatted values.
    struct Item {
        /// The heating function, written out ("Chaleur tournante").
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
    /// Shown as the section's trailing action when the sheet can edit the profile —
    /// left out in the read-only execution mode.
    var onEdit: (() -> Void)?
    /// Taking what the oven is set to right now onto this version — the gesture for
    /// "I just dialled this in on the appliance, remember it". nil when no oven is
    /// connected, or when it says too little to copy.
    var copy: Copy?
    /// The connected oven's CTA. nil when this account owns no oven, and the section
    /// then shows the settings alone — which is all it ever showed before an oven
    /// was connected.
    var start: Start?

    @State private var confirmingCopy = false

    /// What it takes to copy the oven's dials from here.
    struct Copy {
        /// What would be copied, written out ("Vapeur combinée · 180 °C · 25 min").
        var summary: String
        var isCopying: Bool
        var onCopy: () -> Void
    }

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
            LabeledContent("Mode") {
                Label(item.program, systemImage: item.programIcon)
                    .labelStyle(.titleAndIcon)
                    .font(valueFont)
            }
            .font(valueFont)
            .accessibilityElement(children: .combine)

            row("Température", item.temperature)
            if let duration = item.duration { row("Durée", duration) }
            // The probe replaces the clock rather than joining it, so it reads as
            // what ends the cooking, not as one more number.
            if let core = item.core { row("Sonde", core) }

            if let copy {
                copyRow(copy)
            }

            if let start {
                OvenStartButton(
                    summary: summary,
                    running: start.running,
                    isStarting: start.isStarting,
                    onStart: start.onStart
                )
            }
        } header: {
            HStack {
                Text("Four")
                if let onEdit {
                    Spacer()
                    Button("Modifier", action: onEdit)
                        .font(.caption)
                        .textCase(nil)
                }
            }
        }
    }

    /// Replacing what is written down is not a tap away: the dialog names what is
    /// there now and what would take its place, because the old values are not kept
    /// anywhere — correcting a profile rewrites it, it does not version it.
    @ViewBuilder
    private func copyRow(_ copy: Copy) -> some View {
        Button { confirmingCopy = true } label: {
            HStack {
                ActionIcon(systemImage: "arrow.down.doc", isRunning: copy.isCopying)
                Text("Copier les réglages du four")
            }
        }
        .disabled(copy.isCopying)
        .accessibilityIdentifier("copy-oven-settings-button")
        .confirmationDialog(
            "Remplacer les réglages ?",
            isPresented: $confirmingCopy,
            titleVisibility: .visible
        ) {
            Button("Copier", action: copy.onCopy)
            Button("Annuler", role: .cancel) {}
        } message: {
            Text("\(summary) deviendrait \(copy.summary).")
        }
    }

    private var valueFont: Font { big ? .title3 : .body }

    /// The profile in one line, for both confirmation dialogs. Same separator as
    /// the copy summary they are read against — the "before" and the "after" of a
    /// replacement have to be comparable at a glance.
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
            ),
            onEdit: {}
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
            ),
            onEdit: {}
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
            onEdit: {},
            start: .init(running: nil, isStarting: false, onStart: {})
        )
    }
}

#Preview("Le four propose autre chose") {
    List {
        OvenProfileSection(
            item: .init(
                program: "Chaleur tournante",
                programIcon: "fan",
                temperature: "180 °C",
                duration: "30 min"
            ),
            onEdit: {},
            copy: .init(
                summary: "Vapeur combinée · 180 °C · 25 min",
                isCopying: false,
                onCopy: {}
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
            onEdit: {},
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
