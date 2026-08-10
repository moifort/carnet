import ApolloAPI

/// Bridges the generated `ShuhariGraphQL.OvenProgram` enum and the design-facing
/// `OvenProgram` (which carries its French label and its icon). A heating function
/// the app does not know yet reads as `conventional` — the plainest one, and the
/// one a cook can always reproduce by hand.
extension OvenProgram {
    init(graphql: GraphQLEnum<ShuhariGraphQL.OvenProgram>) {
        switch graphql {
        case .case(let value):
            switch value {
            case .conventional: self = .conventional
            case .convection: self = .convection
            case .convectionHumid: self = .convectionHumid
            case .topHeat: self = .topHeat
            case .bottomHeat: self = .bottomHeat
            case .grill: self = .grill
            case .turboGrill: self = .turboGrill
            case .pizza: self = .pizza
            case .airFry: self = .airFry
            case .steam: self = .steam
            case .steamCombi: self = .steamCombi
            case .defrost: self = .defrost
            }
        case .unknown:
            self = .conventional
        }
    }

    var graphQLValue: GraphQLEnum<ShuhariGraphQL.OvenProgram> {
        switch self {
        case .conventional: .case(.conventional)
        case .convection: .case(.convection)
        case .convectionHumid: .case(.convectionHumid)
        case .topHeat: .case(.topHeat)
        case .bottomHeat: .case(.bottomHeat)
        case .grill: .case(.grill)
        case .turboGrill: .case(.turboGrill)
        case .pizza: .case(.pizza)
        case .airFry: .case(.airFry)
        case .steam: .case(.steam)
        case .steamCombi: .case(.steamCombi)
        case .defrost: .case(.defrost)
        }
    }
}
