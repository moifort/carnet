import { OvenUseCase } from '~/domain/oven/use-case'
import { builder } from '~/domain/shared/graphql/builder'
import { OvenType } from './types'

builder.queryField('oven', (t) =>
  t.field({
    type: OvenType,
    nullable: true,
    description: [
      'The connected oven, or `null` when this account has none — which is how the app knows to ' +
        'show no oven controls at all. `null` is deliberately not an error: an account without ' +
        'an oven is not a failed request, it is a smaller app.',
      '',
      'Ask before offering to start a cooking: `reachable` tells you the appliance answered, ' +
        '`remoteControlEnabled` that it is willing to be driven, `running` what it is already ' +
        'doing.',
      '',
      '```graphql',
      'oven {',
      '  reachable',
      '  remoteControlEnabled',
      '  running { program remaining }',
      '}',
      '```',
    ].join('\n'),
    resolve: async (_root, _args, { userId }) => {
      const state = await OvenUseCase.state(userId)
      return state === 'oven-unavailable' ? null : state
    },
  }),
)
