import Foundation

/// Shared domain models for the experimentation loop. Sendable value types,
/// decoupled from the generated `ShuhariGraphQL` selection sets so that views,
/// previews and tests never depend on Apollo. Mapping from generated types lives
/// in each feature's `*API.swift`.

// MARK: - Ingredient

/// What goes in, with its measured quantity ("Riz" / "320 g"). The shopping-list
/// view of the recipe.
struct Ingredient: Identifiable, Sendable, Hashable {
    let name: String
    let quantity: String
    var id: String { name }
}

/// A recipe this one is made of, as the sheet shows it: its live title, the best
/// rating it ever earned, the weight it is used at here, and the shopping list of its
/// best version — enough to write the row's summary line without a second call.
/// Flattened at the boundary, one level deep: what THAT recipe is made of is not read.
struct LinkedRecipe: Identifiable, Sendable, Hashable {
    let id: String
    let title: String
    /// The best rating it ever earned, nil when it was never cooked.
    let rating: Int?
    /// How much of it this recipe takes, as a multiplier of what it writes: 0.2 is a
    /// fifth of it, 1 is it as written.
    let scale: Double
    let ingredients: [Ingredient]
}

/// A recipe that is made of the one being read — the link the other way round. No
/// weight: the weight belongs to the recipe that posted the link, not to this one.
struct UsingRecipe: Identifiable, Sendable, Hashable {
    let id: String
    let title: String
    let rating: Int?
}

// MARK: - Thermomix

/// Thermomix settings for one step (display-oriented strings — "Varoma" and
/// "pétrin" are valid values, no computation is ever done on them).
struct ThermomixSettings: Sendable, Hashable {
    let time: String?
    let temperature: String?
    let speed: String?
    let reverse: Bool

    var isEmpty: Bool { time == nil && temperature == nil && speed == nil && !reverse }

    /// A step carrying no Thermomix setting. The single spelling of "plain step" —
    /// every Thermomix step always carries its settings, `.plain` when it has none.
    static let plain = ThermomixSettings(time: nil, temperature: nil, speed: nil, reverse: false)
}

/// One Thermomix step: its instruction plus the machine settings that go with it
/// (`.plain` for a plain step — the settings are total, never a hole).
struct ThermomixStep: Sendable, Hashable {
    let text: String
    let settings: ThermomixSettings
}

// MARK: - Coffee

/// The bag in the cupboard: what the coffee IS. Every field is optional — a cook
/// who only knows the dose still logs the dose.
struct CoffeeBeans: Sendable, Hashable {
    let name: String?
    let country: String?
    let producer: String?
    /// How far the roaster took them ("Torréfaction claire", "Medium roast").
    let roast: String?
    let roastedOn: Date?
    let dose: String?

    var isEmpty: Bool {
        name == nil && country == nil && producer == nil && roast == nil && roastedOn == nil
            && dose == nil
    }

    static let empty = CoffeeBeans(
        name: nil, country: nil, producer: nil, roast: nil, roastedOn: nil, dose: nil
    )
}

/// The water, which is half the cup: what it is (free text — a tap has a hardness,
/// a bottle has a brand), how much of it, how hot.
struct CoffeeWaterSpec: Sendable, Hashable {
    let kind: String?
    let amount: String?
    let temperature: String?

    var isEmpty: Bool { kind == nil && amount == nil && temperature == nil }

    static let empty = CoffeeWaterSpec(kind: nil, amount: nil, temperature: nil)
}

/// The three dials the cook actually turns between two attempts.
struct CoffeeExtraction: Sendable, Hashable {
    let grind: String?
    let time: String?
    /// What lands in the cup ("36 g" for a double espresso).
    let cupYield: String?

    var isEmpty: Bool { grind == nil && time == nil && cupYield == nil }

    static let empty = CoffeeExtraction(grind: nil, time: nil, cupYield: nil)
}

/// The milk of a milk drink. `nil` on the parameters IS the information — an
/// espresso has none — never an unfilled field.
struct CoffeeMilk: Sendable, Hashable {
    let kind: String?
    let amount: String?
    let temperature: String?

    var isEmpty: Bool { kind == nil && amount == nil && temperature == nil }

    static let empty = CoffeeMilk(kind: nil, amount: nil, temperature: nil)
}

/// What brews it and what grinds it. Versioned along with the rest, so a version
/// stays reproducible on its own.
struct CoffeeGear: Sendable, Hashable {
    let machine: String?
    let grinder: String?

    var isEmpty: Bool { machine == nil && grinder == nil }

    static let empty = CoffeeGear(machine: nil, grinder: nil)
}

/// Everything a coffee version is set by, minus its gestures — the unit the edit
/// sheet writes back whole. A coffee has no ingredient list: its dose, its water
/// and its milk are here.
struct CoffeeParameters: Sendable, Hashable {
    let beans: CoffeeBeans
    let water: CoffeeWaterSpec
    let extraction: CoffeeExtraction
    let milk: CoffeeMilk?
    let gear: CoffeeGear

    var isEmpty: Bool {
        beans.isEmpty && water.isEmpty && extraction.isEmpty && milk == nil && gear.isEmpty
    }

    static let empty = CoffeeParameters(
        beans: .empty, water: .empty, extraction: .empty, milk: nil, gear: .empty
    )
}

/// The free-text values a cook has already used, per field — what each coffee
/// field suggests as they type. Suggestions only: any new value is accepted, and
/// using one is what adds it.
struct CoffeeVocabulary: Sendable, Hashable {
    var beanNames: [String] = []
    var countries: [String] = []
    var producers: [String] = []
    var roasts: [String] = []
    var waterKinds: [String] = []
    var milkKinds: [String] = []
    var machines: [String] = []
    var grinders: [String] = []

    static let empty = CoffeeVocabulary()
}

/// The oven settings a version bakes at: plain values owned by the version, never
/// a reference to anything the oven might rename or drop.
struct OvenProfile: Sendable, Hashable {
    var program: OvenProgram
    /// The oven's own programme code, set if and only if `program == .assisted`. The
    /// one manufacturer string a recipe stores, and it earns its place: an assisted
    /// cooking varies heat and humidity over time, so rewriting it as a heating
    /// function would cook something else without saying so.
    var assisted: String?
    /// What the dial is set to, in °C.
    var temperature: Int
    /// How long it bakes, in minutes. nil when the probe is what ends the cooking.
    var duration: Int?
    /// The target at the heart of the food, in °C. nil on a plain timed cook.
    var core: Int?

    /// What a fresh profile starts from — the setting most recipes state.
    static let blank = OvenProfile(program: .conventional, temperature: 180, duration: 30)
}

// MARK: - Version content

/// A version's body, tagged by recipe type: a cooked dish carries plain-text
/// steps, a Thermomix recipe carries steps that each embed their machine
/// settings, a coffee steps that each embed their extraction settings. Adding a
/// recipe type later is one more case here.
enum VersionContent: Sendable, Hashable {
    case dish(ingredients: [Ingredient], steps: [String], oven: OvenProfile? = nil)
    case thermomix(ingredients: [Ingredient], steps: [ThermomixStep], oven: OvenProfile? = nil)
    case coffee(parameters: CoffeeParameters)

    /// The ingredient list, whichever variant this is. A coffee has none: its dose,
    /// its water and its milk are parameters.
    var ingredients: [Ingredient] {
        switch self {
        case .dish(let ingredients, _, _): ingredients
        case .thermomix(let ingredients, _, _): ingredients
        case .coffee: []
        }
    }

    /// The oven settings this version bakes at, or nil when it never goes in the
    /// oven — a coffee never does.
    var oven: OvenProfile? {
        switch self {
        case .dish(_, _, let oven): oven
        case .thermomix(_, _, let oven): oven
        case .coffee: nil
        }
    }

    /// The coffee parameters, or nil on anything that is not a coffee.
    var coffeeParameters: CoffeeParameters? {
        if case .coffee(let parameters) = self { parameters } else { nil }
    }

    /// The plain step instructions, whichever variant this is (a step's machine or
    /// extraction settings are dropped — this is the text-only view of the method).
    var stepTexts: [String] {
        switch self {
        case .dish(_, let steps, _): steps
        case .thermomix(_, let steps, _): steps.map(\.text)
        // A coffee has no gestures: it is wholly described by its parameters.
        case .coffee: []
        }
    }

    /// The steps with their machine settings attached (anything that is not a
    /// Thermomix step carries `.plain`) — the shape a diff compares, since a
    /// Thermomix step can change through its settings alone, its text untouched.
    var stepsWithSettings: [ThermomixStep] {
        switch self {
        case .dish(_, let steps, _): steps.map { ThermomixStep(text: $0, settings: .plain) }
        case .thermomix(_, let steps, _): steps
        case .coffee: []
        }
    }

}

// MARK: - Version

/// How a version came to exist.
enum VersionOriginKind: Sendable {
    case aiProposal
    case `import`
    case manual
}

/// An entry in a recipe's linear lineage (v1 → v2 → …). Its content (ingredients +
/// steps, with per-step Thermomix settings for a Thermomix recipe) is immutable;
/// its attempt outcome (`rating`, `remarks`, `executedAt`, `photoUrl`) is written
/// once, when the version is tried. A version is a planned attempt until
/// `executedAt != nil`.
struct RecipeVersion: Identifiable, Sendable {
    let number: Int
    /// How many full days the beans rested between the roast and this version —
    /// counted to its creation, so it is frozen and comparable from one attempt to
    /// the next. nil on anything that is not a coffee, and on a coffee with no
    /// roast date.
    var restDays: Int?
    /// The version this one iterates on — the attempt it was built from. nil on the
    /// original v1, which builds on nothing. Drives the attempt-diff base.
    let basedOn: Int?
    let change: String?
    let why: String?
    let originKind: VersionOriginKind
    let originDetail: String?
    /// The version body: a dish (plain-text steps) or a Thermomix recipe (per-step
    /// machine settings). "Is Thermomix" is carried by the content variant, mirroring
    /// the recipe `type`.
    let content: VersionContent
    /// Cooking tips — serving, storage or technique advice, neither an ingredient
    /// nor a step. Empty when it has none (the section is then not rendered).
    /// Unlike the content they are rewritable in place, without creating a version.
    var tips: [String] = []
    /// The cook's cautions on this attempt ("Le fouet doit être mis dès le début") —
    /// the banner atop the recipe sheet, read before cooking starts. Carried onto the
    /// next iteration by the server, and rewritable in place like the tips. Empty when
    /// there are none (the banner is then not rendered).
    var warnings: [String] = []
    /// Hearted by the cook — the attempt they would make again. Carried onto the next
    /// iteration by the server, and mirrored on the recipe for the library's lens.
    var favorite: Bool = false
    /// The recipe this version belongs to.
    let recipeId: String
    /// On the to-cook list: an improvement asked for this version, and it has not
    /// been cooked yet. Only an improvement raises it; cooking clears it.
    var toTest: Bool = false
    /// The attempt rating (1..5), or nil while the version hasn't been executed yet.
    let rating: Int?
    /// The attempt remarks, or nil while not yet executed.
    let remarks: String?
    /// When the attempt was executed, or nil while still a planned attempt.
    let executedAt: Date?
    /// Signed URL of the attempt photo (nil until photo storage is provisioned).
    let photoUrl: String?
    let createdAt: Date
    /// When the version was last worked on — its attempt re-recorded, its tips or its
    /// coffee parameters corrected. Equal to `createdAt` until something is changed on
    /// it, and it is the date the app shows and files the version under: what matters
    /// is when it was last touched, not when the lineage grew it.
    let updatedAt: Date

    var id: Int { number }

    /// The version's ingredients, whichever content variant it carries.
    var ingredients: [Ingredient] { content.ingredients }
    /// The version's plain step texts, whichever content variant it carries.
    var steps: [String] { content.stepTexts }

    /// The steps as the editor speaks them: one shape for both worlds, a dish's steps
    /// carrying `.plain` settings — which is exactly what the server ignores on one.
    var editableSteps: [ThermomixStep] {
        switch content {
        case .dish(_, let steps, _): steps.map { ThermomixStep(text: $0, settings: .plain) }
        case .thermomix(_, let steps, _): steps
        case .coffee: []
        }
    }

    /// Whether the machine settings are worth showing — a dish has no machine.
    var isThermomix: Bool {
        if case .thermomix = content { return true }
        return false
    }

    /// Whether this version has been executed (its attempt recorded).
    var tried: Bool { executedAt != nil }
}

// MARK: - Proposal

/// An ephemeral AI proposal for the next version of a recipe. Generated on
/// demand, held in memory and never persisted: it carries the COMPLETE next
/// version (its `content`) plus a short human summary of what changed. `basedOn`
/// is the version it iterates on (the one just cooked).
struct Proposal: Sendable {
    /// The version this proposal iterates on — echoed back on accept.
    let basedOn: Int
    /// A short human summary of what the next version changes.
    let changeSummary: String
    let rationale: String
    /// The full body of the proposed next version (dish or Thermomix).
    let content: VersionContent
    /// The complete tips list of the proposed version — the current tips carried
    /// over, any advice found in the remarks folded in.
    var tips: [String] = []
}

/// The complete next-version proposal handed back from the proposal screen
/// and sent to `acceptProposal`. Full-replacement semantics — the `content` is
/// complete, not partial; `basedOn`, `changeSummary` and `rationale` carry through
/// from the AI proposal unchanged.
struct ProposalEdit: Sendable {
    let basedOn: Int
    let changeSummary: String
    let rationale: String
    let content: VersionContent
    /// The complete tips list of the version being created.
    var tips: [String] = []
}

/// A cook: how it was rated, what was noticed, what it looked like. When it carries
/// remarks it asks for a next version, and it is held in memory through the proposal
/// step — written, on accept, onto the version cooked, exactly where a remark-less
/// cook goes straight away (`recordAttempt`). The version the proposal creates has
/// been made by nobody: it carries no cook, and waits on the to-cook list.
struct Attempt: Sendable {
    let rating: Int
    let remarks: String
    let photoBase64: String?
}

// MARK: - Recipe

/// A recipe under experimentation, with its version lineage.
struct Recipe: Identifiable, Sendable {
    let id: String
    let title: String
    let type: RecipeType
    /// The dish course — fixed at import, shared across all versions. A coffee is
    /// always a `.drink`; its own axis is `method`.
    let category: DishCategory
    /// How it is brewed — fixed at import, shared across all versions, and nil on
    /// anything that is not a coffee.
    var method: BrewMethod? = nil
    /// Whether any of its versions is hearted — the derived mirror the library's
    /// favourites lens lists on. Never set directly: heart a version.
    let favorite: Bool
    /// The full lineage, oldest first.
    let versions: [RecipeVersion]
    /// The best rating across every executed version, computed server-side. nil
    /// when no version has been cooked yet. Drives the recipe's display rating.
    let bestRating: Int?
    /// The version to show first when the recipe sheet opens: the best-rated one (the
    /// most recent wins a tie), else the latest when nothing has been cooked. A version
    /// waiting to be cooked never opens. Never nil — a recipe always has at least its v1.
    let versionToOpen: RecipeVersion
    /// The recipes this one is made of, in the order they were linked. Empty on a
    /// recipe that stands alone, which is most of them.
    var components: [LinkedRecipe] = []
    /// The recipes made of this one — derived, never set here: link from the recipe
    /// that uses it.
    var usedBy: [UsingRecipe] = []

    /// The version number the next iteration would take.
    var nextVersionNumber: Int { (versions.map(\.number).max() ?? 0) + 1 }

    /// The versions waiting to be cooked, most recent first — what the to-cook
    /// sheet lists and what lights the flask CTA's dot.
    var versionsToTest: [RecipeVersion] {
        versions.filter(\.toTest).sorted { $0.number > $1.number }
    }

    /// The attempt journal: every tried version, most recent first.
    var attempts: [RecipeVersion] {
        versions
            .filter(\.tried)
            .sorted { ($0.executedAt ?? .distantPast) > ($1.executedAt ?? .distantPast) }
    }

    func version(_ number: Int) -> RecipeVersion? {
        versions.first { $0.number == number }
    }
}

// MARK: - Import

/// One extracted step: its text plus the Thermomix settings that go with it
/// (`.plain` sets nothing, which is every step of a dish). Cooking only — a coffee
/// is imported as parameters and has no step at all.
struct ImportStep: Sendable, Hashable {
    let text: String
    let thermomix: ThermomixSettings

    var asThermomixStep: ThermomixStep { ThermomixStep(text: text, settings: thermomix) }
}

/// Which notebook an import is for — decided by the tab it was launched from, never
/// guessed from the source. The two flows share the camera and nothing else: their
/// prompts, their previews and their results are their own.
enum ImportFlow: Sendable, Hashable {
    case cooking
    case coffee
}

/// A cooked dish or a Thermomix recipe extracted from an import source (editable
/// preview). Which flow produced it is decided by the tab the cook launched the
/// import from, never guessed from the source.
struct CookingImportAnalysis: Sendable, Hashable {
    var title: String
    /// What the AI read it to be — a dish or a Thermomix recipe, editable before
    /// create. Never a coffee: that source goes through the coffee flow.
    var type: RecipeType
    /// The dish course detected by the AI (editable before create).
    var category: DishCategory
    /// The recipe's ingredients with quantities (empty when none).
    var ingredients: [Ingredient] = []
    /// The extracted steps, each carrying its own Thermomix settings.
    var steps: [ImportStep]
    /// The cooking tips found in the source (empty when it carries none).
    var tips: [String] = []
    var sourceLabel: String?
}

/// A coffee extracted from an import source (editable preview): how it is brewed
/// and the dials it is set by. No ingredient list, no steps — a coffee has neither.
struct CoffeeImportAnalysis: Sendable, Hashable {
    var title: String
    /// How the AI read that it is brewed (editable before create).
    var method: BrewMethod
    /// The dials read off the source — every field nil when the source says nothing
    /// of it. The preview shows them all anyway, filled or not.
    var parameters: CoffeeParameters
    var tips: [String] = []
    var sourceLabel: String?
}
