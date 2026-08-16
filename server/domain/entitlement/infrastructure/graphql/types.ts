import type { Entitlement } from '~/domain/entitlement/types'
import { PlanEnum } from '~/domain/quota/infrastructure/graphql/enums'
import { builder } from '~/domain/shared/graphql/builder'
import type { Plan } from '~/domain/shared/types'

// What the `entitlement` query answers. The plan is the decided answer; the rest
// exists so the app can start a purchase and show what is running.
export type EntitlementState = {
  plan: Plan
  appAccountToken: string
  entitlement?: Entitlement
}

export const EntitlementType = builder.objectRef<EntitlementState>('Entitlement').implement({
  description:
    'What you are entitled to, and what the App Store sold you to get there. Read it before ' +
    'starting a purchase: `appAccountToken` is what ties the payment back to your account.',
  fields: (t) => ({
    plan: t.field({
      type: PlanEnum,
      description: 'The plan in force right now, e.g. `PREMIUM`',
      resolve: ({ plan }) => plan,
    }),
    appAccountToken: t.exposeString('appAccountToken', {
      description:
        'The UUID to pass to StoreKit as the purchase’s account token, e.g. ' +
        '`"1f2e3d4c-5b6a-5978-8695-a4b3c2d1e0f9"`. Without it a purchase cannot be matched to ' +
        'you, and syncing it will be refused.',
    }),
    productId: t.string({
      nullable: true,
      description:
        'The subscription bought, e.g. `"com.polyforms.shuhari.app.premium.yearly"` — `null` ' +
        'when there is none',
      resolve: ({ entitlement }) => entitlement?.productId ?? null,
    }),
    expiresOn: t.field({
      type: 'DateTime',
      nullable: true,
      description:
        'When the paid period ends, e.g. `"2027-07-20T09:12:00.000Z"` — `null` when there is no ' +
        'subscription. A cancelled subscription keeps its Premium until this date.',
      resolve: ({ entitlement }) => entitlement?.expiresAt ?? null,
    }),
  }),
})
