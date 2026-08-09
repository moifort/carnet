import SwiftUI

/// An oven heating function — what the dial selects. Model-independent: the
/// connected oven's own codes are mapped server-side, so a recipe survives a change
/// of oven. The case order IS the display order in the picker, commonest first.
enum OvenProgram: String, CaseIterable, Sendable, Identifiable {
    /// Top and bottom heat, no fan — what a recipe book means by "four à 180°C".
    case conventional
    /// Fan-assisted hot air.
    case convection
    case convectionHumid = "convection-humid"
    case topHeat = "top-heat"
    case bottomHeat = "bottom-heat"
    case grill
    /// Grill plus fan.
    case turboGrill = "turbo-grill"
    /// Bottom-biased heat, for a crisp base.
    case pizza
    case steam
    /// Steam plus hot air.
    case steamCombi = "steam-combi"
    case defrost

    var id: String { rawValue }

    var label: String {
        switch self {
        case .conventional: "Sole et voûte"
        case .convection: "Chaleur tournante"
        case .convectionHumid: "Chaleur tournante humide"
        case .topHeat: "Voûte"
        case .bottomHeat: "Sole"
        case .grill: "Gril"
        case .turboGrill: "Turbo gril"
        case .pizza: "Pizza"
        case .steam: "Vapeur"
        case .steamCombi: "Vapeur combinée"
        case .defrost: "Décongélation"
        }
    }

    /// An SF Symbol standing in for the function. The family is carried by what each
    /// one *does*: radiant heat wears the waves, anything fan-driven the fan, steam
    /// the drop, and defrost the snowflake — SF Symbols ships no oven dial.
    var iconName: String {
        switch self {
        case .conventional: "thermometer.medium"
        case .convection, .convectionHumid: "fan"
        case .topHeat: "arrow.down.to.line"
        case .bottomHeat: "arrow.up.to.line"
        case .grill: "flame"
        case .turboGrill: "flame.circle"
        case .pizza: "circle.grid.cross"
        case .steam, .steamCombi: "humidity"
        case .defrost: "snowflake"
        }
    }

    var iconImage: Image { Image(systemName: iconName) }
}
