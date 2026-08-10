import type { OvenRun, OvenState } from '~/domain/oven/types'
import { OvenProgramEnum } from '~/domain/recipe/infrastructure/graphql/enums'
import { builder } from '~/domain/shared/graphql/builder'

export const OvenRunType = builder.objectRef<OvenRun>('OvenRun').implement({
  description:
    'A cooking under way, as the oven reports it. Plain `Int`s, unlike a version’s branded oven ' +
    'dials: these are the appliance’s own readings, and a stray one must not fail the query that ' +
    'only meant to display it.',
  fields: (t) => ({
    program: t.field({
      type: OvenProgramEnum,
      nullable: true,
      description:
        'What the oven is running, e.g. `CONVECTION`. `null` when it is running something this ' +
        'notebook has no word for — a cook can always start a programme on the oven itself.',
      resolve: (r) => r.program ?? null,
    }),
    temperature: t.int({
      nullable: true,
      description: 'The target temperature the oven reports, in °C, e.g. `180`',
      resolve: (r) => r.temperature ?? null,
    }),
    remaining: t.int({
      nullable: true,
      description:
        'Minutes left on the oven’s own timer, e.g. `12`. `null` on a probe cook, which ends on ' +
        'a temperature rather than a clock.',
      resolve: (r) => r.remaining ?? null,
    }),
  }),
})

export const OvenType = builder.objectRef<OvenState>('Oven').implement({
  description:
    'The connected oven. Everything the recipe sheet needs before offering to start a cooking: ' +
    'whether the appliance answers, whether it is willing to be driven remotely, and what it is ' +
    'already doing.',
  fields: (t) => ({
    reachable: t.exposeBoolean('reachable', {
      description: 'Whether the oven answered at all, e.g. `false` when it is unplugged',
    }),
    remoteControlEnabled: t.exposeBoolean('remoteControlEnabled', {
      description:
        'Whether the oven accepts being started remotely, e.g. `false` until "remote operation" ' +
        'is switched on from its own screen. Starting a heating element is safety relevant, so ' +
        'the appliance gates it and no API call can bypass that.',
    }),
    running: t.field({
      type: OvenRunType,
      nullable: true,
      description: 'The cooking under way, or `null` when the oven is idle',
      resolve: (o) => o.running ?? null,
    }),
  }),
})
