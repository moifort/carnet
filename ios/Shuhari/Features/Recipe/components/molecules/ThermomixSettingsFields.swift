import SwiftUI

/// The four machine settings of one Thermomix step, as editable fields: duration,
/// temperature, blade speed and the reverse toggle. Primitive-first — bound to plain
/// strings and a Bool, so the import preview can reuse it the day it stops showing
/// them as read-only badges.
struct ThermomixSettingsFields: View {
    @Binding var time: String
    @Binding var temperature: String
    @Binding var speed: String
    @Binding var reverse: Bool

    var body: some View {
        VStack(spacing: Theme.Spacing.xs) {
            HStack(spacing: Theme.Spacing.s) {
                field("timer", "Durée", $time, identifier: "thermomix-time-field")
                field("thermometer.medium", "Température", $temperature, identifier: "thermomix-temperature-field")
            }
            HStack(spacing: Theme.Spacing.s) {
                field("speedometer", "Vitesse", $speed, identifier: "thermomix-speed-field")
                Toggle(isOn: $reverse) {
                    Label("Inverse", systemImage: "arrow.counterclockwise")
                        .labelStyle(.titleAndIcon)
                }
                .toggleStyle(.switch)
                .accessibilityIdentifier("thermomix-reverse-toggle")
            }
        }
        .font(.subheadline)
    }

    private func field(
        _ systemImage: String,
        _ placeholder: String,
        _ text: Binding<String>,
        identifier: String
    ) -> some View {
        HStack(spacing: Theme.Spacing.xs) {
            Image(systemName: systemImage)
                .foregroundStyle(.secondary)
            TextField(placeholder, text: text)
                .accessibilityIdentifier(identifier)
        }
    }
}

#if DEBUG
#Preview("Réglages remplis") {
    @Previewable @State var time = "10 min"
    @Previewable @State var temperature = "100°C"
    @Previewable @State var speed = "2"
    @Previewable @State var reverse = true
    Form {
        ThermomixSettingsFields(
            time: $time,
            temperature: $temperature,
            speed: $speed,
            reverse: $reverse
        )
    }
}

#Preview("Étape simple") {
    @Previewable @State var time = ""
    @Previewable @State var temperature = ""
    @Previewable @State var speed = ""
    @Previewable @State var reverse = false
    Form {
        ThermomixSettingsFields(
            time: $time,
            temperature: $temperature,
            speed: $speed,
            reverse: $reverse
        )
    }
}
#endif
