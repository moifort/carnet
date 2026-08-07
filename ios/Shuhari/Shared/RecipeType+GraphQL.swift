import ApolloAPI

/// Bridges the generated `ShuhariGraphQL.RecipeType` enum and the design-facing
/// `RecipeType` (which carries its label and icons).
extension RecipeType {
    init(graphql: GraphQLEnum<ShuhariGraphQL.RecipeType>) {
        switch graphql {
        case .case(let value):
            switch value {
            case .dish: self = .dish
            case .thermomix: self = .thermomix
            case .coffee: self = .coffee
            }
        case .unknown:
            self = .dish
        }
    }

    var graphQLValue: GraphQLEnum<ShuhariGraphQL.RecipeType> {
        switch self {
        case .dish: .case(.dish)
        case .thermomix: .case(.thermomix)
        case .coffee: .case(.coffee)
        }
    }
}

/// Bridges the generated `ShuhariGraphQL.BrewMethod` enum and the design-facing
/// `BrewMethod`. A coffee always carries one, so the bridge is nil-tolerant only
/// where the server says the recipe is not one.
extension BrewMethod {
    init?(graphql: GraphQLEnum<ShuhariGraphQL.BrewMethod>?) {
        guard let graphql else { return nil }
        switch graphql {
        case .case(let value):
            switch value {
            case .espresso: self = .espresso
            case .americano: self = .americano
            case .flatWhite: self = .flatWhite
            case .cappuccino: self = .cappuccino
            case .latte: self = .latte
            case .moka: self = .moka
            case .v60: self = .v60
            case .chemex: self = .chemex
            case .drip: self = .drip
            case .aeropress: self = .aeropress
            case .frenchPress: self = .frenchPress
            case .coldBrew: self = .coldBrew
            case .other: self = .other
            }
        case .unknown:
            self = .other
        }
    }

    var graphQLValue: GraphQLEnum<ShuhariGraphQL.BrewMethod> {
        switch self {
        case .espresso: .case(.espresso)
        case .americano: .case(.americano)
        case .flatWhite: .case(.flatWhite)
        case .cappuccino: .case(.cappuccino)
        case .latte: .case(.latte)
        case .moka: .case(.moka)
        case .v60: .case(.v60)
        case .chemex: .case(.chemex)
        case .drip: .case(.drip)
        case .aeropress: .case(.aeropress)
        case .frenchPress: .case(.frenchPress)
        case .coldBrew: .case(.coldBrew)
        case .other: .case(.other)
        }
    }
}

/// Origin kind bridge (used by the history timeline copy).
extension VersionOriginKind {
    init(graphql: GraphQLEnum<ShuhariGraphQL.VersionOriginKind>) {
        switch graphql {
        case .case(let value):
            switch value {
            case .aiProposal: self = .aiProposal
            case .import: self = .import
            case .manual: self = .manual
            }
        case .unknown:
            self = .manual
        }
    }
}
