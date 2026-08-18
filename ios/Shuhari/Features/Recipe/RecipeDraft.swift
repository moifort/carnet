import Foundation

/// One editable ingredient line. Its identity is its own and never its name: a name
/// cannot identify a row while it is being typed.
struct IngredientRow: Identifiable, Equatable {
    let id = UUID()
    var name: String
    var quantity: String
}

/// One editable line of free text — a caution or a tip.
struct TextRow: Identifiable, Equatable {
    let id = UUID()
    var text: String
}

/// One editable step: its instruction plus its four machine settings as plain
/// strings, because a Thermomix setting is a display value ("Varoma", "pétrin") and
/// nothing is ever computed on it.
struct StepRow: Identifiable, Equatable {
    let id = UUID()
    var text: String
    var time = ""
    var temperature = ""
    var speed = ""
    var reverse = false
}

/// The shopping list being edited, with a proportional resizing applied on top of
/// it: stepping one quantity carries every other one along the same factor. Unlike
/// the recipe sheet's factor this one is not a lens — what is saved is what is
/// shown, and the recipe IS the smaller loaf from then on.
struct IngredientListDraft: Equatable {
    var rows: [IngredientRow]
    var factor: Double = 1

    init(_ ingredients: [Ingredient]) {
        rows = ingredients.map { IngredientRow(name: $0.name, quantity: $0.quantity) }
    }

    /// The quantity of one row as the sheet shows it: the stored one carried by the
    /// factor.
    func displayed(at index: Int) -> String {
        QuantityScaling.scaled(rows[index].quantity, by: factor)
    }

    /// Step one row's quantity a tick up (+1) or down (−1). What moves is the whole
    /// list's factor: resizing a recipe by one of its ingredients is the gesture.
    mutating func step(at index: Int, direction: Int) {
        guard
            let next = QuantityScaling.factorAfterStep(
                on: rows[index].quantity,
                from: factor,
                direction: direction
            )
        else { return }
        factor = next
    }

    /// Type a quantity by hand: the factor is folded in first, so the line lands
    /// exactly as typed instead of being rescaled behind the cook's back.
    mutating func write(_ quantity: String, at index: Int) {
        bakeFactor()
        rows[index].quantity = quantity
    }

    /// A line added by hand starts outside the resizing — baking the factor in first
    /// stops the empty row from being scaled the moment it is filled.
    mutating func add() {
        bakeFactor()
        rows.append(IngredientRow(name: "", quantity: ""))
    }

    /// Folds the factor into the rows themselves and starts over from 1 — the rows
    /// keep their identity, so a field being typed into is not torn down.
    mutating func bakeFactor() {
        guard factor != 1 else { return }
        for index in rows.indices {
            rows[index].quantity = QuantityScaling.scaled(rows[index].quantity, by: factor)
        }
        factor = 1
    }

    /// The list as it will be stored — the quantities AS SHOWN, factor included: what
    /// is saved is what the cook is looking at. Blank rows dropped (the server refuses
    /// an empty name or quantity), the rest in the order shown.
    var ingredients: [Ingredient] {
        rows.indices.compactMap { index in
            let name = rows[index].name.trimmingCharacters(in: .whitespacesAndNewlines)
            let quantity = displayed(at: index).trimmingCharacters(in: .whitespacesAndNewlines)
            guard !name.isEmpty, !quantity.isEmpty else { return nil }
            return Ingredient(name: name, quantity: quantity)
        }
    }
}

/// The method being edited. `showsSettings` is what a Thermomix version turns on; a
/// dish has no machine and its steps are text alone.
struct StepListDraft: Equatable {
    var rows: [StepRow]
    var showsSettings: Bool

    init(_ steps: [ThermomixStep], showsSettings: Bool) {
        self.showsSettings = showsSettings
        rows = steps.map {
            StepRow(
                text: $0.text,
                time: $0.settings.time ?? "",
                temperature: $0.settings.temperature ?? "",
                speed: $0.settings.speed ?? "",
                reverse: $0.settings.reverse
            )
        }
    }

    mutating func add() {
        rows.append(StepRow(text: ""))
    }

    /// The method as it will be stored: blank steps dropped (the server refuses an
    /// empty text), each surviving one carrying the settings actually typed.
    var steps: [ThermomixStep] {
        rows.compactMap { row in
            let text = row.text.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !text.isEmpty else { return nil }
            return ThermomixStep(text: text, settings: settings(of: row))
        }
    }

    private func settings(of row: StepRow) -> ThermomixSettings {
        guard showsSettings else { return .plain }
        let typed = { (raw: String) -> String? in
            let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
            return trimmed.isEmpty ? nil : trimmed
        }
        return ThermomixSettings(
            time: typed(row.time),
            temperature: typed(row.temperature),
            speed: typed(row.speed),
            reverse: row.reverse
        )
    }
}

/// A list of free-text lines being edited — the cautions, and the tips.
struct TextListDraft: Equatable {
    var rows: [TextRow]

    init(_ lines: [String]) {
        rows = lines.map { TextRow(text: $0) }
    }

    mutating func add() {
        rows.append(TextRow(text: ""))
    }

    /// Blank rows are dropped — an emptied list is how the section is cleared, not a
    /// list of empty lines.
    var lines: [String] {
        rows.compactMap {
            let text = $0.text.trimmingCharacters(in: .whitespacesAndNewlines)
            return text.isEmpty ? nil : text
        }
    }
}

/// Everything a recipe sheet can be corrected on, in one place: the aggregate's own
/// fields, and the whole content of the version on screen. `RecipeEditSheet` binds to
/// it and `RecipeAPI.correct` writes back only what moved. The type is not in it — a
/// dish never becomes a Thermomix recipe, its versions are shaped by it.
struct RecipeDraft {
    var title: String
    var category: DishCategory
    /// Set on a coffee and on nothing else, which is filed by how it is brewed.
    var method: BrewMethod?
    /// The note of the version on screen — nil while it has never been rated.
    var rating: Int?
    var ingredients: IngredientListDraft
    var steps: StepListDraft
    var oven: OvenProfileDraft
    /// Set on a coffee and on nothing else: it is wholly described by its parameters,
    /// and has neither ingredients, nor steps, nor an oven.
    var coffee: CoffeeParametersDraft?
    var warnings: TextListDraft
    var tips: TextListDraft

    /// - Parameters:
    ///   - previousGear: the machine and grinder of the closest earlier coffee
    ///     version, so a version that carries none does not re-ask what never changes.
    init(recipe: Recipe, version: RecipeVersion, previousGear: CoffeeGear = .empty) {
        title = recipe.title
        category = recipe.category
        method = recipe.method
        rating = version.rating
        ingredients = IngredientListDraft(version.ingredients)
        steps = StepListDraft(version.editableSteps, showsSettings: version.isThermomix)
        oven = OvenProfileDraft(version.content.oven)
        coffee = version.content.coffeeParameters.map {
            CoffeeParametersDraft($0, gear: previousGear)
        }
        warnings = TextListDraft(version.warnings)
        tips = TextListDraft(version.tips)
    }

    /// A coffee is filed by how it is brewed, and it is what says which sections the
    /// edit sheet shows at all.
    var isCoffee: Bool { coffee != nil }
}
