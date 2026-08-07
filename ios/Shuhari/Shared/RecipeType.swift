import SwiftUI

/// The three culinary experiment domains, with their design tokens (icon +
/// label): a cooked dish, a Thermomix recipe or a brewed coffee. Cooking lives in
/// the notebook tab, coffee in its own.
enum RecipeType: String, CaseIterable, Sendable, Identifiable {
    case dish
    case thermomix
    case coffee

    var id: String { rawValue }

    /// The types the cooking notebook reads — everything but coffee, which has its
    /// own tab. The single place that split is spelled out.
    static let cooking: [RecipeType] = [.dish, .thermomix]

    var label: String {
        switch self {
        case .dish: "Plat"
        case .thermomix: "Thermomix"
        case .coffee: "Café"
        }
    }

    /// The type's icon, in its outline or filled form. Dishes (`frying.pan`) and
    /// coffee (`cup.and.saucer`) are Apple SF Symbols; Thermomix uses a custom
    /// symbol in the asset catalog — referenced by asset name, since
    /// `Image(systemName:)` only resolves Apple's SF Symbols. Custom symbols pick
    /// their variant by asset name because `.symbolVariant` only rewrites system
    /// symbol names. Custom symbols scale with the font and tint just like SF Symbols.
    func iconImage(filled: Bool) -> Image {
        switch self {
        case .dish: Image(systemName: filled ? "frying.pan.fill" : "frying.pan")
        case .thermomix: Image(filled ? "thermomix.fill" : "thermomix")
        case .coffee: Image(systemName: filled ? "cup.and.saucer.fill" : "cup.and.saucer")
        }
    }

    /// The type's canonical icon — the filled form, used where no selection state
    /// applies (chips, badges, rows).
    var iconImage: Image { iconImage(filled: true) }
}
