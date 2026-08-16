import { limitOf, remaining, renewsOn, used } from '~/domain/quota/business-rules'
import type { AiAction, Quota } from '~/domain/quota/types'
import { builder } from '~/domain/shared/graphql/builder'
import type { Plan } from '~/domain/shared/types'
import { PlanEnum } from './enums'

// One meter, read for the plan in force. `limit` and `remaining` are absent on an
// unlimited plan — the domain says "no limit" by absence, GraphQL says it with
// `null`, and the two are bridged here (the only place they meet).
type QuotaCounter = { used: number; limit?: number; remaining?: number }

const counterOf = (plan: Plan, quota: Quota, action: AiAction): QuotaCounter => ({
  used: used(quota, action),
  limit: limitOf(plan, action),
  remaining: remaining(plan, quota, action),
})

// What the `quota` query answers: the plan, and this month's consumption under it.
export type QuotaState = { plan: Plan; quota: Quota }

const QuotaCounterType = builder.objectRef<QuotaCounter>('QuotaCounter').implement({
  description:
    'One AI meter for the current month — what has been spent and what is left, e.g. `1` import ' +
    'used out of `3`',
  fields: (t) => ({
    used: t.exposeInt('used', {
      description: 'How many were spent this month, e.g. `1`',
    }),
    limit: t.int({
      nullable: true,
      description: 'How many the plan allows per month, e.g. `3` — `null` on an unlimited plan',
      resolve: ({ limit }) => limit ?? null,
    }),
    remaining: t.int({
      nullable: true,
      description:
        'How many are still available this month, e.g. `2` — `null` on an unlimited plan',
      resolve: ({ remaining }) => remaining ?? null,
    }),
  }),
})

export const QuotaType = builder.objectRef<QuotaState>('Quota').implement({
  description:
    'Your AI allowance for the current calendar month. Recipes and versions are never limited: ' +
    'only the calls to the AI are, and they reset on the 1st.',
  fields: (t) => ({
    plan: t.field({
      type: PlanEnum,
      description: 'The plan in force, e.g. `FREE`',
      resolve: ({ plan }) => plan,
    }),
    imports: t.field({
      type: QuotaCounterType,
      description: 'Recipe imports analyzed by the AI this month (photos, text or URL)',
      resolve: ({ plan, quota }) => counterOf(plan, quota, 'import'),
    }),
    iterations: t.field({
      type: QuotaCounterType,
      description:
        'AI calls made on an existing recipe this month — a proposal, an improvement or a tips ' +
        'merge',
      resolve: ({ plan, quota }) => counterOf(plan, quota, 'iteration'),
    }),
    renewsOn: t.field({
      type: 'DateTime',
      description:
        'When both meters go back to zero — the 1st of next month, e.g. ' +
        '`"2026-08-01T00:00:00.000Z"`',
      resolve: ({ quota }) => renewsOn(quota.month),
    }),
  }),
})
