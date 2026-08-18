import SwiftUI

/// What the cook hands the AI: the recipe text, the photos, or both together —
/// the two pages of a book plus "pour 4, au Chemex" to say what the page leaves
/// out. Primitive-first: it holds photo previews and a text binding, and reports
/// what the user wants to add through its closures; loading the library items,
/// running the camera and calling the API all belong to `ImportComposerSheet`.
struct ImportComposer: View {
    /// One attached photo, ready to show. `id` survives reordering and deletion.
    struct Photo: Identifiable, Equatable {
        let id: UUID
        let image: UIImage
    }

    @Binding var text: String
    /// Which world is being imported — it changes nothing but the words: a coffee
    /// is a bag and a machine screen, a recipe is a book page.
    var flow: ImportFlow = .cooking
    let photos: [Photo]
    /// How many more photos may be attached — the row hides its add buttons at 0.
    let remainingSlots: Int
    let isLoadingPhoto: Bool
    let onAddFromLibrary: () -> Void
    let onAddFromCamera: () -> Void
    let onRemove: (UUID) -> Void
    let onCancel: () -> Void
    let onAnalyze: () -> Void

    private var placeholder: String {
        flow == .coffee
            ? "18 g, mouture fine, 93°C… ou colle un lien"
            : "200 g de spaghetti, 100 g de pecorino… ou colle un lien"
    }

    /// Nothing to analyse: no photo, and nothing but whitespace typed.
    private var isEmpty: Bool {
        photos.isEmpty && text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField(placeholder, text: $text, axis: .vertical)
                    .lineLimit(4...10)
                    .accessibilityIdentifier("import-text-field")
                } footer: {
                    Text(textFooter)
                }

                Section {
                    photoRow
                } header: {
                    Text("Photos")
                } footer: {
                    Text(photoFooter)
                }
            }
            .navigationTitle(flow == .coffee ? "Saisir le café" : "Saisir la recette")
            .navigationBarTitleDisplayMode(.inline)
            .scrollDismissesKeyboard(.interactively)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(action: onCancel) {
                        Image(systemName: "xmark")
                    }
                    .accessibilityIdentifier("import-close-button")
                    .accessibilityLabel("Annuler")
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(action: onAnalyze) {
                        Image(systemName: "sparkles")
                    }
                    .disabled(isEmpty)
                    .accessibilityIdentifier("analyze-button")
                    .accessibilityLabel("Analyser")
                }
            }
        }
    }

    // MARK: - Copy

    private var textFooter: String {
        photos.isEmpty
            ? (flow == .coffee
                ? "Colle ou dicte tes réglages. Un lien vers une page web est aussi accepté."
                : "Colle ou dicte ta recette. Un lien vers une page web est aussi accepté.")
            : "Ce texte complète les photos : ce qu’elles ne montrent pas, ou ce qu’elles disent de travers."
    }

    private var photoFooter: String {
        if remainingSlots == 0 { return "Maximum atteint." }
        return photos.isEmpty
            ? (flow == .coffee
                ? "Photographie ton paquet ou l’écran de la machine — jusqu’à \(remainingSlots)."
                : "Ajoute les pages d’un livre ou une capture d’écran — jusqu’à \(remainingSlots).")
            : "Encore \(remainingSlots) possible\(remainingSlots > 1 ? "s" : "")."
    }

    // MARK: - Photos

    private var photoRow: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: Theme.Spacing.m) {
                ForEach(photos) { photo in
                    thumbnail(photo)
                }
                if isLoadingPhoto {
                    placeholder { ProgressView() }
                }
                if remainingSlots > 0 {
                    addButton(
                        systemImage: "photo.on.rectangle",
                        label: "Choisir dans la bibliothèque",
                        identifier: "composer-add-library",
                        action: onAddFromLibrary
                    )
                    if CameraView.isAvailable {
                        addButton(
                            systemImage: "camera",
                            label: "Prendre une photo",
                            identifier: "composer-add-camera",
                            action: onAddFromCamera
                        )
                    }
                }
            }
            .padding(.vertical, Theme.Spacing.xs)
        }
    }

    private func thumbnail(_ photo: Photo) -> some View {
        Image(uiImage: photo.image)
            .resizable()
            .scaledToFill()
            .frame(width: 72, height: 72)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.control))
            .overlay(alignment: .topTrailing) {
                Button { onRemove(photo.id) } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.body)
                        .symbolRenderingMode(.palette)
                        .foregroundStyle(.white, .black.opacity(0.6))
                        .padding(3)
                }
                .accessibilityLabel("Retirer la photo")
            }
            .accessibilityIdentifier("composer-photo")
    }

    private func addButton(
        systemImage: String,
        label: String,
        identifier: String,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            placeholder {
                Image(systemName: systemImage)
                    .font(.title3)
                    .foregroundStyle(.secondary)
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        .accessibilityIdentifier(identifier)
    }

    private func placeholder<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        RoundedRectangle(cornerRadius: Theme.Radius.control)
            .fill(.quaternary.opacity(0.5))
            .frame(width: 72, height: 72)
            .overlay(content())
    }
}

#if DEBUG
private struct ImportComposerPreview: View {
    @State private var text: String
    @State private var photos: [ImportComposer.Photo]

    init(text: String = "", photoCount: Int = 0) {
        self._text = State(initialValue: text)
        self._photos = State(initialValue: (0..<photoCount).map { index in
            ImportComposer.Photo(id: UUID(), image: Self.swatch(index))
        })
    }

    /// A flat colour standing in for a photo — previews run offline.
    private static func swatch(_ index: Int) -> UIImage {
        let colors: [UIColor] = [.systemBrown, .systemTeal, .systemIndigo]
        return UIGraphicsImageRenderer(size: CGSize(width: 144, height: 144)).image { context in
            colors[index % colors.count].setFill()
            context.fill(CGRect(x: 0, y: 0, width: 144, height: 144))
        }
    }

    var body: some View {
        ImportComposer(
            text: $text,
            photos: photos,
            remainingSlots: 6 - photos.count,
            isLoadingPhoto: false,
            onAddFromLibrary: {},
            onAddFromCamera: {},
            onRemove: { id in photos.removeAll { $0.id == id } },
            onCancel: {},
            onAnalyze: {}
        )
    }
}

#Preview("Vide") {
    ImportComposerPreview()
}

#Preview("Deux pages + note") {
    ImportComposerPreview(text: "Pour 4 personnes, au Chemex.", photoCount: 2)
}
#endif
