# In-App Purchase — Shuhari Premium

How the subscription works end to end, and the App Store Connect setup it needs. The product
decision (what Premium unlocks, at what price) is in
[specs/2026-07-20-freemium-pricing-design.md](./specs/2026-07-20-freemium-pricing-design.md); the
invariants are in [business-rules.md](./business-rules.md#the-plan-and-the-monthly-ai-allowance).

## The flow, once

```
app                         Apple                        server
 │                            │                            │
 │ 1. entitlement { appAccountToken }  ─────────────────────▶
 │ ◀───────────────────────────────────────  the cook's UUID │
 │                            │                            │
 │ 2. product.purchase(.appAccountToken(uuid))              │
 │ ───────────────────────────▶  Face ID, payment           │
 │ ◀─────────  signed transaction (JWS)                     │
 │                            │                            │
 │ 3. syncEntitlement(signedTransaction) ───────────────────▶
 │                            │        verify signature vs Apple roots
 │                            │        check appAccountToken is this cook's
 │                            │        write entitlements/{userId}
 │ ◀──────────────────────────────────────────  plan: PREMIUM │
 │                            │                            │
 │                            │ 4. renewal / refund        │
 │                            │ ──── POST /apple/notifications ──▶
```

**The client is never believed.** `syncEntitlement` is the only way in, and all it accepts is a
transaction the App Store signed. `EntitlementQuery.planOf` reads the resulting document and
nothing else (bar the `NITRO_PREMIUM_USER_IDS` comp list).

**A purchase names its cook** through `appAccountToken`, a version-5 UUID derived from the
Firebase uid in `entitlement/business-rules.ts`. Derived, not stored: no write, stable across
reinstalls, and one-way, so the token reveals nothing as it travels through Apple's servers. The
app never computes it — it asks the `entitlement` query — so there is a single implementation, in
one language. **The derivation is frozen**: changing the namespace or the algorithm detaches every
subscription already sold from its owner. A unit test pins a vector as a tripwire.

**Renewals arrive twice.** Apple pushes them to `POST /apple/notifications`, and the app resyncs
its current entitlement on every launch. Either is enough; both is belt and braces. A notification
for a cook we have never recorded is acknowledged and dropped — the token is one-way, so there is
nobody to attach it to until the app syncs the purchase itself.

## Products

Two auto-renewable subscriptions in one subscription group, so a cook can switch between them:

| Product id | Duration | Price | Introductory offer |
|---|---|---|---|
| `com.polyforms.shuhari.app.premium.monthly` | 1 month | 2,99 € | — |
| `com.polyforms.shuhari.app.premium.yearly` | 1 year | 24,99 € | 7 days free |

The ids are declared in `ios/Shuhari/Features/Subscription/SubscriptionProducts.swift` and in
`ios/Shuhari/Shuhari.storekit`; they must match App Store Connect exactly.

## Local testing (no App Store Connect needed)

`ios/Shuhari/Shuhari.storekit` describes both products locally. Purchases made against it are signed by a
throwaway Xcode certificate, which cannot chain to Apple's roots — so the server must be told to
expect them:

```
NITRO_APPLE_ENVIRONMENT=Xcode
```

Then, **in Xcode** (the StoreKit configuration is applied by Xcode when it launches the app, so
`xcrun simctl launch` will not do): Product → Scheme → Edit Scheme → Run → Options → StoreKit
Configuration → `Shuhari.storekit`. Run, open Réglages → Découvrir Premium, buy. The Transactions
inspector (Debug → StoreKit → Manage Transactions) fakes renewals, refunds and expiries.

## App Store Connect setup — to do once, by a human

Credential-gated; none of it is scriptable.

1. **App Store Connect → your app → Subscriptions** → create a subscription group, e.g.
   `Shuhari Premium`.
2. Add subscription **`com.polyforms.shuhari.app.premium.yearly`**, duration 1 year, price 24,99 €
   (France; Apple fills the other storefronts). Add a **localized display name and description**
   in French — both are shown on Apple's payment sheet.
3. Add **`com.polyforms.shuhari.app.premium.monthly`**, duration 1 month, price 2,99 €, same
   localization.
4. On the yearly product → **Introductory Offer** → Free trial, 7 days, all territories.
5. **Agreements, Tax and Banking** must be complete (Paid Apps agreement signed, bank and tax
   details filled) or the products stay in `Missing Metadata` and never load in the app.
6. Apply to the **Small Business Program** (App Store Connect → Business): 15 % commission instead
   of 30 % under 1 M$ a year. Worth roughly 0,45 € per monthly subscriber.
7. **App Store Server Notifications V2** → set the production URL to
   `https://<the deployed function host>/apple/notifications`, and the sandbox URL to the same.
   Version **V2**, not V1.
8. Note the app's **numeric Apple id** (App Store Connect → App Information → General → Apple ID)
   and set it as `apple_app_id` in `infra/terraform.tfvars` — Production signature verification
   needs it.
9. Submit both products **with the app build** that contains the paywall: Apple reviews
   subscriptions alongside a build, and rejects them if the reviewer cannot reach the purchase.
   The submission also needs the Terms of Use link, in the description and on the paywall —
   [app-store-release.md](./app-store-release.md#the-terms-of-use-link-which-subscriptions-demand).

### Done on 2026-07-20

The app record and both products exist. What they are, for reference:

| | Value |
|---|---|
| App Apple id | `6792835124` |
| Subscription group | `Shuhari Premium` (`22251064`) |
| Yearly | `com.polyforms.shuhari.app.premium.yearly` — `6792835914`, 24,99 €, 7-day free trial |
| Monthly | `com.polyforms.shuhari.app.premium.monthly` — `6792838776`, 2,99 € |

Both carry their French localization, their review notes and the review screenshot
(`screenshots/paywall.png`, regenerated any time with `-gallery premium`).

**Still open**, and blocking a real purchase:

1. **The Paid Apps agreement is not active** (no bank account, US tax form missing). Until it is,
   both products stay in `Missing Metadata` and never load in the app — the paywall shows "Les
   offres ne sont pas disponibles pour le moment." The local StoreKit file is unaffected. Account
   Holder only, on a desktop browser: the iOS App Store Connect app does not expose the section.
2. **Server notifications are not configured** — deliberately, the endpoint is not deployed yet.
3. **Small Business Program**: the enrolment page only opens once the Paid Apps agreement is
   active.
4. **No purchase has ever run end to end.** The domain tests mock Apple, so our verification of a
   real JWS signature has never executed. The local StoreKit configuration is the cheapest way to
   close that gap, and it needs Xcode to launch the app.

## Secrets

| Variable | Purpose |
|---|---|
| `NITRO_APPLE_APP_ID` | The app's numeric App Store id (`6792835124`), required to verify a Production signature. Public — a plain Cloud Function environment variable, not a Secret Manager entry (`infra/function.tf`) |
| `NITRO_APPLE_ENVIRONMENT` | Pins verification to one environment. Blank tries Production then Sandbox — what a shipped app needs, since TestFlight and review sign in Sandbox. `Xcode` for the local StoreKit file |
| `NITRO_PREMIUM_USER_IDS` | Comped accounts, granted Premium without paying. An access list, not a credential — also a plain environment variable |

They are set through Terraform (`infra/variables.tf`) and reach the function as plain
environment variables; only genuine credentials go to Secret Manager — see
[architecture.md](./architecture.md).

**Terraform is applied by CI, not from a laptop.** `.github/workflows/deploy.yml` writes its own
`infra/terraform.tfvars` from GitHub secrets and variables, then runs `terraform apply` on every
push to `main`. A value that only exists in the local `infra/terraform.tfvars` never reaches
production. So:

- `apple_app_id` is **defaulted in `variables.tf`** (public, stable — like `ios_bundle_id`), and
  the workflow passes nothing.
- `premium_user_ids` comes from the repository variable **`PREMIUM_USER_IDS`** (Settings →
  Secrets and variables → Actions → Variables). A Firebase uid is not a credential, but it is a
  personal identifier and this repository is public, so it is not defaulted in the code.

## What is deliberately not built

- **No App Store Server API calls.** We never poll Apple for a status; we act on what the app
  hands us and on what Apple pushes. One less credential (the private key) to hold, and the two
  channels already cover every case.
- **No receipt refresh, no `restoreCompletedTransactions`.** StoreKit 2's
  `Transaction.currentEntitlements` is the modern replacement, and the app walks it on launch and
  on the "Restaurer mes achats" button.
- **No proration or upgrade logic of our own.** Switching between monthly and yearly inside one
  subscription group is Apple's business; we only ever read the resulting expiry date.
