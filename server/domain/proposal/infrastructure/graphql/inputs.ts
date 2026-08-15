import { VersionContentInput } from '~/domain/recipe/infrastructure/graphql/inputs'
import { builder } from '~/domain/shared/graphql/builder'

// The full next-version proposal the client sends back on accept. It carries the
// AI's (possibly user-edited) content plus its summary, rationale and the version it
// iterates on — send the COMPLETE next version, never a partial edit.
export const ProposalInput = builder.inputType('ProposalInput', {
  description:
    'A complete next-version proposal to accept as an iteration, e.g. the AI’s ' +
    '`"Less sugar, longer resting time"` proposal. Send the FULL next version (an omitted ' +
    'ingredient/step wipes that list).',
  fields: (t) => ({
    basedOn: t.field({
      type: 'VersionNumber',
      required: true,
      description:
        'The version this iterates on — echo back the `basedOn` from the proposal, e.g. `2`',
    }),
    changeSummary: t.field({
      type: 'String',
      required: true,
      description: 'A short human summary of what the next version changes, e.g. `"Less sugar"`',
    }),
    rationale: t.field({
      type: 'String',
      required: true,
      description: 'The reasoning behind the change, e.g. `"You noted it was too sweet"`',
    }),
    content: t.field({
      type: VersionContentInput,
      required: true,
      description:
        'The complete body of the next version — provide exactly one of `dish` or `thermomix`, ' +
        'matching the recipe type',
    }),
    tips: t.field({
      type: ['Tip'],
      required: true,
      defaultValue: [],
      description:
        'The complete tips list of the next version — echo back the proposal’s `tips` (with ' +
        'any edits), e.g. `["Serve over rice"]`; send `[]` when it has none',
    }),
    // The version being created has already been made — see the field description.
    cooked: t.boolean({
      description:
        'Whether you have ALREADY made this version — send `true` for a proposal that came ' +
        'from requestChange, where you changed the recipe at the stove and ate the result. It ' +
        'is then saved as a version that has been cooked (never on the to-cook list), the ' +
        'rating/remarks/photo below are recorded ON IT, and the version it iterates on ' +
        '(`basedOn`) is left untouched. Defaults to `false`: a suggestion nobody has cooked yet',
    }),
    // The cook that came with this version, when there was one. Recorded on
    // `basedOn` — the version that cook was made from — or on the version being
    // created when `cooked` says that IS the one that was made. Both are left out
    // when the proposal answers an improvement instead of a cook.
    rating: t.field({
      type: 'Rating',
      description:
        'How the cook turned out, `1` to `5`, e.g. `3`. Recorded on the version you cooked — ' +
        '`basedOn`, or this new one when `cooked` is `true` (leave out when the proposal came ' +
        'from requestImprovement)',
    }),
    remarks: t.field({
      type: 'Remarks',
      description:
        'What you noticed on that cook, e.g. `"Still a touch too sweet"` — the remarks this ' +
        'version answers (leave out when the proposal came from requestImprovement)',
    }),
    // Placeholder, same as RecordAttemptInput.photo: accepted but not yet stored.
    photo: t.string({
      description: 'Base64 JPEG of that cook, e.g. `"/9j/4AAQSkZJRg…"` (optional; not yet stored)',
    }),
  }),
})
