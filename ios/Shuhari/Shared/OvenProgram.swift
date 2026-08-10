import SwiftUI

/// An oven heating function — what the dial selects. Model-independent: the
/// connected oven's own codes are mapped server-side, so a recipe survives a change
/// of oven. The case order IS the display order in the picker, commonest first.
/// Wider than any one model: a function your oven lacks can still be written down,
/// and starting it is refused by name rather than quietly cooking otherwise.
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
    /// High fan and little fat.
    case airFry = "air-fry"
    case steam
    /// Steam plus hot air.
    case steamCombi = "steam-combi"
    case defrost
    /// One of the oven's OWN programmes — "Quiche et tarte fine" and its kin. Never
    /// picked from the list: it only ever arrives by copying what the oven is set to,
    /// and `OvenProfile.assisted` carries the code that names it.
    case assisted

    var id: String { rawValue }

    /// What the picker offers. `assisted` is left out: it is not a dial anyone turns,
    /// it arrives only by copying what the oven is set to — offering it would let a
    /// cook pick a programme with no code behind it, which starts nothing.
    static var selectable: [OvenProgram] { allCases.filter { $0 != .assisted } }

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
        case .airFry: "Air fry"
        case .steam: "Vapeur"
        case .steamCombi: "Vapeur combinée"
        case .defrost: "Décongélation"
        case .assisted: "Cuisson assistée"
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
        case .airFry: "wind"
        case .steam, .steamCombi: "humidity"
        case .defrost: "snowflake"
        case .assisted: "wand.and.stars"
        }
    }

    var iconImage: Image { Image(systemName: iconName) }
}

/// The oven's own programmes, by name. The appliance hands over a code and nothing
/// else — `ASSIST_QUICHEANDTARTETHIN` — and its API exposes no catalogue to look one
/// up in, so the dish a code stands for is written here or nowhere.
///
/// PARTIAL on purpose, like the heating functions the server maps: a code with no
/// name yet reads as itself rather than as the wrong dish. A row showing a raw code
/// is the cue to add the pair — the name is the one on the oven's own screen.
private let assistedNames: [String: String] = [
    "ASSIST_QUICHEANDTARTETHIN": "Quiche et tarte fine",
]

extension OvenProgram {
    /// The mode as a cook reads it. An assisted cooking is named by the DISH it runs:
    /// "Cuisson assistée" says which kind of programme it is, never which one, and a
    /// recipe sheet that cannot say which one cannot be followed.
    func label(assisted code: String?) -> String {
        guard self == .assisted, let name = code.flatMap({ assistedNames[$0] }) else { return label }
        return name
    }

    /// The line under it: the kind of programme once the dish is named above, the
    /// bare code when it is not — an unnamed programme still tells the cook what to
    /// look for on the oven, and stays recognisable between two versions.
    func detail(assisted code: String?) -> String? {
        guard self == .assisted, let code else { return nil }
        return assistedNames[code] != nil ? label : code
    }
}
