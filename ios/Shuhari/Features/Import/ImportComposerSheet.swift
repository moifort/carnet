import PhotosUI
import SwiftUI

/// Recipe import, presented as a sheet from the "Importer" tab: the composer,
/// where a text and up to `maxPhotos` photos are assembled into ONE import (a
/// pasted link alone is still routed to the AI web search). Photos come from the
/// library or from the camera, which opens one shot at a time from inside the
/// composer. Analysing hands the `ImportInput` back via `onPick`; the parent then
/// closes this sheet and presents the review sheet. Reopened with a `draft` (the
/// analysis was closed rather than validated), it holds what was sent.
struct ImportComposerSheet: View {
    /// Which world is being imported — the tab decided it, and it only changes the
    /// words the composer uses.
    let flow: ImportFlow
    let onPick: (ImportInput) -> Void

    /// The server refuses more than this in one import (`MAX_IMPORT_PHOTOS`).
    private static let maxPhotos = 6

    @Environment(\.dismiss) private var dismiss
    @State private var rawText = ""

    // The attached photos, plus the two ways of adding one.
    @State private var attached: [AttachedPhoto] = []
    @State private var picks: [PhotosPickerItem] = []
    @State private var showLibrary = false
    @State private var showCamera = false
    @State private var isLoadingPhoto = false

    /// An attached photo: its raw data for the upload, its image for the thumbnail.
    private struct AttachedPhoto: Identifiable {
        let id = UUID()
        let data: Data
        let image: UIImage

        init?(data: Data) {
            guard let image = UIImage(data: data) else { return nil }
            self.data = data
            self.image = image
        }
    }

    /// A `draft` — what a closed analysis handed back — reopens the composer
    /// holding the text and the photos that were sent. It is seeded here rather
    /// than put back on appear: a sheet filled from `onAppear` renders the state as
    /// it was before, and the photos would be missing.
    init(
        flow: ImportFlow = .cooking,
        draft: ImportDraft? = nil,
        onPick: @escaping (ImportInput) -> Void
    ) {
        self.flow = flow
        self.onPick = onPick
        let photos = (draft?.photos ?? []).prefix(Self.maxPhotos)
        _rawText = State(initialValue: draft?.text ?? "")
        _attached = State(initialValue: photos.compactMap(AttachedPhoto.init))
    }

    var body: some View {
        ImportComposer(
            text: $rawText,
            flow: flow,
            photos: attached.map { .init(id: $0.id, image: $0.image) },
            remainingSlots: Self.maxPhotos - attached.count,
            isLoadingPhoto: isLoadingPhoto,
            onAddFromLibrary: { showLibrary = true },
            onAddFromCamera: { showCamera = true },
            onRemove: { id in attached.removeAll { $0.id == id } },
            onCancel: { dismiss() },
            onAnalyze: submit
        )
        // Multi-selection, capped at what the import still has room for.
        .photosPicker(
            isPresented: $showLibrary,
            selection: $picks,
            maxSelectionCount: max(1, Self.maxPhotos - attached.count),
            matching: .images
        )
        .onChange(of: picks) { _, items in
            guard !items.isEmpty else { return }
            picks = []
            Task { await attach(items) }
        }
        .fullScreenCover(isPresented: $showCamera) {
            camera
        }
    }

    /// The camera opened from inside the composer: one shot appends a photo and
    /// comes straight back, so several pages can be captured in a row.
    private var camera: some View {
        CameraShot(
            onCapture: { data in
                append(data)
                showCamera = false
            },
            onClose: { showCamera = false }
        )
    }

    /// Load the picked library items into attachments, decoding off the main actor.
    private func attach(_ items: [PhotosPickerItem]) async {
        isLoadingPhoto = true
        defer { isLoadingPhoto = false }
        for item in items {
            guard attached.count < Self.maxPhotos,
                  let data = try? await item.loadTransferable(type: Data.self)
            else { continue }
            append(data)
        }
    }

    private func append(_ data: Data) {
        guard attached.count < Self.maxPhotos, let photo = AttachedPhoto(data: data) else { return }
        attached.append(photo)
    }

    /// What the composer holds becomes one import: the photos with their text when
    /// there are any, otherwise the text alone — a lone link still going to the web
    /// search.
    private func submit() {
        let trimmed = rawText.trimmingCharacters(in: .whitespacesAndNewlines)
        if attached.isEmpty {
            guard !trimmed.isEmpty else { return }
            onPick(.source(isLink(trimmed) ? .url(trimmed) : .text(trimmed)))
        } else {
            onPick(.composed(photos: attached.map(\.data), text: trimmed))
        }
    }

    private func isLink(_ text: String) -> Bool {
        guard !text.contains(where: \.isWhitespace),
              let url = URL(string: text),
              let scheme = url.scheme?.lowercased(),
              scheme == "http" || scheme == "https",
              url.host?.isEmpty == false
        else { return false }
        return true
    }
}

#Preview {
    ImportComposerSheet { _ in }
}
