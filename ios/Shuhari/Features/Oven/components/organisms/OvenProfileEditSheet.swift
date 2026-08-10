import SwiftUI

/// Correcting one cooked version's oven settings — a temperature read wrong, a
/// duration the source never stated. The form itself is `OvenProfileForm`, shared
/// with the import preview; this sheet is what saves it. Saving nil is a real
/// answer: it says the dish never bakes, and clears the profile.
struct OvenProfileEditSheet: View {
    let initial: OvenProfile?
    /// What the connected oven is set to right now, offered as a one-tap copy.
    var applianceSettings: OvenSettings?
    let onSave: (OvenProfile?) async throws -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var draft: OvenProfileDraft
    @State private var error = ErrorPresenter()

    init(
        initial: OvenProfile?,
        applianceSettings: OvenSettings? = nil,
        onSave: @escaping (OvenProfile?) async throws -> Void
    ) {
        self.initial = initial
        self.applianceSettings = applianceSettings
        self.onSave = onSave
        _draft = State(initialValue: OvenProfileDraft(initial))
    }

    var body: some View {
        NavigationStack {
            Form {
                OvenProfileForm(draft: $draft, applianceSettings: applianceSettings)
            }
            .navigationTitle("Four")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: {
                        Image(systemName: "xmark")
                    }
                    .disabled(error.isRunning)
                    .accessibilityLabel("Annuler")
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        Task {
                            await error.run { try await onSave(draft.profile) } onSuccess: { dismiss() }
                        }
                    } label: {
                        ActionIcon(systemImage: "checkmark", isRunning: error.isRunning)
                    }
                    .disabled(error.isRunning)
                    .accessibilityLabel("Enregistrer")
                }
            }
            .errorAlert(error)
        }
        // A swipe while the correction is being written would orphan the task.
        .interactiveDismissDisabled(error.isRunning)
    }
}

#if DEBUG
#Preview("Profil existant") {
    Text("Fond")
        .sheet(isPresented: .constant(true)) {
            OvenProfileEditSheet(
                initial: OvenProfile(program: .convection, temperature: 180, duration: 30)
            ) { _ in }
        }
}

#Preview("Le four est réglé") {
    Text("Fond")
        .sheet(isPresented: .constant(true)) {
            OvenProfileEditSheet(
                initial: nil,
                applianceSettings: OvenSettings(
                    program: .steamCombi,
                    temperature: 180,
                    duration: 25,
                    core: nil
                )
            ) { _ in }
        }
}

#Preview("Aucun four") {
    Text("Fond")
        .sheet(isPresented: .constant(true)) {
            OvenProfileEditSheet(initial: nil) { _ in }
        }
}

#endif
