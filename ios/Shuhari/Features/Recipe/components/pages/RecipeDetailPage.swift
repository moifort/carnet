import SwiftUI

/// The recipe sheet, iOS Photos style: header badges (type + version), the
/// ingredients and the best-rated version step by step. Attempts live in the
/// history. Navigation and mutations are owned by `RecipeDetailView`.
///
/// It is a page to read: nothing on it corrects the recipe, and a section the
/// version carries nothing for is not rendered at all. Writing goes through
/// `RecipeEditSheet`, which the menu opens — one door in, so the sheet stays a
/// recipe and not a form. The one exception is the ephemeral resizing of the
/// quantities, a lens on what is stored rather than a write.
struct RecipeDetailPage: View {
    let recipe: Recipe
    /// When set, the recipe sheet renders THIS version instead of the best-rated one —
    /// the attempt view. Nil (the default) keeps the recipe sheet strictly unchanged.
    var focusVersion: RecipeVersion? = nil
    /// Ingredient names changed vs the previous version → orange dot.
    var modifiedIngredients: Set<String> = []
    /// Step indices changed vs the previous version → orange dot.
    var modifiedSteps: Set<Int> = []
    /// The change summary and rationale of the focused version, shown in the
    /// change card atop an attempt recipe sheet.
    var change: String? = nil
    var why: String? = nil
    /// The connected oven's CTA. nil when this account owns no oven, and the
    /// section then shows the settings alone.
    var ovenStart: OvenProfileSection.Start? = nil
    /// The recipes this one is made of, and the ones made of it — the two relation
    /// sections at the top of the sheet. Empty (the default) renders neither.
    var linkedRecipes: [LinkedRecipesSection.Item] = []
    var usedBy: [UsedBySection.Item] = []
    /// Opens a recipe on either side of a link — the coordinator is what knows at
    /// which weight. nil leaves both sections untappable, which is what the previews
    /// pass.
    var onOpenRelated: ((_ id: String) -> Void)? = nil
    /// Reopens the weight step, and lets go of a link. nil keeps the linked section
    /// read-only.
    var onEditWeight: ((_ id: String) -> Void)? = nil
    var onUnlink: ((_ id: String) -> Void)? = nil

    /// The weight the sheet opens at: 1 on a recipe opened on its own, the link's
    /// weight on one opened from the recipe that uses it. It is what "Réinitialiser"
    /// goes back to — landing on the stored quantities would drop what was asked for.
    var openedAt: Double = 1

    /// Ephemeral quantity scaling of the ingredient list — lives only while the
    /// sheet is open, the stored version is never rewritten. It holds on whichever
    /// version is on screen: a version waiting to be cooked is precisely the one a
    /// cook resizes, and the header says loudly enough (badge, tint, "Réinitialiser")
    /// that the list no longer reads as what the version stores.
    @State private var scaleFactor: Double = 1

    /// The version the recipe sheet presents: the focused attempt version when set,
    /// otherwise the recipe's `versionToOpen`.
    private var displayedVersion: RecipeVersion {
        focusVersion ?? recipe.versionToOpen
    }

    var body: some View {
        List {
            // The cautions of the version being read: they are carried from one
            // iteration to the next, so the banner follows what is on screen.
            WarningsBanner(warnings: displayedVersion.warnings)
            header
            changeCard
            // What this recipe is made of, then what is made of it — both above the
            // shopping list, because they say what the sheet below is part of.
            LinkedRecipesSection(
                items: linkedRecipes,
                onOpen: { onOpenRelated?($0) },
                onEditWeight: onEditWeight,
                onUnlink: onUnlink
            )
            UsedBySection(items: usedBy, onOpen: { onOpenRelated?($0) })

            // A coffee is set by parameters, everything else by an ingredient list.
            if let parameters = displayedVersion.content.coffeeParameters {
                CoffeeParametersSection(
                    parameters: parameters,
                    restDays: displayedVersion.restDays
                )
            } else {
                IngredientsSection(
                    ingredients: displayedVersion.ingredients,
                    modified: modifiedIngredients,
                    compactHeader: focusVersion == nil,
                    scale: $scaleFactor,
                    resetsTo: openedAt
                )
            }
            // An espresso is wholly described by its parameters: no empty "steps"
            // section is rendered for it.
            ReferenceVersionSection(version: displayedVersion, modified: modifiedSteps)
            // The oven the version bakes in — absent entirely on a dish that never
            // sees one, which is most of them.
            ovenSection
            TipsSection(tips: displayedVersion.tips)
        }
        .listSectionSpacing(5)
        // The sheet opens at the weight it was reached at — the link's, or the
        // recipe's own quantities when it was opened on its own.
        .onAppear { scaleFactor = openedAt }
        // The factor never survives a version switch: the sheet lands back on the
        // quantities it opened at, for whatever version it now shows.
        .onChange(of: displayedVersion.number) { scaleFactor = openedAt }
        .contentMargins(.top, 0, for: .scrollContent)
        .scrollEdgeEffectStyle(.soft, for: .top)
        .navigationBarTitleDisplayMode(.inline)
        // The Photos-style centre pill: recipe title (bold) over its date, same small
        // size, in a glass capsule.
        .toolbar {
            ToolbarItem(placement: .principal) {
                VStack(spacing: 1) {
                    Text(recipe.title)
                        .font(.footnote.bold())
                        .lineLimit(1)
                    Text(dateLabel)
                        .font(.footnote)
                        .lineLimit(1)
                }
                .padding(.horizontal, Theme.Spacing.l)
                .padding(.vertical, Theme.Spacing.s)
                .glassEffect(.regular, in: .capsule)
                .accessibilityElement(children: .combine)
            }
        }
    }

    // MARK: - Oven

    // The oven settings, formatted here: the page is what knows how to write a
    // temperature in French, the section only lays out already-written values.
    @ViewBuilder
    private var ovenSection: some View {
        if let oven = displayedVersion.content.oven {
            OvenProfileSection(
                item: .init(
                    // An assisted cooking is named by the dish it runs.
                    program: oven.program.label(assisted: oven.assisted),
                    programIcon: oven.program.iconName,
                    temperature: "\(oven.temperature) °C",
                    duration: oven.duration.map { "\($0) min" },
                    core: oven.core.map { "\($0) °C" }
                ),
                // The oven refuses its own programmes as a command, so this cooking
                // is never started from here — the CTA gives way to the programme to
                // select on the appliance.
                start: oven.program == .assisted ? nil : ovenStart,
                onAppliance: ovenStart != nil ? startOnAppliance(oven) : nil
            )
        }
    }

    /// What to select on the oven for a cooking the app cannot start. nil for every
    /// heating function, which the CTA starts itself. Named when the programme is
    /// known, so the cook looks for the same words the sheet shows above.
    private func startOnAppliance(_ oven: OvenProfile) -> String? {
        guard oven.program == .assisted else { return nil }
        let name = oven.program.label(assisted: oven.assisted)
        guard name != OvenProgram.assisted.label else {
            return "Cette cuisson assistée se lance sur l’écran du four."
        }
        return "Sélectionne « \(name) » sur l’écran du four."
    }

    /// When the displayed version was last worked on, e.g. "12 juin 2025" — the date
    /// follows the version shown, so switching versions changes it, and correcting a
    /// version updates it.
    private var dateLabel: String {
        displayedVersion.updatedAt.formatted(.dateTime.day().month(.abbreviated).year())
    }

    // MARK: - Change card

    // What the focused version changes and why — the very card the AI proposal
    // showed before it was accepted. Only in focus mode: the plain recipe sheet
    // renders nothing.
    @ViewBuilder
    private var changeCard: some View {
        if focusVersion != nil {
            ChangeSummaryCard(summary: change, rationale: why)
        }
    }

    // MARK: - Header

    // The badges + rating line: a normal list row, so it scrolls with the page and
    // fades under the soft scroll edge. It sits right under the title pill in both
    // modes — a focused version still says which type, which number and how it was
    // rated, before the card saying what it changes. The stars are the displayed
    // version's own rating, not a recipe-wide average: a version never cooked shows none.
    private var header: some View {
        Section {
            VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                HStack {
                    RecipeHeaderBadges(
                        type: recipe.type,
                        versionNumber: displayedVersion.number,
                        toTestCount: recipe.versionsToTest.count,
                        methodLabel: recipe.method?.label,
                        methodIcon: recipe.method?.iconImage
                    )
                    Spacer(minLength: Theme.Spacing.s)
                    if let rating = displayedVersion.rating {
                        RatingStars(rating: Double(rating))
                    }
                }
            }
            .listRowInsets(EdgeInsets(top: -1, leading: 0, bottom: -1, trailing: 0))
            .listRowBackground(Color.clear)
            .listRowSeparator(.hidden)
        }
    }
}

#if DEBUG
#Preview("Plat — ouvre la mieux notée") {
    NavigationStack {
        RecipeDetailPage(recipe: Fixtures.bourguignon)
    }
}

#Preview("Thermomix — bannière d’avertissement") {
    NavigationStack {
        RecipeDetailPage(recipe: Fixtures.risotto)
    }
}

#Preview("Essai — v3 focalisée") {
    NavigationStack {
        RecipeDetailPage(
            recipe: Fixtures.bourguignon,
            focusVersion: Fixtures.bourguignonV3,
            modifiedIngredients: ["Vin rouge"],
            modifiedSteps: [],
            change: Fixtures.bourguignonV3.change,
            why: Fixtures.bourguignonV3.why
        )
    }
}
#endif
