import SwiftUI

/// What an oven profile is being edited into — the draft the form binds to.
/// `enabled` off is the single spelling of "this dish never bakes": the sheet
/// saves no profile at all rather than a hollow one.
struct OvenProfileDraft {
    var enabled: Bool
    var program: OvenProgram
    /// The oven's own programme code, carried untouched when the draft came from a
    /// copy. Turning the picker to a heating function drops it — the pair is what
    /// makes an assisted cooking startable.
    var assisted: String?
    var temperature: Int
    var usesTimer: Bool
    var duration: Int
    var usesProbe: Bool
    var core: Int

    init(_ profile: OvenProfile?) {
        let base = profile ?? .blank
        enabled = profile != nil
        program = base.program
        assisted = base.assisted
        temperature = base.temperature
        usesTimer = base.duration != nil
        duration = base.duration ?? 30
        usesProbe = base.core != nil
        core = base.core ?? 63
    }

    /// Take what the oven is currently set to. The gesture this serves: you dialled
    /// a cooking in on the appliance itself — its own assisted programmes included —
    /// and you want the recipe to remember it.
    ///
    /// The copy is as complete as the oven's answer, no more: a dial it reports is
    /// taken, a dial it does not is left to you rather than blocking the whole
    /// gesture. The mode is the one that goes missing in practice — the oven names
    /// its heating functions with codes the notebook does not all know yet — and
    /// losing a temperature and a duration over it was losing what the oven DID say.
    ///
    /// The timer and the probe are the exception: their absence IS an answer. An
    /// oven reporting no timer is an oven cooking without one, so the toggle
    /// follows it down — and the button is never offered on an oven that says
    /// nothing at all, so this never empties a draft over silence.
    mutating func copy(from settings: OvenSettings) {
        enabled = true
        if let program = settings.copyableProgram {
            self.program = program
            assisted = settings.assisted
        }
        if let temperature = settings.temperature { self.temperature = temperature }
        usesTimer = settings.duration != nil
        if let duration = settings.duration { self.duration = duration }
        usesProbe = settings.core != nil
        if let core = settings.core { self.core = core }
    }

    /// The profile to save, or nil when the dish never bakes. A profile with
    /// neither a timer nor a probe is legal: the cook watches it themselves.
    var profile: OvenProfile? {
        guard enabled else { return nil }
        return OvenProfile(
            program: program,
            assisted: program == .assisted ? assisted : nil,
            temperature: temperature,
            duration: usesTimer ? duration : nil,
            core: usesProbe ? core : nil
        )
    }

}

/// The oven-settings form: whether the dish bakes at all, the heating function,
/// the temperature, then how the cooking ends. A form shows all its fields by
/// construction, which is how a setting nobody logged stays visible and fillable.
/// Composes as `Section`s inside a `Form`.
struct OvenProfileForm: View {
    @Binding var draft: OvenProfileDraft
    /// What the connected oven is set to right now, offered as a one-tap copy. nil
    /// when no oven is connected, or when it says too little to make a profile —
    /// the row then disappears rather than offering an empty gesture.
    var applianceSettings: OvenSettings?

    /// The functions the picker offers. An assisted programme copied off the oven
    /// joins them so the row can show what is selected — but it is never offered on a
    /// draft that does not already carry one.
    private var pickable: [OvenProgram] {
        draft.program == .assisted ? [.assisted] + OvenProgram.selectable : OvenProgram.selectable
    }

    var body: some View {
        Section {
            Toggle("Cuisson au four", isOn: $draft.enabled.animation())
        } footer: {
            Text("Désactive-le si le plat ne passe jamais au four.")
        }

        if let applianceSettings, applianceSettings.isCopyable {
            Section {
                Button("Copier les réglages du four") {
                    withAnimation { draft.copy(from: applianceSettings) }
                }
            } footer: {
                VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                    Text(summary(of: applianceSettings))
                    // Said before the tap, not discovered after it: a copy that
                    // leaves the mode alone must say so, or the cook reads the
                    // untouched row as the oven's answer.
                    if applianceSettings.copyableProgram == nil {
                        Text("Le four n’annonce pas son mode : choisis-le toi-même.")
                    }
                }
            }
        }

        if draft.enabled {
            Section("Réglages") {
                // A menu around an inline picker, not a bare Picker: a menu picker
                // lays the selected row out on its own — icon a size up and half a
                // row away from its title — and no modifier reaches inside it. Split
                // in two, the list keeps the system's rows and the closed row is ours
                // to align with the values under it.
                LabeledContent("Mode") {
                    Menu {
                        Picker("Mode", selection: $draft.program) {
                            ForEach(pickable) { program in
                                // The assisted row names the dish the copied code
                                // stands for: the picker is where the cook checks they
                                // kept the right programme, and "Cuisson assistée"
                                // tells them nothing.
                                Label(
                                    program.label(assisted: draft.assisted),
                                    systemImage: program.iconName
                                )
                                .tag(program)
                            }
                        }
                        .pickerStyle(.inline)
                    } label: {
                        // Grey, not tinted: the row is a value the way "180 °C"
                        // below it is one, and the chevron is what says it opens.
                        HStack(spacing: Theme.Spacing.xs) {
                            Image(systemName: draft.program.iconName)
                            Text(draft.program.label(assisted: draft.assisted))
                            Image(systemName: "chevron.up.chevron.down")
                                .font(.footnote)
                        }
                        .foregroundStyle(Color.secondary)
                    }
                }
                Stepper(value: $draft.temperature, in: 30...300, step: 5) {
                    LabeledContent("Température", value: "\(draft.temperature) °C")
                }
            }

            Section {
                Toggle("Minuteur", isOn: $draft.usesTimer.animation())
                if draft.usesTimer {
                    Stepper(value: $draft.duration, in: 1...720, step: 5) {
                        LabeledContent("Durée", value: "\(draft.duration) min")
                    }
                }
            } header: {
                Text("Fin de cuisson")
            } footer: {
                Text("Sans minuteur ni sonde, c’est toi qui surveilles.")
            }

            Section {
                Toggle("Sonde", isOn: $draft.usesProbe.animation())
                if draft.usesProbe {
                    Stepper(value: $draft.core, in: 30...100, step: 1) {
                        LabeledContent("À cœur", value: "\(draft.core) °C")
                    }
                }
            }
        }
    }


    /// What the oven is set to, in one line — so the button says what it will do
    /// before it does it.
    private func summary(of settings: OvenSettings) -> String {
        [
            settings.copyableProgram?.label(assisted: settings.assisted),
            settings.temperature.map { "\($0) °C" },
            settings.duration.map { "\($0) min" },
            settings.core.map { "sonde \($0) °C" },
        ]
        .compactMap { $0 }
        .joined(separator: " · ")
    }
}

#if DEBUG
private struct FormHost: View {
    @State var draft: OvenProfileDraft
    var applianceSettings: OvenSettings?

    /// The functions the picker offers. An assisted programme copied off the oven
    /// joins them so the row can show what is selected — but it is never offered on a
    /// draft that does not already carry one.
    private var pickable: [OvenProgram] {
        draft.program == .assisted ? [.assisted] + OvenProgram.selectable : OvenProgram.selectable
    }

    var body: some View {
        Form { OvenProfileForm(draft: $draft, applianceSettings: applianceSettings) }
    }
}

#Preview("Minuteur") {
    FormHost(draft: OvenProfileDraft(OvenProfile(program: .convection, temperature: 180, duration: 30)))
}

#Preview("Sonde") {
    FormHost(
        draft: OvenProfileDraft(
            OvenProfile(program: .conventional, temperature: 160, duration: nil, core: 63)
        )
    )
}

#Preview("Pas de four") {
    FormHost(draft: OvenProfileDraft(nil))
}

#Preview("Le four est réglé") {
    FormHost(
        draft: OvenProfileDraft(nil),
        applianceSettings: OvenSettings(
            program: .steamCombi,
            temperature: 180,
            duration: 25,
            core: nil
        )
    )
}

/// A real reading: bread baking at 230 °C for an hour on a heating function whose
/// code the notebook has no word for. The dials are copyable, the mode is yours.
#Preview("Le four ne dit pas son mode") {
    FormHost(
        draft: OvenProfileDraft(nil),
        applianceSettings: OvenSettings(program: nil, temperature: 230, duration: 60, core: nil)
    )
}

#endif
