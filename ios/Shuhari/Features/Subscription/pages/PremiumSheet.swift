import StoreKit
import SwiftUI

/// The subscription sheet: what Premium buys, what it costs, and the buying of
/// it. Prices come from the App Store — never hard-coded, they differ by
/// storefront and Apple raises them without asking us.
struct PremiumSheet: View {
    /// One offer as the sheet shows it: everything already in words, nothing of
    /// StoreKit left. The page maps `Product` down to this, which is what lets the
    /// gallery render the real screen with no App Store behind it.
    struct Offer: Identifiable, Equatable {
        let id: String
        let title: String
        let price: String
        let detail: String
        let badge: String?
        /// Drives the CTA wording: an offer opening on a free trial does not say
        /// "S'abonner".
        let isTrial: Bool
    }

    /// Optional so the sheet stays previewable offline: without a store it shows
    /// the offer it cannot sell, which is also what a network failure looks like.
    var store: SubscriptionStore? = nil

    @Environment(\.dismiss) private var dismiss
    /// The spec pushes the yearly price forward, so it is the pre-selected offer.
    @State private var selectedProductId = SubscriptionProducts.yearly
    /// Frozen offers: the gallery renders the sheet exactly as shipped, without
    /// StoreKit — the only way to capture it outside Xcode.
    private let frozenOffers: [Offer]?

    init(store: SubscriptionStore? = nil) {
        self.store = store
        frozenOffers = nil
    }

    #if DEBUG
    /// Gallery entry: fixed offers, inert purchase.
    init(galleryOffers: [Offer]) {
        store = nil
        frozenOffers = galleryOffers
    }
    #endif

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: Theme.Spacing.xl) {
                    header
                    benefits
                    offers
                }
                .padding(.horizontal, Theme.Spacing.xl)
                .padding(.top, Theme.Spacing.m)
            }
            .safeAreaInset(edge: .bottom) { subscribeBar }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: {
                        Image(systemName: "xmark")
                    }
                    .accessibilityLabel("Fermer")
                }
            }
        }
        // Full height only: at .medium the offers sit below the fold, and a
        // subscription sheet that hides its prices is not one.
        .presentationDetents([.large])
        .task { if frozenOffers == nil { await store?.refresh() } }
        .onChange(of: store?.isPremium) { _, isPremium in
            // The moment the server confirms Premium, the sheet has done its job.
            if isPremium == true { dismiss() }
        }
        .alert(
            "Une erreur est survenue",
            isPresented: Binding(
                get: { store?.errorMessage != nil },
                set: { if !$0 { store?.errorMessage = nil } }
            )
        ) {
            Button("OK") { store?.errorMessage = nil }
        } message: {
            Text(store?.errorMessage ?? "")
        }
    }

    // MARK: - Header

    private var header: some View {
        VStack(spacing: Theme.Spacing.s) {
            Image(systemName: "sparkles")
                .font(.system(size: 44))
                .foregroundStyle(premiumGradient)
                .accessibilityHidden(true)
            Text("Shuhari Premium")
                .font(.title2.bold())
            Text("L’IA en cuisine, sans compter.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - Benefits

    private var benefits: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            BenefitRow(
                icon: "square.and.arrow.down",
                title: "Imports IA illimités",
                detail: "Photos, texte — autant de recettes que tu veux."
            )
            BenefitRow(
                icon: "sparkles",
                title: "Itérations IA illimitées",
                detail: "Propositions, améliorations et astuces sans quota."
            )
            BenefitRow(
                icon: "link",
                title: "Import par lien web",
                detail: "Colle l’adresse d’une recette, l’IA lit la page."
            )
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - Offers

    @ViewBuilder
    private var offers: some View {
        if frozenOffers == nil && store?.isLoading == true {
            ProgressView()
                .frame(maxWidth: .infinity)
                .padding(.vertical, Theme.Spacing.xl)
        } else if offerList.isEmpty {
            // Loaded and still nothing: no network, or the products are not
            // available on this store. Say so rather than spin forever.
            VStack(spacing: Theme.Spacing.s) {
                Text("Les offres ne sont pas disponibles pour le moment.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                Button("Réessayer") { Task { await store?.refresh() } }
                    .font(.subheadline)
                    .disabled(store == nil)
            }
            .padding(.vertical, Theme.Spacing.l)
        } else {
            VStack(spacing: Theme.Spacing.s) {
                ForEach(offerList) { offer in
                    OfferCard(
                        title: offer.title,
                        price: offer.price,
                        detail: offer.detail,
                        badge: offer.badge,
                        isSelected: selectedProductId == offer.id
                    ) { selectedProductId = offer.id }
                }
            }
        }
    }

    private var subscribeBar: some View {
        VStack(spacing: Theme.Spacing.s) {
            Button {
                guard let store, let product = selectedProduct else { return }
                Task { await store.purchase(product) }
            } label: {
                // A CTA that hits the network shows it, right where it was tapped.
                if store?.isPurchasing == true {
                    ProgressView().tint(.white)
                } else {
                    Text(subscribeLabel)
                }
            }
            .buttonStyle(.glassProminent)
            .controlSize(.large)
            .frame(maxWidth: .infinity)
            // Bound to the offers on screen, not to StoreKit: the gallery shows the
            // sheet as a cook sees it, CTA included.
            .disabled(offerList.isEmpty || store?.isPurchasing == true)
            .accessibilityIdentifier("subscribe-button")

            Button("Restaurer mes achats") {
                guard let store else { return }
                Task { await store.restore() }
            }
            .font(.footnote)
            .disabled(store == nil || store?.isPurchasing == true)

            Text("Sans engagement, résiliable à tout moment depuis les réglages de l’iPhone.")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)

            // Guideline 3.1.2 wants both documents reachable from the purchase
            // itself, not only from the store listing. Below the CTA, where a cook
            // looks for the small print, and quiet enough not to compete with it.
            HStack(spacing: Theme.Spacing.m) {
                Link("Conditions d’utilisation", destination: SubscriptionLinks.terms)
                Link("Confidentialité", destination: SubscriptionLinks.privacy)
            }
            .font(.caption2)
        }
        .padding(.horizontal, Theme.Spacing.xl)
        .padding(.vertical, Theme.Spacing.m)
        .background(.bar)
    }

    /// What the sheet shows: the frozen offers when the gallery froze them, the
    /// App Store's own otherwise. Declared order — yearly first, the offer we put
    /// forward.
    private var offerList: [Offer] {
        if let frozenOffers { return frozenOffers }
        return SubscriptionProducts.all.compactMap { id in
            store?.products.first { $0.id == id }.map(offer)
        }
    }

    private var products: [Product] {
        SubscriptionProducts.all.compactMap { id in store?.products.first { $0.id == id } }
    }

    private var selectedProduct: Product? {
        products.first { $0.id == selectedProductId }
    }

    /// The subscribe label says what actually happens: a free trial when the
    /// selected offer carries one, a payment otherwise.
    private var subscribeLabel: String {
        offerList.first { $0.id == selectedProductId }?.isTrial == true
            ? "Essayer gratuitement"
            : "S’abonner"
    }

    /// StoreKit → words. The only place the sheet knows what a `Product` is.
    private func offer(_ product: Product) -> Offer {
        let trial = product.subscription?.introductoryOffer
        let isTrial = trial?.paymentMode == .freeTrial
        return Offer(
            id: product.id,
            title: product.displayName,
            price: product.displayPrice,
            detail: isTrial && trial != nil
                ? "\(trial!.period.value) \(trial!.period.unit.frenchName(trial!.period.value)) d’essai gratuit, puis renouvellement automatique"
                : "sans engagement",
            badge: product.id == SubscriptionProducts.yearly ? "Économisez 30 %" : nil,
            isTrial: isTrial
        )
    }
}

private extension Product.SubscriptionPeriod.Unit {
    /// The unit spelled for a count — "1 semaine", "7 jours". Written as
    /// "N <unité> d'essai gratuit" precisely to dodge the gender agreement a
    /// "offert / offerte" wording would force on us.
    func frenchName(_ count: Int) -> String {
        let plural = count > 1
        switch self {
        case .day: return plural ? "jours" : "jour"
        case .week: return plural ? "semaines" : "semaine"
        case .month: return "mois"
        case .year: return plural ? "ans" : "an"
        @unknown default: return plural ? "jours" : "jour"
        }
    }
}

/// The gradient the Premium identity wears — the AI sparkle warmed up, shared by
/// the header icon and any Premium accent.
private let premiumGradient = LinearGradient(
    colors: [.orange, .pink, .purple],
    startPoint: .topLeading,
    endPoint: .bottomTrailing
)

/// One thing Premium buys: icon, name, one line of detail.
private struct BenefitRow: View {
    let icon: String
    let title: String
    let detail: String

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.m) {
            Image(systemName: icon)
                .font(.body.weight(.medium))
                .foregroundStyle(Color.accentColor)
                .frame(width: 28)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.subheadline.weight(.semibold))
                Text(detail)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

/// One selectable price. A card, not a list row: the selected offer wears the
/// accent border, the other stays quiet.
private struct OfferCard: View {
    let title: String
    let price: String
    let detail: String
    let badge: String?
    let isSelected: Bool
    let onSelect: () -> Void

    var body: some View {
        Button(action: onSelect) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: Theme.Spacing.s) {
                        Text(title)
                            .font(.subheadline.weight(.semibold))
                        if let badge {
                            Text(badge)
                                .font(.caption2.weight(.semibold))
                                .foregroundStyle(.white)
                                .padding(.horizontal, 7)
                                .padding(.vertical, 2)
                                .background(Color.accentColor, in: Capsule())
                        }
                    }
                    Text(detail)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Text(price)
                    .font(.subheadline.weight(.medium))
                    .monospacedDigit()
            }
            .padding(Theme.Spacing.l)
            .background(
                RoundedRectangle(cornerRadius: Theme.Radius.card)
                    .fill(Color(.secondarySystemGroupedBackground))
            )
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.card)
                    .strokeBorder(
                        isSelected ? Color.accentColor : Color(.separator),
                        lineWidth: isSelected ? 2 : 1
                    )
            )
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }
}

#Preview {
    // No store: the offline shape of the sheet — copy and layout, offers loading.
    Color.clear
        .sheet(isPresented: .constant(true)) {
            PremiumSheet()
        }
}
