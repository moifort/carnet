#if DEBUG
import Foundation

/// Deterministic domain fixtures shared by `#Preview`s and the debug gallery.
/// One realistic recipe per shape the UI must handle: a plated dish mid-iteration
/// (Bœuf bourguignon), a Thermomix dish with per-step machine settings (Risotto),
/// and the transient models (AI proposal, import analysis, library rows)
/// around them. Cooking-only — no params, no café/cocktail.
enum Fixtures {
    /// The two offers as `Shuhari.storekit` declares them — what StoreKit hands
    /// the sheet once the App Store answers. Lets the gallery render the shipped
    /// subscription screen offline (App Store review needs a screenshot of it).
    static let premiumOffers: [PremiumSheet.Offer] = [
        .init(
            id: SubscriptionProducts.yearly,
            title: "Premium annuel",
            price: "24,99 €",
            detail: "1 semaine d’essai gratuit, puis renouvellement automatique",
            badge: "Économisez 30 %",
            isTrial: true
        ),
        .init(
            id: SubscriptionProducts.monthly,
            title: "Premium mensuel",
            price: "2,99 €",
            detail: "sans engagement",
            badge: nil,
            isTrial: false
        ),
    ]

    static let date = Date(timeIntervalSince1970: 1_752_300_000)

    static let bourguignonIngredients = [
        Ingredient(name: "Bœuf (paleron)", quantity: "1,2 kg"),
        Ingredient(name: "Lardons", quantity: "200 g"),
        Ingredient(name: "Oignons", quantity: "2"),
        Ingredient(name: "Carottes", quantity: "3"),
        Ingredient(name: "Vin rouge", quantity: "75 cl"),
        Ingredient(name: "Bouillon", quantity: "50 cl"),
        Ingredient(name: "Farine", quantity: "30 g"),
        Ingredient(name: "Bouquet garni", quantity: "1"),
        // A spoon quantity carrying the AI's gram estimate — the scaling test's
        // proof that the "(15 g)" rescales with the count instead of freezing.
        Ingredient(name: "Concentré de tomate", quantity: "1 c. à soupe (15 g)"),
    ]

    /// The wine before the v3 iteration (50 cl) — v1/v2 use this, so focusing v3
    /// highlights "Vin rouge" as changed against its predecessor.
    static let bourguignonIngredientsEarly = bourguignonIngredients.map {
        $0.name == "Vin rouge" ? Ingredient(name: "Vin rouge", quantity: "50 cl") : $0
    }

    static let bourguignonSteps = [
        "Saisir le bœuf sur toutes les faces, réserver.",
        "Faire revenir lardons, oignons et carottes.",
        "Singer avec la farine, mélanger.",
        "Mouiller au vin et au bouillon, ajouter le bouquet garni.",
        "Cuire à couvert 3 h.",
    ]

    /// The v4 steps: the cooking time stretched to 3 h 30 — so focusing v4
    /// highlights that last step as changed against v3.
    static let bourguignonStepsV4 = Array(bourguignonSteps.dropLast()) + ["Cuire à couvert 3 h 30."]

    static let risottoIngredients = [
        Ingredient(name: "Oignon", quantity: "1"),
        Ingredient(name: "Ail", quantity: "1 gousse"),
        Ingredient(name: "Huile d’olive", quantity: "20 g"),
        Ingredient(name: "Riz arborio", quantity: "320 g"),
        Ingredient(name: "Vin blanc", quantity: "60 ml"),
        Ingredient(name: "Bouillon", quantity: "650 ml"),
        Ingredient(name: "Parmesan", quantity: "60 g"),
    ]

    /// The Thermomix method: each step carrying its own machine settings (the last
    /// one plain — a rest with no machine action).
    static let risottoSteps = [
        ThermomixStep(
            text: "Mettre l’oignon et l’ail dans le bol, mixer.",
            settings: ThermomixSettings(time: "5 s", temperature: nil, speed: "5", reverse: false)
        ),
        ThermomixStep(
            text: "Ajouter l’huile d’olive, faire revenir.",
            settings: ThermomixSettings(time: "3 min", temperature: "120 °C", speed: "1", reverse: false)
        ),
        ThermomixStep(
            text: "Ajouter le riz et le vin, cuire sans le gobelet doseur.",
            settings: ThermomixSettings(time: "2 min", temperature: "100 °C", speed: "1", reverse: true)
        ),
        ThermomixStep(
            text: "Ajouter le bouillon, cuire.",
            settings: ThermomixSettings(time: "14 min", temperature: "100 °C", speed: "1", reverse: true)
        ),
        ThermomixStep(
            text: "Ajouter le parmesan, mélanger, laisser reposer 2 min.",
            settings: .plain
        ),
    ]

    // MARK: - Bœuf bourguignon (dish, pending v4)

    static let bourguignonV1 = RecipeVersion(
        number: 1, basedOn: nil, change: nil, why: nil, originKind: .import,
        originDetail: "Importée par photo",
        content: .dish(ingredients: bourguignonIngredientsEarly, steps: bourguignonSteps),
        recipeId: "bourguignon", rating: 3,
        remarks: "Bon mais la sauce manque de corps.",
        executedAt: date.addingTimeInterval(-86_400 * 28), photoUrl: nil,
        createdAt: date.addingTimeInterval(-86_400 * 30),
        updatedAt: date.addingTimeInterval(-86_400 * 28)
    )

    static let bourguignonV2 = RecipeVersion(
        number: 2, basedOn: 1, change: "Ajout d’un bouquet garni", why: "Manque d’arômes.",
        originKind: .aiProposal, originDetail: nil,
        content: .dish(ingredients: bourguignonIngredientsEarly, steps: bourguignonSteps),
        recipeId: "bourguignon", rating: 3,
        remarks: "Plus parfumé, encore un peu ferme.",
        executedAt: date.addingTimeInterval(-86_400 * 18), photoUrl: nil,
        createdAt: date.addingTimeInterval(-86_400 * 20),
        updatedAt: date.addingTimeInterval(-86_400 * 18)
    )

    static let bourguignonV3 = RecipeVersion(
        number: 3,
        basedOn: 2,
        change: "Vin rouge 50 → 75 cl",
        why: "La sauce manquait de corps.",
        originKind: .aiProposal,
        originDetail: nil,
        content: .dish(ingredients: bourguignonIngredients, steps: bourguignonSteps),
        tips: [
            "Servir avec des tagliatelles fraîches ou une purée maison.",
            "Meilleur réchauffé le lendemain.",
        ],
        recipeId: "bourguignon",
        rating: 4,
        remarks: "Sauce nappante, viande fondante.",
        executedAt: date.addingTimeInterval(-86_400 * 2),
        photoUrl: nil,
        createdAt: date.addingTimeInterval(-86_400 * 6),
        updatedAt: date.addingTimeInterval(-86_400 * 2)
    )

    static let bourguignonV4 = RecipeVersion(
        number: 4,
        basedOn: 3,
        change: "Cuisson 3 h → 3 h 30",
        why: "Viande encore un peu ferme.",
        originKind: .aiProposal,
        originDetail: nil,
        content: .dish(ingredients: bourguignonIngredients, steps: bourguignonStepsV4),
        tips: ["Servir avec des tagliatelles fraîches ou une purée maison."],
        recipeId: "bourguignon",
        toTest: true,
        rating: nil,
        remarks: nil,
        executedAt: nil,
        photoUrl: nil,
        createdAt: date.addingTimeInterval(-86_400),
        updatedAt: date.addingTimeInterval(-86_400)
    )

    static let bourguignon = Recipe(
        id: "bourguignon",
        title: "Bœuf bourguignon",
        type: .dish,
        category: .main,
        favorite: false,
        versions: [bourguignonV1, bourguignonV2, bourguignonV3, bourguignonV4],
        bestRating: 4,
        // The best-rated version: v4 is still waiting to be cooked, so it never opens.
        versionToOpen: bourguignonV3
    )

    // MARK: - Ravioles (a recipe one of whose ingredients IS a recipe)

    /// The pasta dough, as the ravioli sheet reads it: its live title, the best rating
    /// it ever earned, and what its best version holds — resolved server-side, so this
    /// follows the dough as it improves.
    static let doughComponent = RecipeComponent(
        id: "pate-a-pates",
        title: "Pâte à pâtes fraîches",
        rating: 5,
        ingredients: [
            Ingredient(name: "Farine T55", quantity: "300 g"),
            Ingredient(name: "Œufs", quantity: "3"),
            Ingredient(name: "Huile d’olive", quantity: "1 c. à s."),
            Ingredient(name: "Sel fin", quantity: "1 pincée"),
        ],
        steps: [
            "Mélanger la farine et les œufs jusqu’à obtenir une boule.",
            "Pétrir 10 min, filmer et laisser reposer 1 h au frais.",
            "Abaisser au laminoir jusqu’au cran 6.",
        ]
    )

    static let ravioliIngredients = [
        // The name is the ROLE the dough plays here, not the title of the recipe it is.
        Ingredient(name: "Pâte à ravioles", quantity: "400 g", component: doughComponent),
        Ingredient(name: "Champignons de Paris", quantity: "250 g"),
        Ingredient(name: "Ricotta", quantity: "150 g"),
        Ingredient(name: "Parmesan râpé", quantity: "40 g"),
        Ingredient(name: "Beurre", quantity: "30 g"),
    ]

    static let ravioliSteps = [
        "Faire revenir les champignons émincés au beurre, saler.",
        "Mélanger à la ricotta et au parmesan, laisser refroidir.",
        "Garnir la pâte abaissée, souder et découper les ravioles.",
        "Pocher 3 min à l’eau frémissante.",
    ]

    static let ravioliV1 = RecipeVersion(
        number: 1, basedOn: nil, change: nil, why: nil, originKind: .import,
        originDetail: "Importée par photo",
        content: .dish(ingredients: ravioliIngredients, steps: ravioliSteps),
        recipeId: "ravioles", rating: 4,
        remarks: "Garniture parfaite, pâte un peu épaisse.",
        executedAt: date.addingTimeInterval(-86_400 * 5), photoUrl: nil,
        createdAt: date.addingTimeInterval(-86_400 * 9),
        updatedAt: date.addingTimeInterval(-86_400 * 5)
    )

    static let ravioli = Recipe(
        id: "ravioles",
        title: "Ravioles aux champignons",
        type: .dish,
        category: .main,
        favorite: false,
        versions: [ravioliV1],
        bestRating: 4,
        versionToOpen: ravioliV1
    )

    // MARK: - Quiche (dish that bakes — the oven profile)

    static let quicheIngredients = [
        Ingredient(name: "Pâte brisée", quantity: "1 rouleau"),
        Ingredient(name: "Lardons", quantity: "150 g"),
        Ingredient(name: "Crème fraîche", quantity: "20 cl"),
        Ingredient(name: "Œufs", quantity: "3"),
        Ingredient(name: "Gruyère râpé", quantity: "80 g"),
    ]

    static let quicheSteps = [
        "Étaler la pâte dans le moule et la piquer.",
        "Faire revenir les lardons, les répartir sur le fond.",
        "Battre les œufs avec la crème, verser sur les lardons.",
        "Parsemer de gruyère et enfourner.",
    ]

    /// The version that bakes on a timer — the ordinary case.
    static let quicheV1 = RecipeVersion(
        number: 1,
        basedOn: nil,
        change: nil,
        why: nil,
        originKind: .import,
        originDetail: "Marmiton",
        content: .dish(
            ingredients: quicheIngredients,
            steps: quicheSteps,
            oven: OvenProfile(program: .convection, temperature: 180, duration: 30)
        ),
        tips: ["Se mange aussi bien tiède que chaude."],
        recipeId: "quiche",
        rating: 4,
        remarks: "Un peu pâle sur le dessus.",
        executedAt: date.addingTimeInterval(-86_400 * 3),
        photoUrl: nil,
        createdAt: date.addingTimeInterval(-86_400 * 4),
        updatedAt: date.addingTimeInterval(-86_400 * 3)
    )

    static let quiche = Recipe(
        id: "quiche",
        title: "Quiche fine",
        type: .dish,
        category: .main,
        favorite: false,
        versions: [quicheV1],
        bestRating: 4,
        versionToOpen: quicheV1
    )

    /// The probe case: no timer at all, the cooking ends on a core temperature.
    static let gigotV1 = RecipeVersion(
        number: 1,
        basedOn: nil,
        change: nil,
        why: nil,
        originKind: .manual,
        originDetail: nil,
        content: .dish(
            ingredients: [
                Ingredient(name: "Gigot d’agneau", quantity: "2 kg"),
                Ingredient(name: "Ail", quantity: "6 gousses"),
                Ingredient(name: "Romarin", quantity: "3 branches"),
            ],
            steps: [
                "Piquer le gigot d’ail et de romarin.",
                "Enfourner avec la sonde plantée au cœur.",
                "Laisser reposer 15 min avant de trancher.",
            ],
            oven: OvenProfile(program: .conventional, temperature: 160, duration: nil, core: 63)
        ),
        recipeId: "gigot",
        rating: 5,
        remarks: "Rosé parfait.",
        executedAt: date.addingTimeInterval(-86_400),
        photoUrl: nil,
        createdAt: date.addingTimeInterval(-86_400 * 2),
        updatedAt: date.addingTimeInterval(-86_400)
    )

    static let gigot = Recipe(
        id: "gigot",
        title: "Gigot à la sonde",
        type: .dish,
        category: .main,
        favorite: false,
        versions: [gigotV1],
        bestRating: 5,
        versionToOpen: gigotV1
    )

    // MARK: - Risotto (thermomix, per-step machine settings)

    static let risottoV2 = RecipeVersion(
        number: 2,
        basedOn: 1,
        change: "Bouillon 700 → 650 ml",
        why: "Trop liquide en fin de cuisson.",
        originKind: .aiProposal,
        originDetail: nil,
        content: .thermomix(ingredients: risottoIngredients, steps: risottoSteps),
        // The banner atop the recipe sheet — the whisk caution the feature was
        // born from, carried here from the version it was written on.
        warnings: ["Le fouet doit être mis dès le début."],
        recipeId: "risotto",
        rating: 4,
        remarks: "Bonne texture, manque un peu de sel.",
        executedAt: date.addingTimeInterval(-86_400 * 2),
        photoUrl: nil,
        createdAt: date.addingTimeInterval(-86_400 * 3),
        updatedAt: date.addingTimeInterval(-86_400 * 2)
    )

    static let risotto = Recipe(
        id: "risotto",
        title: "Risotto au parmesan",
        type: .thermomix,
        category: .main,
        favorite: true,
        versions: [risottoV2],
        bestRating: 4,
        versionToOpen: risottoV2
    )

    // MARK: - Coffee

    /// A V60 as it is actually logged: the bag, the water, the dials, the gear —
    /// and steps on top, because a pour-over does have gestures.
    static let v60Parameters = CoffeeParameters(
        beans: CoffeeBeans(
            name: "Belleville — Guji",
            country: "Éthiopie",
            producer: "Coop. Hambela",
            roast: "Torréfaction claire",
            roastedOn: date.addingTimeInterval(-86_400 * 20),
            dose: "18 g"
        ),
        water: CoffeeWaterSpec(kind: "Volvic", amount: "300 g", temperature: "94°C"),
        extraction: CoffeeExtraction(grind: "moyenne", time: "3 min 15", cupYield: "300 g"),
        milk: nil,
        gear: CoffeeGear(machine: "Hario V60 02", grinder: "Comandante C40")
    )

    static let v60V1 = RecipeVersion(
        number: 1, restDays: 14, basedOn: nil, change: nil, why: nil, originKind: .import,
        originDetail: "Photo du sachet",
        content: .coffee(parameters: v60Parameters),
        tips: ["Rincer le filtre à l’eau chaude avant de doser."],
        recipeId: "v60",
        rating: 3, remarks: "Un peu acide, ça manque de corps.",
        executedAt: date.addingTimeInterval(-86_400 * 5),
        photoUrl: nil,
        createdAt: date.addingTimeInterval(-86_400 * 6),
        updatedAt: date.addingTimeInterval(-86_400 * 5)
    )

    /// The one-variable-per-iteration rule made visible: only the grind moved.
    static let v60V2 = RecipeVersion(
        number: 2,
        basedOn: 1,
        change: "Mouture moyenne → fine",
        why: "Une tasse acide est sous-extraite : resserrer la mouture allonge le contact.",
        originKind: .aiProposal,
        originDetail: nil,
        content: .coffee(
            parameters: CoffeeParameters(
                beans: v60Parameters.beans,
                water: v60Parameters.water,
                // The single dial that moved.
                extraction: CoffeeExtraction(grind: "fine", time: "3 min 15", cupYield: "300 g"),
                milk: nil,
                gear: v60Parameters.gear
            )
        ),
        tips: ["Rincer le filtre à l’eau chaude avant de doser."],
        recipeId: "v60",
        rating: 5, remarks: "Beaucoup plus rond.",
        executedAt: date.addingTimeInterval(-86_400),
        photoUrl: nil,
        createdAt: date.addingTimeInterval(-86_400 * 2),
        updatedAt: date.addingTimeInterval(-86_400)
    )

    static let v60 = Recipe(
        id: "v60",
        title: "V60 Éthiopie Guji",
        type: .coffee,
        category: .drink,
        method: .v60,
        favorite: true,
        versions: [v60V1, v60V2],
        bestRating: 5,
        versionToOpen: v60V2
    )

    // MARK: - Espresso — the parameters-only coffee

    /// An espresso: wholly described by its dials, with no step at all. The case
    /// the parameters model exists for.
    static let espressoParameters = CoffeeParameters(
        beans: CoffeeBeans(
            name: "Belleville — Sidamo",
            country: "Éthiopie",
            producer: "Coop. Hambela",
            roast: "Torréfaction espresso",
            roastedOn: date.addingTimeInterval(-86_400 * 9),
            dose: "18 g"
        ),
        water: CoffeeWaterSpec(
            kind: "Robinet (dureté 3/5)",
            amount: "36 g",
            temperature: "93°C"
        ),
        extraction: CoffeeExtraction(grind: "Niveau 12", time: "28 s", cupYield: "36 g"),
        milk: nil,
        gear: CoffeeGear(machine: "Rancilio Silvia", grinder: "Niche Zero")
    )

    static let espressoV1 = RecipeVersion(
        number: 1, restDays: 9, basedOn: nil, change: nil, why: nil, originKind: .import,
        originDetail: "Photo du sachet",
        content: .coffee(parameters: espressoParameters),
        tips: ["Purger le groupe avant de verrouiller le porte-filtre."],
        recipeId: "espresso",
        rating: 4, remarks: "Bien équilibré, un chouïa court.",
        executedAt: date.addingTimeInterval(-86_400),
        photoUrl: nil,
        createdAt: date.addingTimeInterval(-86_400 * 2),
        updatedAt: date.addingTimeInterval(-86_400)
    )

    static let espresso = Recipe(
        id: "espresso",
        title: "Espresso du matin",
        type: .coffee,
        category: .drink,
        method: .espresso,
        favorite: false,
        versions: [espressoV1],
        bestRating: 4,
        versionToOpen: espressoV1
    )

    /// What the coffee form suggests once a few cups have been logged.
    static let coffeeVocabulary = CoffeeVocabulary(
        beanNames: ["Belleville — Sidamo", "Belleville — Guji", "Cafés Lomi — Yirgacheffe"],
        countries: ["Éthiopie", "Colombie", "Brésil"],
        producers: ["Coop. Hambela", "Finca El Paraíso"],
        roasts: ["Torréfaction claire", "Torréfaction espresso", "Medium roast"],
        waterKinds: ["Robinet (dureté 3/5)", "Volvic", "Volvic + minéralisation Lotus"],
        milkKinds: ["Entier", "Avoine Oatly"],
        machines: ["Rancilio Silvia", "Hario V60 02", "Moccamaster KBG"],
        grinders: ["Niche Zero", "Comandante C40"]
    )

    /// A page of coffees spanning several brewing methods — backs the coffee tab
    /// in previews and the debug gallery.
    static let coffeeRecipes = [
        LibraryRecipe(id: "espresso", title: "Espresso Brésil Santa Lúcia", type: .coffee, category: .drink, method: .espresso, favorite: true, versionCount: 5, toTestCount: 1, bestRating: 5, updatedAt: Date()),
        LibraryRecipe(id: "flat-white", title: "Flat white du matin", type: .coffee, category: .drink, method: .flatWhite, favorite: false, versionCount: 2, toTestCount: 0, bestRating: 4, updatedAt: Date().addingTimeInterval(-2 * 86_400)),
        LibraryRecipe(id: "bialetti", title: "Bialetti 3 tasses", type: .coffee, category: .drink, method: .moka, favorite: false, versionCount: 1, toTestCount: 0, bestRating: 3, updatedAt: Date().addingTimeInterval(-9 * 86_400)),
        LibraryRecipe(id: "v60", title: "V60 Éthiopie Guji", type: .coffee, category: .drink, method: .v60, favorite: true, versionCount: 2, toTestCount: 0, bestRating: 5, updatedAt: Date().addingTimeInterval(-12 * 86_400)),
        LibraryRecipe(id: "chemex", title: "Chemex du dimanche", type: .coffee, category: .drink, method: .chemex, favorite: false, versionCount: 3, toTestCount: 1, bestRating: 4, updatedAt: Date().addingTimeInterval(-38 * 86_400)),
        LibraryRecipe(id: "moccamaster", title: "Moccamaster 1 L", type: .coffee, category: .drink, method: .drip, favorite: false, versionCount: 1, toTestCount: 0, bestRating: nil, updatedAt: Date().addingTimeInterval(-41 * 86_400)),
        LibraryRecipe(id: "french-press", title: "French press dosage double", type: .coffee, category: .drink, method: .frenchPress, favorite: false, versionCount: 2, toTestCount: 0, bestRating: 3, updatedAt: Date().addingTimeInterval(-44 * 86_400)),
    ]

    // MARK: - Fresh import (nothing rated yet, v1 never tried)

    /// A just-imported recipe: a single untried v1, nothing rated yet. The recipe sheet
    /// must still render (via `versionToOpen`, which falls back to the latest
    /// version) and keep its record CTA.
    static let freshImportV1 = RecipeVersion(
        number: 1, basedOn: nil, change: nil, why: nil, originKind: .import,
        originDetail: "Importée par photo",
        content: .dish(ingredients: bourguignonIngredients, steps: bourguignonSteps),
        recipeId: "fresh-import",
        rating: nil,
        remarks: nil,
        executedAt: nil,
        photoUrl: nil,
        createdAt: date,
        updatedAt: date
    )

    static let freshImport = Recipe(
        id: "fresh-import",
        title: "Daube provençale",
        type: .dish,
        category: .main,
        favorite: false,
        versions: [freshImportV1],
        bestRating: nil,
        versionToOpen: freshImportV1
    )

    // MARK: - Transient models

    /// The full proposal of v5: the base v4 lists with a longer cooking time and
    /// a touch less bouillon — a couple of rows differ from the base for the diff.
    static let proposal = Proposal(
        basedOn: 4,
        changeSummary: "Bouillon 50 → 40 cl, cuisson 3 h 30 → 4 h",
        rationale: "La sauce reste un peu liquide et la viande gagnerait à confire plus longtemps ; réduire le bouillon et allonger la cuisson devrait concentrer les arômes.",
        content: .dish(
            ingredients: [
                Ingredient(name: "Bœuf (paleron)", quantity: "1,2 kg"),
                Ingredient(name: "Lardons", quantity: "200 g"),
                Ingredient(name: "Oignons", quantity: "2"),
                Ingredient(name: "Carottes", quantity: "3"),
                Ingredient(name: "Vin rouge", quantity: "75 cl"),
                Ingredient(name: "Bouillon", quantity: "40 cl"),
                Ingredient(name: "Farine", quantity: "30 g"),
                Ingredient(name: "Bouquet garni", quantity: "1"),
            ],
            steps: [
                "Saisir le bœuf sur toutes les faces, réserver.",
                "Faire revenir lardons, oignons et carottes.",
                "Singer avec la farine, mélanger.",
                "Mouiller au vin et au bouillon, ajouter le bouquet garni.",
                "Cuire à couvert 4 h.",
            ]
        ),
        // The base v4 tip kept, plus one the remarks asked for — the second row is
        // the one the diff marks.
        tips: [
            "Servir avec des tagliatelles fraîches ou une purée maison.",
            "Sortir la viande du réfrigérateur 1 h avant de la saisir.",
        ]
    )

    /// The Thermomix counterpart of `proposal`: the step texts are the base's word
    /// for word, only one step's machine settings move (14 → 16 min) along with the
    /// bouillon — the case where a change lives entirely in the settings.
    static let proposalThermomix = Proposal(
        basedOn: 2,
        changeSummary: "Bouillon 650 → 600 ml, cuisson du riz 14 → 16 min",
        rationale: "Le riz reste un peu ferme et le risotto un peu liquide ; moins de bouillon et deux minutes de plus devraient l’affiner.",
        content: .thermomix(
            ingredients: risottoIngredients.map {
                $0.name == "Bouillon" ? Ingredient(name: $0.name, quantity: "600 ml") : $0
            },
            steps: risottoSteps.map {
                $0.text == "Ajouter le bouillon, cuire."
                    ? ThermomixStep(
                        text: $0.text,
                        settings: ThermomixSettings(
                            time: "16 min", temperature: "100 °C", speed: "1", reverse: true
                        )
                    )
                    : $0
            }
        )
    )

    /// A coffee proposal, and the one-variable rule made visible: the summary names
    /// a single change, and the rationale says what is being held back for the next
    /// version rather than piling it on now.
    static let proposalCoffee = Proposal(
        basedOn: 2,
        changeSummary: "Température 94 → 92°C",
        rationale: "La tasse est encore un peu astringente : baisser la température seule dit si c’est bien l’extraction. Si ça ne suffit pas, on desserrera la mouture à l’itération suivante.",
        // Built off v2 (the version it iterates on), so the only thing that moves is
        // the temperature — exactly what the rule promises. The water it was never
        // told about stays empty: the model proposes the field, not a value.
        content: .coffee(
            parameters: CoffeeParameters(
                beans: v60Parameters.beans,
                water: CoffeeWaterSpec(kind: "Volvic", amount: "300 g", temperature: "92°C"),
                extraction: CoffeeExtraction(grind: "fine", time: "3 min 15", cupYield: "300 g"),
                milk: nil,
                gear: v60Parameters.gear
            )
        ),
        tips: ["Rincer le filtre à l’eau chaude avant de doser."]
    )

    static let importAnalysis = CookingImportAnalysis(
        title: "Cookies aux noix de pécan",
        type: .dish,
        category: .dessert,
        ingredients: [
            Ingredient(name: "Beurre", quantity: "170 g"),
            Ingredient(name: "Cassonade", quantity: "200 g"),
            Ingredient(name: "Farine", quantity: "280 g"),
            Ingredient(name: "Œuf", quantity: "1"),
            Ingredient(name: "Noix de pécan", quantity: "100 g"),
        ],
        steps: [
            "Crémer le beurre et la cassonade.",
            "Incorporer l’œuf puis les poudres.",
            "Ajouter les noix de pécan torréfiées.",
            "Cuire 12 min à 180 °C.",
        ].map { ImportStep(text: $0, thermomix: .plain) },
        tips: [
            "Réserver la pâte 1 h au frais avant de former les boules.",
            "Se congèlent crus, à cuire sans décongeler.",
        ],
        sourceLabel: "Photo du livre « Biscuits »"
    )

    static let importAnalysisThermomix = CookingImportAnalysis(
        title: "Risotto au parmesan",
        type: .thermomix,
        category: .main,
        ingredients: risottoIngredients,
        steps: risottoSteps.map { ImportStep(text: $0.text, thermomix: $0.settings) },
        sourceLabel: "Photo du livre Thermomix"
    )

    /// What the coffee flow reads off a bag: the dials it could see, and holes
    /// where the source said nothing.
    static let importAnalysisCoffee = CoffeeImportAnalysis(
        title: "V60 Éthiopie Guji",
        method: .v60,
        parameters: v60Parameters,
        tips: ["Rincer le filtre à l’eau chaude avant de doser."],
        sourceLabel: "Photo du sachet"
    )

    /// A bag photographed with nothing else on it: the dose and the beans, and every
    /// other field left for the cook — what the preview looks like at its emptiest.
    static let importAnalysisCoffeeSparse = CoffeeImportAnalysis(
        title: "Belleville — Guji",
        method: .espresso,
        parameters: CoffeeParameters(
            beans: CoffeeBeans(
                name: "Belleville — Guji", country: "Éthiopie", producer: nil,
                roast: nil, roastedOn: nil, dose: "18 g"
            ),
            // Deduced from the dose at the method's ratio — the one thing the AI
            // may compute rather than read.
            water: CoffeeWaterSpec(kind: nil, amount: "36 g", temperature: nil),
            extraction: .empty,
            milk: nil,
            gear: .empty
        ),
        tips: [],
        sourceLabel: nil
    )

    /// A milk drink: the milk block is open from the start, type and brand in one
    /// field.
    static let importAnalysisCoffeeMilk = CoffeeImportAnalysis(
        title: "Flat white maison",
        method: .flatWhite,
        parameters: CoffeeParameters(
            beans: CoffeeBeans(
                name: "Belleville — Guji", country: nil, producer: nil,
                roast: nil, roastedOn: nil, dose: "18 g"
            ),
            water: CoffeeWaterSpec(kind: nil, amount: "36 g", temperature: nil),
            extraction: CoffeeExtraction(grind: "fine", time: "28 s", cupYield: "36 g"),
            milk: CoffeeMilk(kind: "Avoine Oatly", amount: "150 ml", temperature: "65°C"),
            gear: CoffeeGear(machine: "Rancilio Silvia", grinder: nil)
        ),
        tips: [],
        sourceLabel: nil
    )

    /// A page of library rows spanning both cooking types and a couple of months —
    /// backs the paginated notebook list in previews and the debug gallery.
    static let libraryRecipes = [
        LibraryRecipe(id: "bourguignon", title: "Bœuf bourguignon", type: .dish, category: .main, favorite: true, versionCount: 4, toTestCount: 1, bestRating: 5, updatedAt: Date()),
        LibraryRecipe(id: "joues", title: "Joues de bœuf confites", type: .dish, category: .main, favorite: false, versionCount: 1, toTestCount: 0, bestRating: 4, updatedAt: Date().addingTimeInterval(-3 * 86_400)),
        LibraryRecipe(id: "risotto", title: "Risotto au parmesan", type: .thermomix, category: .main, favorite: false, versionCount: 2, toTestCount: 1, bestRating: 4, updatedAt: Date().addingTimeInterval(-40 * 86_400)),
        LibraryRecipe(id: "veloute", title: "Velouté de courge", type: .thermomix, category: .soup, favorite: true, versionCount: 1, toTestCount: 0, bestRating: nil, updatedAt: Date().addingTimeInterval(-45 * 86_400)),
    ]
}
#endif
