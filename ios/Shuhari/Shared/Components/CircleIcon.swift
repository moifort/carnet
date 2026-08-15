import SwiftUI

/// A white SF Symbol on a clear interactive glass circle — the iOS 26 idiom for
/// controls floating over a live media feed.
struct CircleIcon: View {
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
    ZStack {
        Color.gray
        HStack(spacing: 16) {
            CircleIcon(systemImage: "xmark", size: 44)
            CircleIcon(systemImage: "photo", size: 56)
        }
    }
}
