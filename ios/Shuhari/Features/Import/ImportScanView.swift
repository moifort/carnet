import PhotosUI
import SwiftUI

/// Camera-first recipe import, presented full-screen from the "Importer" tab.
/// Opens straight on the live camera, where a single shot (or one picked photo)
/// analyses immediately — the quick path. The third button opens the composer,
/// where several photos and a text are assembled into ONE import (a pasted link
/// alone is still routed to the AI web search). Capture / pick / compose hand the
/// chosen `ImportInput` back via `onPick` and dismiss the camera — the parent then
/// closes this cover and presents the review sheet, so the camera never lingers
/// behind it.
struct ImportScanView: View {
    let onPick: (ImportInput) -> Void

    /// The server refuses more than this in one import (`MAX_IMPORT_PHOTOS`).
    private static let maxPhotos = 6

    @Environment(\.dismiss) private var dismiss
    @State private var selectedPhoto: PhotosPickerItem?
    @State private var shouldCapture = false
    @State private var showComposer = false
    @State private var rawText = ""
    @State private var pendingInput: ImportInput?

    // Composer state: the attached photos, plus the two ways of adding one.
    @State private var attached: [AttachedPhoto] = []
    @State private var composerPicks: [PhotosPickerItem] = []
    @State private var showComposerLibrary = false
    @State private var showComposerCamera = false
    @State private var composerShouldCapture = false
    @State private var isLoadingPhoto = false

    /// An attached photo: its raw data for the upload, its image for the thumbnail.
    private struct AttachedPhoto: Identifiable {
        let id = UUID()
        let data: Data
        let image: UIImage
    }

    var body: some View {
        cameraScreen
            .onChange(of: selectedPhoto) { _, item in
                guard let item else { return }
                selectedPhoto = nil
                onPick(.library(item))
            }
            .sheet(isPresented: $showComposer, onDismiss: startPendingInput) {
                composerSheet
                    .presentationDetents([.medium, .large])
            }
    }

    // MARK: - Camera screen

    private var cameraScreen: some View {
        let cameraAvailable = CameraView.isAvailable
        return ZStack {
            if cameraAvailable {
                CameraView(onCapture: { data in capture(data) }, shouldCapture: $shouldCapture)
                    .ignoresSafeArea()
                ViewfinderOverlay()
            } else {
                Color.black.ignoresSafeArea()
                VStack(spacing: 8) {
                    Image(systemName: "camera.badge.ellipsis").font(.largeTitle)
                    Text("Caméra indisponible").font(.headline)
                    Text("Choisis une image ou saisis la recette.")
                        .font(.subheadline)
                        .multilineTextAlignment(.center)
                }
                .foregroundStyle(.white.opacity(0.85))
                .padding()
            }

            VStack {
                HStack {
                    Button { dismiss() } label: {
                        CircleIcon(systemImage: "xmark", size: 44)
                    }
                    .accessibilityIdentifier("scan-close-button")
                    .accessibilityLabel("Fermer")
                    Spacer()
                }
                .padding()
                Spacer()
            }

            VStack {
                Spacer()
                GlassEffectContainer {
                    HStack {
                        PhotosPicker(selection: $selectedPhoto, matching: .images) {
                            CircleIcon(systemImage: "photo", size: 56)
                        }
                        .accessibilityIdentifier("import-library-picker")
                        .accessibilityLabel("Choisir dans la bibliothèque")

                        Spacer()

                        if cameraAvailable {
                            Button { shouldCapture = true } label: {
                                Circle()
                                    .stroke(.white, lineWidth: 4)
                                    .frame(width: 72, height: 72)
                                    .overlay(Circle().fill(.white).frame(width: 60, height: 60))
                            }
                            .accessibilityIdentifier("import-camera-shutter")
                            .accessibilityLabel("Prendre une photo")
                        } else {
                            Color.clear.frame(width: 72, height: 72)
                        }

                        Spacer()

                        Button { showComposer = true } label: {
                            CircleIcon(systemImage: "text.cursor", size: 56)
                        }
                        .accessibilityIdentifier("import-text-button")
                        .accessibilityLabel("Saisir la recette")
                    }
                }
                .padding(.horizontal, 32)
                .padding(.bottom, 32)
            }
        }
    }

    // MARK: - Composer

    private var composerSheet: some View {
        ImportComposer(
            text: $rawText,
            photos: attached.map { .init(id: $0.id, image: $0.image) },
            remainingSlots: Self.maxPhotos - attached.count,
            isLoadingPhoto: isLoadingPhoto,
            onAddFromLibrary: { showComposerLibrary = true },
            onAddFromCamera: { showComposerCamera = true },
            onRemove: { id in attached.removeAll { $0.id == id } },
            onCancel: {
                pendingInput = nil
                showComposer = false
            },
            onAnalyze: submitComposer
        )
        // Multi-selection, capped at what the import still has room for.
        .photosPicker(
            isPresented: $showComposerLibrary,
            selection: $composerPicks,
            maxSelectionCount: max(1, Self.maxPhotos - attached.count),
            matching: .images
        )
        .onChange(of: composerPicks) { _, picks in
            guard !picks.isEmpty else { return }
            composerPicks = []
            Task { await attach(picks) }
        }
        .fullScreenCover(isPresented: $showComposerCamera) {
            composerCamera
        }
    }

    /// The camera reopened from inside the composer: one shot appends a photo and
    /// comes straight back, so several pages can be captured in a row.
    private var composerCamera: some View {
        ZStack {
            CameraView(
                onCapture: { data in
                    append(data)
                    showComposerCamera = false
                },
                shouldCapture: $composerShouldCapture
            )
            .ignoresSafeArea()
            ViewfinderOverlay()

            VStack {
                HStack {
                    Button { showComposerCamera = false } label: {
                        CircleIcon(systemImage: "xmark", size: 44)
                    }
                    .accessibilityLabel("Fermer")
                    Spacer()
                }
                .padding()
                Spacer()
                Button { composerShouldCapture = true } label: {
                    Circle()
                        .stroke(.white, lineWidth: 4)
                        .frame(width: 72, height: 72)
                        .overlay(Circle().fill(.white).frame(width: 60, height: 60))
                }
                .accessibilityIdentifier("composer-shutter")
                .accessibilityLabel("Prendre une photo")
                .padding(.bottom, 32)
            }
        }
    }

    /// Load the picked library items into attachments, decoding off the main actor.
    private func attach(_ picks: [PhotosPickerItem]) async {
        isLoadingPhoto = true
        defer { isLoadingPhoto = false }
        for pick in picks {
            guard attached.count < Self.maxPhotos,
                  let data = try? await pick.loadTransferable(type: Data.self)
            else { continue }
            append(data)
        }
    }

    private func append(_ data: Data) {
        guard attached.count < Self.maxPhotos, let image = UIImage(data: data) else { return }
        attached.append(AttachedPhoto(data: data, image: image))
    }

    /// Handed off from the composer's `onDismiss`: waiting for it to fully dismiss
    /// before closing the camera avoids a presentation conflict.
    private func startPendingInput() {
        guard let input = pendingInput else { return }
        pendingInput = nil
        onPick(input)
    }

    /// What the composer holds becomes one import: the photos with their text when
    /// there are any, otherwise the text alone — a lone link still going to the web
    /// search.
    private func submitComposer() {
        let trimmed = rawText.trimmingCharacters(in: .whitespacesAndNewlines)
        if attached.isEmpty {
            guard !trimmed.isEmpty else { return }
            pendingInput = .source(isLink(trimmed) ? .url(trimmed) : .text(trimmed))
        } else {
            pendingInput = .composed(photos: attached.map(\.data), text: trimmed)
        }
        showComposer = false
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

    // MARK: - Capture

    private func capture(_ data: Data) {
        onPick(.capture(data))
    }
}

/// A white SF Symbol on a clear interactive glass circle — the iOS 26 idiom for
/// controls floating over a live media feed.
private struct CircleIcon: View {
    let systemImage: String
    let size: CGFloat

    var body: some View {
        Image(systemName: systemImage)
            .font(.title2)
            .foregroundStyle(.white)
            .frame(width: size, height: size)
            .glassEffect(.clear.interactive(), in: .circle)
    }
}

#Preview {
    ImportScanView { _ in }
}
