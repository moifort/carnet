import type { OvenRun, OvenSettings, OvenState } from '~/domain/oven/types'
import { OvenProgramEnum } from '~/domain/recipe/infrastructure/graphql/enums'
import { builder } from '~/domain/shared/graphql/builder'

export const OvenSettingsType = builder.objectRef<OvenSettings>('OvenSettings').implement({
  description:
    'What the oven’s dials are set to RIGHT NOW — whatever it is doing, and whoever turned them, ' +
    'including you standing in front of it. This is what the app copies when you dial a cooking ' +
    'in on the oven and want the recipe to remember it.\n\nPlain `Int`s, unlike a version’s ' +
    'branded oven dials: these are the appliance’s readings, not what a cook wrote down, and a ' +
    'stray one must not fail the query that only meant to display them.',
  fields: (t) => ({
    program: t.field({
      type: OvenProgramEnum,
      nullable: true,
      description:
        'The heating function selected, e.g. `CONVECTION`. `null` when the oven is set to ' +
        'something this notebook has no word for — a cleaning cycle, or one of the model’s own ' +
        'combinations.',
      resolve: ({ program }) => program ?? null,
    }),
    assisted: t.expose('assisted', {
      type: 'AssistedProgram',
      nullable: true,
      description:
        'The oven’s own programme code when one is selected, e.g. `"ASSIST_QUICHEANDTARTETHIN"`. ' +
        'Copy it onto the version alongside `program: ASSISTED` — it is what makes that cooking ' +
        'reproducible.',
    }),
    temperature: t.int({
      nullable: true,
      description: 'The target temperature in °C, e.g. `180`',
      resolve: ({ temperature }) => temperature ?? null,
    }),
    duration: t.int({
      nullable: true,
      description: 'The cooking time set, in minutes, e.g. `25`. `null` when no timer is set.',
      resolve: ({ duration }) => duration ?? null,
    }),
    core: t.int({
      nullable: true,
      description:
        'The probe target in °C, e.g. `63`. `null` unless a probe is plugged in — the appliance ' +
        'reports the field only then.',
      resolve: ({ core }) => core ?? null,
    }),
  }),
})

export const OvenRunType = builder.objectRef<OvenRun>('OvenRun').implement({
  description:
    'A cooking under way. Only how long is left: WHAT is cooking is `settings`, and answering it ' +
    'twice would be two answers to one question.',
  fields: (t) => ({
    remaining: t.int({
      nullable: true,
      description:
        'Minutes left on the oven’s own timer, e.g. `12`. `null` on a probe cook, which ends on ' +
        'a temperature rather than a clock.',
      resolve: ({ remaining }) => remaining ?? null,
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
    settings: t.field({
      type: OvenSettingsType,
      description:
        'What the dials are set to right now — the values a recipe can copy off the oven',
      resolve: ({ settings }) => settings,
    }),
    running: t.field({
      type: OvenRunType,
      nullable: true,
      description: 'The cooking under way, or `null` when the oven is idle',
      resolve: ({ running }) => running ?? null,
    }),
  }),
})
