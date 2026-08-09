import SwiftUI

/// The CTA that starts the cooking on the connected oven. A network call, so it
/// shows it: `ActionIcon` turns into a spinner while the appliance is being asked.
/// Primitive-first — it knows nothing of a recipe, only what to say and whether
/// something is already cooking.
struct OvenStartButton: View {
    /// The profile in one line ("Chaleur tournante 180 °C, 25 min") — what the
    /// confirmation dialog repeats back before a heating element is lit.
    let summary: String
    /// What the oven is already doing, written out ("Cuisson en cours · 12 min").
    /// Non-nil replaces the CTA: a second cooking is never offered.
    var running: String?
    var isStarting: Bool = false
    let onStart: () -> Void

    @State private var confirming = false

    var body: some View {
        if let running {
            Label(running, systemImage: "flame.fill")
                .foregroundStyle(.orange)
                .accessibilityElement(children: .combine)
        } else {
            Button { confirming = true } label: {
                HStack {
                    ActionIcon(systemImage: "play.circle.fill", isRunning: isStarting)
                    Text("Lancer la cuisson")
                }
            }
            .disabled(isStarting)
            .accessibilityIdentifier("start-oven-button")
            // Starting a cooking lights a heating element in an empty room: it is
            // never one tap away, and the dialog repeats the settings being sent.
            .confirmationDialog(
                "Lancer la cuisson ?",
                isPresented: $confirming,
                titleVisibility: .visible
            ) {
                Button("Lancer", action: onStart)
                Button("Annuler", role: .cancel) {}
            } message: {
                Text("\(summary). Assure-toi que le plat est bien dans le four.")
            }
        }
    }
}

#Preview("Prêt") {
    List {
        OvenStartButton(summary: "Chaleur tournante 180 °C, 30 min") {}
    }
}

#Preview("En cours d’envoi") {
    List {
        OvenStartButton(summary: "Chaleur tournante 180 °C, 30 min", isStarting: true) {}
    }
}

#Preview("Cuisson en cours") {
    List {
        OvenStartButton(
            summary: "Chaleur tournante 180 °C, 30 min",
            running: "Cuisson en cours · 12 min"
        ) {}
    }
}
