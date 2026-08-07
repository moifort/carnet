import SwiftUI

/// Design tokens — the single source of truth for status colours, corner radii
/// and spacing. Semantic names carry the business state, so one state is never
/// two different colours across screens.
enum Theme {
    enum Status {
        /// The attempt domain accent — the version in progress, AI proposals and
        /// the modifications they carry.
        static let attempt = Color.orange
        /// A value that differs from the reference (diffs, deviations, highlights) —
        /// shares the attempt accent, since a modification is what an attempt is about.
        static let changed = Self.attempt
        /// Thermomix machine settings.
        static let thermomix = Color.teal
        /// Coffee extraction settings — the machine-settings badge in the coffee
        /// tab, kept apart from the Thermomix teal so the two never read alike.
        static let coffee = Color.brown
        /// A recipe kept as a favourite — the heart, wherever it appears.
        static let favorite = Color.red

        /// Attempt rating thresholds: ≥ 4 high, 3 medium, ≤ 2 low.
        static func rating(_ rating: Int) -> Color {
            if rating >= 4 { .green } else if rating == 3 { .orange } else { .red }
        }
    }

    enum Radius {
        static let control: CGFloat = 8
        static let card: CGFloat = 20
        static let overlay: CGFloat = 24
    }

    enum Spacing {
        static let xs: CGFloat = 4
        static let s: CGFloat = 8
        static let m: CGFloat = 12
        static let l: CGFloat = 16
        static let xl: CGFloat = 20
    }
}
