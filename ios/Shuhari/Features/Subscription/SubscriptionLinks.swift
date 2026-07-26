import Foundation

/// The two documents guideline 3.1.2 requires next to an auto-renewable
/// subscription: the terms of use and the privacy policy. They are demanded in the
/// store listing (`fastlane/metadata/fr-FR/description.txt`) *and* inside the
/// purchase flow, so the paywall links them too — a submission missing either is
/// refused, which is exactly what happened to 1.0.
///
/// The terms are Apple's standard EULA: nothing in Shuhari departs from it, and a
/// hand-written one would be another page to keep true. The privacy policy is our
/// own, served by GitHub Pages from `docs/pages/`, and must keep agreeing with the
/// App Store Connect privacy questionnaire.
enum SubscriptionLinks {
    static let terms = URL(string: "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/")!
    static let privacy = URL(string: "https://moifort.github.io/shuhari/privacy.html")!
}
