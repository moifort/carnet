import Apollo
import ApolloAPI
import Foundation

enum ProposalAPI {
    /// Accept the proposal as an iteration. The proposal FULLY REPLACES the
    /// next version — the lists are complete, not partial. `basedOn` is echoed back
    /// so the new version records what it was built from, and the attempt that came
    /// with it (rating, remarks, photo) is recorded on the version that was actually
    /// cooked: the one it iterates on, or the version created when `cooked` says the
    /// cook already made THAT one. No attempt means the proposal answers an
    /// improvement: the version created lands on the to-cook list instead.
    ///
    /// Answers the number of the version it created — what a flow chaining a second
    /// request onto it iterates from.
    @discardableResult
    static func accept(
        recipeId: String,
        proposal: ProposalEdit,
        attempt: Attempt?,
        cooked: Bool = false
    ) async throws -> Int? {
        let input = ShuhariGraphQL.ProposalInput(
            basedOn: proposal.basedOn,
            changeSummary: proposal.changeSummary,
            content: GraphQLHelpers.versionContentInput(proposal.content),
            cooked: .some(cooked),
            photo: GraphQLHelpers.graphQLNullable(attempt?.photoBase64),
            rating: GraphQLHelpers.graphQLNullable(attempt?.rating),
            rationale: proposal.rationale,
            remarks: GraphQLHelpers.graphQLNullable(attempt?.remarks),
            tips: proposal.tips
        )

        let data = try await GraphQLHelpers.perform(
            GraphQLClient.shared.apollo,
            mutation: ShuhariGraphQL.AcceptProposalMutation(recipeId: recipeId, proposal: input)
        )
        return data.acceptProposal.createdVersion
    }

    /// Ask the AI to write down a change the cook has ALREADY made and ALREADY
    /// eaten. It applies exactly what they describe — it improves nothing — and the
    /// version it returns is accepted with `cooked: true`, so it is saved as one
    /// that has been made rather than one to test. Nothing is saved before that.
    static func requestChange(
        recipeId: String,
        versionNumber: Int,
        change: String
    ) async throws -> Proposal {
        let data = try await GraphQLHelpers.perform(
            GraphQLClient.shared.apollo,
            mutation: ShuhariGraphQL.RequestChangeMutation(
                recipeId: recipeId,
                versionNumber: versionNumber,
                change: change
            )
        )
        return mapProposal(data.requestChange.fragments.proposalFields)
    }

    /// Ask the AI for a next version answering what the cook wants improved. Nothing
    /// is saved: the proposal is reviewed, then accepted (or dropped).
    static func requestImprovement(
        recipeId: String,
        versionNumber: Int,
        improvement: String
    ) async throws -> Proposal {
        let data = try await GraphQLHelpers.perform(
            GraphQLClient.shared.apollo,
            mutation: ShuhariGraphQL.RequestImprovementMutation(
                recipeId: recipeId,
                versionNumber: versionNumber,
                improvement: improvement
            )
        )
        return mapProposal(data.requestImprovement.fragments.proposalFields)
    }

    /// Ask the AI to fold the tips the cook just typed into the version's own tips —
    /// reworded, merged, deduplicated. Nothing is saved: the complete list comes back
    /// to review, and accepting it goes through `updateTips`.
    static func requestTips(
        recipeId: String,
        versionNumber: Int,
        tips: String
    ) async throws -> [String] {
        let data = try await GraphQLHelpers.perform(
            GraphQLClient.shared.apollo,
            mutation: ShuhariGraphQL.RequestTipsMutation(
                recipeId: recipeId,
                versionNumber: versionNumber,
                tips: tips
            )
        )
        return data.requestTips.tips
    }

    /// Replace one version's tips with this complete list. No version is created:
    /// the tips are the one part of a version, beside its outcome, that is rewritten
    /// in place.
    static func updateTips(recipeId: String, versionNumber: Int, tips: [String]) async throws {
        _ = try await GraphQLHelpers.perform(
            GraphQLClient.shared.apollo,
            mutation: ShuhariGraphQL.UpdateTipsMutation(
                recipeId: recipeId,
                versionNumber: versionNumber,
                tips: tips
            )
        )
    }
}
