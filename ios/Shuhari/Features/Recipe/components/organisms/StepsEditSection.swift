import SwiftUI

/// The method being corrected: one numbered field per step, its machine settings
/// underneath on a Thermomix version, swipe to delete, a row to add one. Full
/// replacement, like the shopping list above it. Composes as a `Section` inside a
/// `Form`.
struct StepsEditSection: View {
    @Binding var draft: StepListDraft

    var body: some View {
        Section("Étapes") {
            ForEach(Array(draft.rows.enumerated()), id: \.element.id) { index, _ in
                row(at: index)
            }
            .onDelete { draft.rows.remove(atOffsets: $0) }
            .onMove { draft.rows.move(fromOffsets: $0, toOffset: $1) }
            Button {
                draft.add()
            } label: {
                Label("Ajouter une étape", systemImage: "plus")
            }
            .accessibilityIdentifier("step-add")
        }
    }

    private func row(at index: Int) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            HStack(alignment: .top, spacing: 12) {
                Text("\(index + 1)")
                    .font(.subheadline.weight(.semibold))
                    .monospacedDigit()
                    .foregroundStyle(.secondary)
                    .frame(minWidth: 20, alignment: .trailing)
                TextField("Étape", text: $draft.rows[index].text, axis: .vertical)
                    .lineLimit(1...6)
            }
            if draft.showsSettings {
                ThermomixSettingsFields(
                    time: $draft.rows[index].time,
                    temperature: $draft.rows[index].temperature,
                    speed: $draft.rows[index].speed,
                    reverse: $draft.rows[index].reverse
                )
            }
        }
    }
}

#if DEBUG
private struct SectionHost: View {
    @State var draft: StepListDraft

    var body: some View {
        Form { StepsEditSection(draft: $draft) }
    }
}

#Preview("Plat") {
    SectionHost(draft: StepListDraft(Fixtures.bourguignonV3.editableSteps, showsSettings: false))
}

#Preview("Thermomix — réglages machine") {
    SectionHost(draft: StepListDraft(Fixtures.risottoV2.editableSteps, showsSettings: true))
}

#Preview("Aucune étape") {
    SectionHost(draft: StepListDraft([], showsSettings: false))
}
#endif
