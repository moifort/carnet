import SwiftUI

/// How a coffee is brewed — an aggregate-level identity set once at import
/// (shared across every version), and the axis the coffee tab sorts on. What
/// `DishCategory` is to cooking: changing the method makes it another coffee, not
/// another version of this one. The case order IS the display order.
enum BrewMethod: String, CaseIterable, Sendable, Identifiable {
    case espresso
    case americano
    case flatWhite = "flat-white"
    case cappuccino
    case latte
    /// Stovetop pot — Bialetti.
    case moka
    case v60
    case chemex
    /// Filter machine — Moccamaster, cafetière filtre.
    case drip
    case aeropress
    case frenchPress = "french-press"
    case coldBrew = "cold-brew"
    /// Where a coffee lands when none of the above fits — never a default.
    case other

    var id: String { rawValue }

    var label: String {
        switch self {
        case .espresso: "Espresso"
        case .americano: "Americano"
        case .flatWhite: "Flat white"
        case .cappuccino: "Cappuccino"
        case .latte: "Latte"
        case .moka: "Bialetti"
        case .v60: "V60"
        case .chemex: "Chemex"
        case .drip: "Filtre"
        case .aeropress: "AeroPress"
        case .frenchPress: "French press"
        case .coldBrew: "Cold brew"
        case .other: "Autre"
        }
    }

    /// An SF Symbol standing in for the method — used on badges and the method
    /// picker — outline forms throughout, matching the unfilled `RecipeType` icon
    /// every screen pairs these with. SF Symbols ships no V60 and no moka pot, so
    /// the family is carried by what each method *does*: a machine drink is a cup,
    /// milk drinks wear the steam, pour-overs and immersion the drop and the timer.
    var iconName: String {
        switch self {
        case .espresso: "cup.and.saucer"
        case .americano: "mug"
        case .flatWhite, .cappuccino, .latte: "cup.and.heat.waves"
        case .moka: "flame"
        case .v60, .chemex, .drip: "drop"
        case .aeropress: "arrow.down.circle"
        case .frenchPress: "arrow.down.to.line"
        case .coldBrew: "snowflake"
        case .other: "questionmark.circle"
        }
    }

    var iconImage: Image { Image(systemName: iconName) }
}
