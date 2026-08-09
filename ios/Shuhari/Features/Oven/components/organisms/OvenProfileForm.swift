import SwiftUI

/// What an oven profile is being edited into — the draft the form binds to.
/// `enabled` off is the single spelling of "this dish never bakes": the sheet
/// saves no profile at all rather than a hollow one.
struct OvenProfileDraft {
    var enabled: Bool
    var program: OvenProgram
    var temperature: Int
    var usesTimer: Bool
    var duration: Int
    var usesProbe: Bool
    var core: Int

    init(_ profile: OvenProfile?) {
        let base = profile ?? .blank
        enabled = profile != nil
        program = base.program
        temperature = base.temperature
        usesTimer = base.duration != nil
        duration = base.duration ?? 30
        usesProbe = base.core != nil
        core = base.core ?? 63
    }

    /// The profile to save, or nil when the dish never bakes. A profile with
    /// neither a timer nor a probe is legal: the cook watches it themselves.
    var profile: OvenProfile? {
        guard enabled else { return nil }
        return OvenProfile(
            program: program,
            temperature: temperature,
            duration: usesTimer ? duration : nil,
            core: usesProbe ? core : nil
        )
    }

    /// Copy an assisted-cooking profile off the oven. Everything it states is
    /// taken; a dish it gives no time for keeps whatever timer was set, because a
    /// blank timer would be a worse answer than a stale one.
    mutating func copy(from assisted: AssistedProfile) {
        enabled = true
        program = assisted.program
        temperature = assisted.temperature
        if let duration = assisted.duration {
            usesTimer = true
            self.duration = duration
        }
    }
}

/// One entry of the oven's assisted-cooking catalogue, as the form offers it.
struct AssistedProfile: Identifiable, Sendable, Hashable {
    var label: String
    var program: OvenProgram
    var temperature: Int
    var duration: Int?

    var id: String { label }
}

/// The oven-settings form: whether the dish bakes at all, the heating function,
/// the temperature, then how the cooking ends. A form shows all its fields by
/// construction, which is how a setting nobody logged stays visible and fillable.
/// Composes as `Section`s inside a `Form`.
struct OvenProfileForm: View {
    @Binding var draft: OvenProfileDraft
    /// The oven's own catalogue, offered as a starting point. Empty hides the
    /// picker entirely — a model that exposes no dishes offers no prefill, and the
    /// form works exactly the same without it.
    var assisted: [AssistedProfile] = []

    @State private var showingAssisted = false

    var body: some View {
        Section {
            Toggle("Cuisson au four", isOn: $draft.enabled.animation())
        } footer: {
            Text("Désactive-le si le plat ne passe jamais au four.")
        }

        if draft.enabled {
            if !assisted.isEmpty {
                Section {
                    // The sheet rides on the button, not on the Section: a
                    // presentation attached to a Section inside a Form never fires.
                    Button("Partir d’un profil du four") { showingAssisted = true }
                        .sheet(isPresented: $showingAssisted) { assistedSheet }
                } footer: {
                    Text("Recopie ses réglages ici. Tu peux ensuite les ajuster.")
                }
            }

            Section("Réglages") {
                Picker("Mode", selection: $draft.program) {
                    ForEach(OvenProgram.allCases) { program in
                        Label(program.label, systemImage: program.iconName).tag(program)
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

    private var assistedSheet: some View {
        NavigationStack {
            List(assisted) { profile in
                Button {
                    draft.copy(from: profile)
                    showingAssisted = false
                } label: {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(profile.label)
                        Text(summary(of: profile))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                .tint(.primary)
            }
            .navigationTitle("Profils du four")
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    private func summary(of profile: AssistedProfile) -> String {
        let parts = [
            profile.program.label,
            "\(profile.temperature) °C",
            profile.duration.map { "\($0) min" },
        ].compactMap { $0 }
        return parts.joined(separator: " · ")
    }
}

#if DEBUG
private struct FormHost: View {
    @State var draft: OvenProfileDraft
    var assisted: [AssistedProfile] = []

    var body: some View {
        Form { OvenProfileForm(draft: $draft, assisted: assisted) }
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

#Preview("Avec le catalogue du four") {
    FormHost(
        draft: OvenProfileDraft(nil),
        assisted: [
            AssistedProfile(label: "Quiche", program: .convection, temperature: 180, duration: 40),
            AssistedProfile(label: "Pizza", program: .pizza, temperature: 250, duration: 12),
            AssistedProfile(label: "Gigot", program: .conventional, temperature: 160, duration: nil),
        ]
    )
}
#endif
