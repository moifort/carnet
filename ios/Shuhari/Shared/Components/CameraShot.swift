import SwiftUI

/// The camera opened to take exactly one photo: the live preview, a shutter, and a
/// way out. Presented as a `.fullScreenCover` over whatever asked for the shot; the
/// raw JPEG `Data` comes back through `onCapture` and the caller closes the cover.
///
/// The framing guide is for what has to be lined up — a book page, a bag of beans.
/// A plate is just photographed, so the caller turns it off.
struct CameraShot: View {
    let onCapture: @MainActor (Data) -> Void
    let onClose: () -> Void
    var showsFramingGuide: Bool = true

    @State private var shouldCapture = false

    var body: some View {
        ZStack {
            CameraView(onCapture: onCapture, shouldCapture: $shouldCapture)
                .ignoresSafeArea()
            if showsFramingGuide {
                ViewfinderOverlay()
            }

            VStack {
                HStack {
                    Button(action: onClose) {
                        CircleIcon(systemImage: "xmark", size: 44)
                    }
                    .accessibilityIdentifier("camera-close-button")
                    .accessibilityLabel("Fermer")
                    Spacer()
                }
                .padding()
                Spacer()
                Button { shouldCapture = true } label: {
                    Circle()
                        .stroke(.white, lineWidth: 4)
                        .frame(width: 72, height: 72)
                        .overlay(Circle().fill(.white).frame(width: 60, height: 60))
                }
                .accessibilityIdentifier("camera-shutter")
                .accessibilityLabel("Prendre une photo")
                .padding(.bottom, 32)
            }
        }
    }
}

#Preview {
    CameraShot(onCapture: { _ in }, onClose: {})
}
