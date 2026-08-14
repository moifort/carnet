import SwiftUI

/// The recipe sheet, iOS Photos style: header badges (type + version), the
/// ingredients and the best-rated version step by step. Attempts live in the
/// history. Navigation and mutations are owned by `RecipeDetailView`.
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
    /// Opens the oven-profile editor. nil hides the section's edit action — the
    /// execution mode reads the settings, it does not rewrite them.
    var onEditOven: (() -> Void)? = nil
    /// The connected oven's CTA. nil when this account owns no oven, and the
    /// section then shows the settings alone.
    var ovenStart: OvenProfileSection.Start? = nil
    /// Opens the picker that says which recipe an ingredient line IS, by its index in
    /// the displayed version's list. nil (the default) leaves the list read-only.
    var onLinkComponent: ((Int) -> Void)? = nil
    /// Opens the editor of the displayed version's shopping list. Nil leaves it
    /// read-only.
    var onEditIngredients: (() -> Void)? = nil
    /// Opens the editor of the displayed version's method. Nil leaves it read-only —
    /// and a coffee, which has no steps, never gets it.
    var onEditSteps: (() -> Void)? = nil
    /// Opens the editor of the displayed version's tips. Nil leaves them read-only.
    var onEditTips: (() -> Void)? = nil

    /// Ephemeral quantity scaling of the ingredient list — lives only while the
    /// sheet is open, the stored version is never rewritten. Only the plain sheet
    /// scales; a focused attempt shows its version's exact quantities.
    @State private var scaleFactor: Double = 1

    /// The version the recipe sheet presents: the focused attempt version when set,
    /// otherwise the recipe's `versionToOpen`.
    private var displayedVersion: RecipeVersion {
        focusVersion ?? recipe.versionToOpen
    }

    var body: some View {
        List {
            // Recipe-level cautions open the sheet in BOTH modes — a version under
            // focus is still the recipe they guard.
            WarningsBanner(warnings: recipe.warnings)
            header
            changeCard

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
                    scale: focusVersion == nil ? $scaleFactor : nil,
                    onLink: onLinkComponent,
                    onEdit: onEditIngredients
                )
            }
            // An espresso is wholly described by its parameters: no empty "steps"
            // section is rendered for it.
            if !displayedVersion.content.stepTexts.isEmpty || onEditSteps != nil {
                ReferenceVersionSection(
                    version: displayedVersion,
                    modified: modifiedSteps,
                    onEdit: onEditSteps
                )
            }
            // The oven the version bakes in — absent entirely on a dish that never
            // sees one, which is most of them.
            ovenSection
            TipsSection(tips: displayedVersion.tips, onEdit: onEditTips)
        }
        .listSectionSpacing(5)
        // The factor never survives a version switch: the sheet lands back on the
        // stored quantities of whatever version it now shows.
        .onChange(of: displayedVersion.number) { scaleFactor = 1 }
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
                onEdit: onEditOven,
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
