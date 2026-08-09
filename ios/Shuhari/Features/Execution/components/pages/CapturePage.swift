import PhotosUI
import SwiftUI

/// Everything the cook has to say about the displayed version, in one page: a 5-star
/// rating, remarks and photos of the result, and the tips worth keeping. Each field
/// is optional and what is filled decides what happens — the flow routes, the page
/// only collects. Validation lives in the top-right toolbar; the flow provides the
/// close button.
struct CapturePage: View {
    let isSaving: Bool
    /// Emits the whole form. The rating is optional: without it the remark is an
    /// improvement asked with no cook behind it.
    let onSave: (_ rating: Int?, _ remarks: String, _ tips: String, _ photoBase64: String?) -> Void

    /// A picked photo kept both decoded (for the thumbnail) and encoded (payload).
    private struct LoadedPhoto: Identifiable {
        let id = UUID()
        let image: UIImage
        let base64: String
    }

    @State private var rating: Int?
    @State private var remarks: String = ""
    @State private var tips: String = ""
    @State private var photoItems: [PhotosPickerItem] = []
    @State private var photos: [LoadedPhoto] = []

    var body: some View {
        Form {
            Section {
                StarRating(selection: $rating)
                    .listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 4, trailing: 0))
            }
            .listRowBackground(Color.clear)

            // Remarks and photos share one block.
            Section {
                TextField("Ex. : trop amer, coule trop vite, manque de liant…", text: $remarks, axis: .vertical)
                    .lineLimit(5...20)
                    .frame(minHeight: 100, alignment: .top)
                    .accessibilityIdentifier("remarks-field")

                photoRow
            } footer: {
                Text("Une remarque demande la version suivante à l’IA.")
            }

            // The advice worth keeping, which is not a change to make: it is
            // reworded onto THIS version instead of asking for another one.
            Section {
                TextField(
                    "Ex. : servir avec du riz, se congèle bien, sortir du frigo 1 h avant…",
                    text: $tips,
                    axis: .vertical
                )
                .lineLimit(3...12)
                .frame(minHeight: 60, alignment: .top)
                .accessibilityIdentifier("tips-field")
            } header: {
                Text("Conseils")
            } footer: {
                Text("Un conseil est retenu sur cette version, sans en créer une nouvelle.")
            }
        }
        .listSectionSpacing(.compact)
        .contentMargins(.top, Theme.Spacing.s, for: .scrollContent)
        .scrollDismissesKeyboard(.interactively)
        .navigationTitle("Remarque")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button {
                    onSave(rating, trimmed(remarks), trimmed(tips), photos.first?.base64)
                } label: {
                    ActionIcon(systemImage: "checkmark", isRunning: isSaving)
                }
                .disabled(!hasSomethingToSay || isSaving)
                .accessibilityIdentifier("save-attempt-button")
                .accessibilityLabel("Valider")
            }
        }
        .onChange(of: photoItems) { _, newValue in
            Task { await loadPhotos(newValue) }
        }
    }

    /// An empty form has nothing to send: a photo alone says nothing either, it
    /// illustrates a cook that has to be rated to exist.
    private var hasSomethingToSay: Bool {
        rating != nil || !trimmed(remarks).isEmpty || !trimmed(tips).isEmpty
    }

    private func trimmed(_ text: String) -> String {
        text.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    // MARK: - Photos

    private var photoRow: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: Theme.Spacing.s) {
                ForEach(photos) { photo in
                    Image(uiImage: photo.image)
                        .resizable()
                        .scaledToFill()
                        .frame(width: 72, height: 72)
                        .clipShape(.rect(cornerRadius: Theme.Radius.control))
                }

                PhotosPicker(selection: $photoItems, maxSelectionCount: 5, matching: .images) {
                    Image(systemName: "photo.badge.plus")
                        .font(.title3)
                        .foregroundStyle(Color.accentColor)
                        .frame(width: 72, height: 72)
                        .background(Color(.systemFill), in: .rect(cornerRadius: Theme.Radius.control))
                }
                .accessibilityIdentifier("photo-picker")
                .accessibilityLabel("Ajouter des photos")
            }
            .padding(.vertical, 2)
        }
    }

    private func loadPhotos(_ items: [PhotosPickerItem]) async {
        var loaded: [LoadedPhoto] = []
        for item in items {
            guard let data = try? await item.loadTransferable(type: Data.self) else { continue }
            let jpeg = await Task.detached(priority: .userInitiated) {
                UIImage(data: data).flatMap { $0.resized(maxDimension: 1200).jpegData(compressionQuality: 0.7) }
            }.value
            if let jpeg, let image = UIImage(data: jpeg) {
                loaded.append(LoadedPhoto(image: image, base64: jpeg.base64EncodedString()))
            }
        }
        photos = loaded
    }
}

#Preview {
    NavigationStack {
        CapturePage(
            isSaving: false,
            onSave: { _, _, _, _ in }
        )
    }
}
