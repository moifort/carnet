import XCTest

/// Experimentation loop under the derived recipe model: import a recipe, record an
/// attempt on the version the recipe sheet opens on, add a written remark to trigger the AI
/// proposal, accept it, and see the freshly appended version become the one the
/// recipe sheet shows. No promotion, no "à tester" banner — the new version is derived.
final class AttemptLoopFlowTest: BaseUITest {

    func testAttemptToProposalToNewVersion() async throws {
        let tabBar = TabBarPage(app: app)
        try tabBar.verify()

        // 1. Seed a recipe through the import flow.
        let importPage = try tabBar.goToImport()
        _ = try importPage.typeRecipe("Sauce tomate : 400 g de tomates pelées, 1 gousse d'ail, 2 c. à soupe d'huile d'olive, basilic, sel. Mijoter 20 min.")
        let recipe = try importPage.analyze().verify().save()
        try recipe.verify()

        // 2. The fresh recipe opens on v1; record an attempt on the displayed version
        //    via the round centre CTA.
        let capture = try recipe.recordAttempt().verify()

        // 3. A written remark asks the AI for the next version to try (the rating
        //    itself no longer matters; the remark is what requests a proposal).
        _ = try capture.pickStars(3)
        _ = try capture.typeRemarks("Coule trop vite, amertume sèche en finale.")
        try capture.save()

        // 4. The proposal appears — accept it as the next iteration.
        let proposal = ProposalPage(app: app)
        try proposal.verify()
        try proposal.validate()

        // 5. Back on the recipe sheet, the appended v2 (basedOn v1) is now the version shown.
        try recipe.verifyVersion(2)
    }
}
