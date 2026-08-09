import { match, P } from 'ts-pattern'
import { OvenUseCase } from '~/domain/oven/use-case'
import { builder } from '~/domain/shared/graphql/builder'
import { domainError } from '~/domain/shared/graphql/errors'
import { OvenType } from './types'

builder.mutationField('startOven', (t) =>
  t.field({
    type: OvenType,
    description: [
      'Start this version’s cooking on the connected oven. What is sent is the oven profile the ' +
        'VERSION carries — never one passed in here: correcting a setting before cooking means ' +
        'editing the version, so what the oven does and what the notebook says can never ' +
        'disagree.',
      '',
      'Answers `OVEN_UNAVAILABLE` when the account has no oven, `NO_OVEN_PROFILE` when the ' +
        'version never bakes, `OVEN_OFFLINE` when the appliance does not answer, ' +
        '`REMOTE_CONTROL_DISABLED` until "remote operation" is switched on from the oven’s own ' +
        'screen, and `OVEN_BUSY` when it is already cooking.',
      '',
      '```graphql',
      'startOven(recipeId: "…", version: 2) {',
      '  running { program temperature remaining }',
      '}',
      '```',
    ].join('\n'),
    args: {
      recipeId: t.arg({
        type: 'RecipeId',
        required: true,
        description: 'Which recipe, e.g. the id of `"Quiche fine"`',
      }),
      version: t.arg({
        type: 'VersionNumber',
        required: true,
        description: 'Which attempt in the chain to cook, e.g. `2`',
      }),
    },
    resolve: async (_root, { recipeId, version }, { userId }) => {
      const result = await OvenUseCase.start(userId, recipeId, version)
      return match(result)
        .with('oven-unavailable', domainError)
        .with('no-oven-profile', domainError)
        .with('oven-offline', domainError)
        .with('remote-control-disabled', domainError)
        .with('oven-busy', domainError)
        .with(P.not(P.string), (state) => state)
        .exhaustive()
    },
  }),
)
