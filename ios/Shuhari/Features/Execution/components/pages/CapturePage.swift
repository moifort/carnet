import PhotosUI
import SwiftUI

/// Everything the cook has to say about the displayed version, in one page: a 5-star
/// rating, the change they made while cooking, what they would like improved, a photo
/// of the result, and the tips worth keeping. Each field is optional and what is
/// filled decides what happens — the flow routes, the page only collects. Validation
/// lives in the top-right toolbar; the flow provides the close button.
struct CapturePage: View {
    let isSaving: Bool
    /// Emits the whole form in one value: five fields is past the point where a
    /// positional closure can be read at the call site.
    let onSave: (Capture) -> Void

    /// What the form collected. Every field is optional, and the combination is what
    /// the flow routes on — a change and an improvement written together chain two
    /// versions, the one that was eaten and the one to try next.
    struct Capture: Sendable {
        var rating: Int?
        /// What the cook already changed and already ate, in their own words.
        var change = ""
        /// What they would like improved next — the remark that asks for a version.
        var remarks = ""
        var tips = ""
        var photoBase64: String?
    }

    /// The photo, kept both decoded (for the thumbnail) and encoded (payload).
    private struct LoadedPhoto {
        let image: UIImage
        let base64: String
    }

    @State private var rating: Int?
    @State private var change: String = ""
    @State private var remarks: String = ""
    @State private var tips: String = ""
    @State private var photoItem: PhotosPickerItem?
    @State private var photo: LoadedPhoto?
    @State private var isLoadingPhoto = false
    @State private var showCamera = false

    var body: some View {
        Form {
            Section {
                StarRating(selection: $rating)
                    .listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 4, trailing: 0))
            }
            .listRowBackground(Color.clear)

            // What the cook did at the stove, as opposed to what they would like
            // done next: it is written down as a version that already exists.
            Section {
                TextField(
                    "Ex. : 10 g de sucre au lieu de 20, cuit 5 min de plus…",
                    text: $change,
                    axis: .vertical
                )
                .lineLimit(3...12)
                .frame(minHeight: 60, alignment: .top)
                .accessibilityIdentifier("change-field")
            } header: {
                Text("Changement")
            } footer: {
                Text("Ce que tu as changé en cuisinant : crée une nouvelle version, déjà faite.")
            }

            // Remarks and the photo share one block.
            Section {
                TextField("Ex. : trop amer, coule trop vite, manque de liant…", text: $remarks, axis: .vertical)
                    .lineLimit(5...20)
                    .frame(minHeight: 100, alignment: .top)
                    .accessibilityIdentifier("remarks-field")

                photoRow
            } header: {
                Text("Amélioration")
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
                    onSave(
                        Capture(
                            rating: rating,
                            change: trimmed(change),
                            remarks: trimmed(remarks),
                            tips: trimmed(tips),
                            photoBase64: photo?.base64
                        )
                    )
                } label: {
                    ActionIcon(systemImage: "checkmark", isRunning: isSaving)
                }
                .disabled(!hasSomethingToSay || isSaving)
                .accessibilityIdentifier("save-attempt-button")
                .accessibilityLabel("Valider")
            }
        }
        .onChange(of: photoItem) { _, item in
            guard let item else { return }
            photoItem = nil
            Task { await pickFromLibrary(item) }
        }
        .fullScreenCover(isPresented: $showCamera) {
            CameraShot(
                onCapture: { data in
                    showCamera = false
                    Task { await attach(data) }
                },
                onClose: { showCamera = false },
                showsFramingGuide: false
            )
        }
    }

    /// An empty form has nothing to send: a photo alone says nothing either, it
    /// illustrates a cook that has to be rated to exist.
    private var hasSomethingToSay: Bool {
        rating != nil || !trimmed(change).isEmpty || !trimmed(remarks).isEmpty
            || !trimmed(tips).isEmpty
    }

    private func trimmed(_ text: String) -> String {
        text.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    // MARK: - Photo

    /// One photo — the attempt keeps one — with two ways in: the library, or the
    /// camera right there, since the plate is in front of the cook when the form
    /// opens. Removing it puts both entries back.
    private var photoRow: some View {
        HStack(spacing: Theme.Spacing.m) {
            if let photo {
                thumbnail(photo)
            } else if isLoadingPhoto {
                PhotoSlot { ProgressView() }
            } else {
                PhotosPicker(selection: $photoItem, matching: .images) {
                    PhotoSlot {
                        Image(systemName: "photo.on.rectangle")
                            .font(.title3)
                            .foregroundStyle(Color.accentColor)
                    }
                }
                .accessibilityIdentifier("photo-picker")
                .accessibilityLabel("Choisir une photo")

                // Absent from the simulator, which has no camera to open.
                if CameraView.isAvailable {
                    Button { showCamera = true } label: {
                        PhotoSlot {
                            Image(systemName: "camera")
                                .font(.title3)
                                .foregroundStyle(Color.accentColor)
                        }
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("photo-camera")
                    .accessibilityLabel("Prendre une photo")
                }
            }
        }
        .padding(.vertical, Theme.Spacing.xs)
    }

    private func thumbnail(_ photo: LoadedPhoto) -> some View {
        Image(uiImage: photo.image)
            .resizable()
            .scaledToFill()
            .frame(width: 72, height: 72)
            .clipShape(.rect(cornerRadius: Theme.Radius.control))
            .overlay(alignment: .topTrailing) {
                Button { self.photo = nil } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.body)
                        .symbolRenderingMode(.palette)
                        .foregroundStyle(.white, .black.opacity(0.6))
                        .padding(3)
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("photo-remove")
                .accessibilityLabel("Retirer la photo")
            }
            .accessibilityIdentifier("attempt-photo")
    }

    private func pickFromLibrary(_ item: PhotosPickerItem) async {
        isLoadingPhoto = true
        defer { isLoadingPhoto = false }
        guard let data = try? await item.loadTransferable(type: Data.self) else { return }
        await attach(data)
    }

    /// Downscale and JPEG-encode off the main actor: the photo travels as base64
    /// inside the mutation, so the full-resolution shot never leaves the phone as is.
    /// A shot that fails to decode leaves the previous photo alone.
    private func attach(_ data: Data) async {
        isLoadingPhoto = true
        defer { isLoadingPhoto = false }
        let jpeg = await Task.detached(priority: .userInitiated) {
            UIImage(data: data).flatMap { $0.resized(maxDimension: 1200).jpegData(compressionQuality: 0.7) }
        }.value
        guard let jpeg, let image = UIImage(data: jpeg) else { return }
        photo = LoadedPhoto(image: image, base64: jpeg.base64EncodedString())
    }
}

/// The empty square a photo goes in — what fills it says which way in it is.
/// `nonisolated` because the photo picker builds its label outside the main actor —
/// the slot holds a view and touches nothing isolated.
private nonisolated struct PhotoSlot<Content: View>: View {
    @ViewBuilder let content: Content

    var body: some View {
        RoundedRectangle(cornerRadius: Theme.Radius.control)
            .fill(Color(.systemFill))
            .frame(width: 72, height: 72)
            .overlay(content)
    }
}

#Preview {
    NavigationStack {
        CapturePage(isSaving: false, onSave: { _ in })
    }
}
