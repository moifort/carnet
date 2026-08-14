# Shuhari - Project Directives

守破離 — *Shu* (follow the rule), *Ha* (break it), *Ri* (transcend it). A culinary
experimentation notebook: import a recipe, cook a version, rate the attempt, let the AI
propose the next iteration, and open the best-rated version by default.

## Language

Everything versioned and technical is **English**: commits, code, comments, docs (incl. `CHANGELOG.md`), identifiers, file names, GraphQL descriptions, AI prompts, test names, iOS accessibility *identifiers*. Enum/union values are English technical symbols (`dish`, `starter`, `ai-proposal`) — the schema never speaks the user's language, the app translates. The **only** French in the repo: user-facing copy (`CHANGELOG.fr.md` + its generated asset `server/system/changelog-content.ts`, the iOS app's on-screen text and preview names), French data values quoted as examples in code/prompts, and the import fallback title. Never mix languages in a commit message or a comment. Control: `grep -rnP '[\x{00C0}-\x{00FF}]' server/` must only return those exceptions. Full rules: [docs/code-style.md](docs/code-style.md#language).

## Collaboration

> Full working agreement: [docs/collaboration.md](docs/collaboration.md) — read it at the start
> of any session. Key rules:

- **Docs are the spec**: align code to `docs/`, never the reverse; `docs/code-style.md` is law and is never edited to match the code (it changes only on an explicit user request). Corrections given in conversation are applied repo-wide **and** codified in the matching doc, in the same task.
- **Rules generic, wiring specific**: a practice that would hold in any codebase goes in a `*-best-practices.md` with neutral examples; how this repo implements it goes in the matching project guide, which links to the rule.
- **Work inline, never through subagents**: exploration, review, debugging and planning all happen in the main conversation — never `Task`/`Agent`, never a parallel-worker or subagent-driven skill, plan mode included.
- **Design talk is not a go**: in architecture discussions, "je veux faire X" is design intent — implement only on an explicit "vas-y" / "implémente" / "lance".
- **One checkout, no worktrees**: never `git worktree add`, never `EnterWorktree` — sessions share the primary checkout, so stage the explicit paths of your task (never `git add -A` / `commit -a`).
- **Every plan opens with a "Domaines impactés" block** (Créés / Modifiés / Supprimés) before the body.
- **No machine-local assistant memory**: collaboration learnings are written into `docs/`, nothing else.
- **Ops autonomy**: execute everything CLI-doable yourself; hand off only credential-gated steps, with numbered instructions.

## Build & Verification Commands

- **Backend typecheck**: `bun tsc --noEmit`
- **Regenerate types** (if routes changed): `bun run prepare` (= `generate:assets` + `nitro prepare`); run it before `bun tsc`
- **Dev server**: `bun run dev` — Nitro on `http://localhost:3000` (GraphQL at `POST /graphql`)
- **Tests**: `bun test` (all three tiers), or one tier: `bun run test:unit` / `test:int` / `test:feat` (`bun run test` regenerates the assets first)
- **Test coverage**: `bun run test:coverage`
- **Linter**: `bun run lint` (`bunx biome check`); autofix with `bun run lint:fix`
- **Runtime**: always use `bun`/`bunx`, never `npm`/`npx`
- **GraphQL codegen** (if the schema changed): `bun run generate:graphql` (regenerates `shared/schema.graphql`), then `bun run generate:ios`
- **iOS build**:
  ```
  DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild -project ios/Shuhari.xcodeproj -scheme Shuhari -destination 'platform=iOS Simulator,name=iPhone 17,OS=26.2' build
  ```

## Development Workflow

> **Git commit & push rules live in [docs/git-workflow.md](docs/git-workflow.md)** (portable rules:
> [docs/git-best-practices.md](docs/git-best-practices.md)) — read it at the start of any coding
> session. This section is the quick reference.

1. Verify the build before committing: `bun tsc --noEmit` and/or the iOS `xcodebuild`, depending on what was touched (`bun run prepare` first if routes changed).
2. Review the diff yourself, **inline**, before committing — never through a subagent.
3. **Commit freely, one task = one commit**: commit each finished task without asking, never bundle tasks — a rollback is a clean `git revert`. English messages, Conventional Commits, `Co-Authored-By:` trailer.
4. **Close every task with the surfaces touched, then the diff size** ([docs/collaboration.md](docs/collaboration.md#closing-a-task-surfaces-then-diff-size)): one sentence on which of **the database**, **the backend** and **the iOS app** changed (the deployment blast radius), then `git show --stat HEAD | tail -1` and the lines added / removed — a refactor that only adds is a refactor that forgot to delete.
5. **Never push until the user explicitly says "push"**, and **never open a PR**: a push goes straight to `origin/main` (`git push origin HEAD:main`), whatever the working branch, following the [push protocol](docs/git-workflow.md#push-protocol-only-when-the-user-says-push) — reshape the pending commits, Biome autofix, regenerate the iOS GraphQL API if the schema changed, push, watch CI to green.
6. **Not at push time**: never touch `README.md` (updated on its own, when asked) or the changelogs — the changelog is written only during an [App Store release](docs/app-store-release.md), and it is written for whoever taps "What's New", never as a development log ([changelog-best-practices.md](docs/changelog-best-practices.md)).

## Backend Patterns (TypeScript / Nitro)

> Extended guides live in `docs/`, split in two: the **rules**, written project-agnostic —
> [ddd-best-practices](docs/ddd-best-practices.md), [graphql-best-practices](docs/graphql-best-practices.md),
> [code-style](docs/code-style.md), [branded-types](docs/branded-types.md),
> [error-handling](docs/error-handling.md) — and this repo's **wiring** —
> [architecture](docs/architecture.md), [domain-guide](docs/domain-guide.md),
> [graphql-patterns](docs/graphql-patterns.md), [business-rules](docs/business-rules.md),
> [migrations](docs/migrations.md), [readme-guide](docs/readme-guide.md),
> [collaboration](docs/collaboration.md). This section is the quick reference.

- **Stack**: Bun + Nitro 2.13 (`preset firebase`, gen 2, nodejs22, `europe-west3`) + Apollo Server 5 + Pothos 4 + firebase-admin (native Firestore) + Zod + ts-brand. DDD/CQRS strict. Biome (spaces 2, single quotes, no semicolons, width 100), `ts-pattern` (`match().exhaustive()`), `lodash-es`.
- **Domains**: `server/domain/{recipe,proposal,quota,entitlement,shared}` — `recipe`, `quota` and `entitlement` are the persisted domains; `proposal` is ephemeral (never stored) and the sole caller of `~/system/ai`, which it gates on the quota; system concerns in `server/system/`. Standard layout (`types.ts`, `primitives.ts`, `command.ts`, `query.ts`, `infrastructure/{repository,graphql/*}.ts`, optional `business-rules.ts` / `use-case.ts`): [docs/domain-guide.md](docs/domain-guide.md).
- **Three recipe types** (`RECIPE_TYPE_VALUES`): `dish`, `thermomix`, `coffee`. `content` is a discriminated union (`kind` mirrors the type); a **coffee has no ingredients and no steps** — it is `CoffeeParameters` alone — and carries `Recipe.method` (`BREW_METHOD_VALUES`), aggregate-level like `category`, present iff `type === 'coffee'`, and the axis the app's Café tab reads on. The AI changes **one variable per coffee iteration**, and never fills a parameter left empty — see [docs/business-rules.md](docs/business-rules.md#recipe-types-and-version-content).
- **An ingredient can BE a recipe** (`Ingredient.component?: RecipeId`): the ravioli's pasta dough is a page of its own. The link holds the **recipe, never a version**, so `versionToOpen` always shows its best one; set only by `updateComponent`, carried across iterations by `carriedComponents`, resolved one level deep, and `null` once the linked recipe is deleted — [docs/business-rules.md](docs/business-rules.md#composition--an-ingredient-can-be-a-recipe).
- **Two import flows, chosen by the tab**: `analyzeCoffeeImport` (method + parameters) and `analyzeCookingImport` (type + ingredients + steps), one prompt module each under `server/system/ai/` — never one prompt for both worlds.
- **Branded types** (`ts-brand` + Zod constructors in `primitives.ts`: `RecipeId`, `VersionNumber`, `Rating`…); discriminated results for absence/errors (`'not-found' as const`) — no exceptions for control flow, no `null` in the domain (absence = `field?: T`, converted only at the GraphQL/Firestore/AI boundaries).
- **Storage: native Firestore**, only inside `infrastructure/repository.ts`, via the `server/utils/firestore.ts` helpers (`genericDataConverter`, `atomically`, `bulkSave`, `deleteInBatches`) and the per-request cache (`memoizedPerRequest`) — see [docs/architecture.md](docs/architecture.md#storage--native-firestore). Aggregate root `recipes` + append-only satellite `recipe-versions` keyed `${recipeId}_${number}`; standalone `ai-quotas` keyed `${userId}_${month}` and `entitlements` keyed by `userId`.
- **GraphQL** (single endpoint `POST /graphql`): satellite `RecipeType` fields resolve through the per-request `versionsByRecipe` loader — never a collection scan or one doc per parent (N+1); read budgets asserted in tests via `fake.reads`. See [docs/graphql-patterns.md](docs/graphql-patterns.md#satellite-loaders--the-n1-budget).
- **Naming / ubiquitous language**: function names ARE the business concept (`bestRating`, `versionToOpen` — never `computeX`, `handleX`); one business concept = one word at every layer (domain, GraphQL, iOS, tests). See [docs/domain-guide.md](docs/domain-guide.md#ubiquitous-language).
- **Tests**: three tiers with `bun:test`, one CI job each — `*.unit.test.ts` (pure logic, plus the executable `server/architecture.unit.test.ts`), `*.int.test.ts` (commands/queries against the fake Firestore), `*.feat.test.ts` (business scenarios executed against the assembled GraphQL schema: error codes, freemium gates, N+1 budgets). Firestore mocked via `mock.module('~/system/firebase', fakeFirebase)` (`server/test/fake-firestore.ts`), which records batches and split `docReads`/`queryReads` to assert atomicity and read budgets. See [docs/domain-guide.md](docs/domain-guide.md#9-write-tests).

## Database Migrations

- `server/system/migration/` — forward-only sequential migrations, no rollback, triggered by `POST /admin/migrate` (CI deploy / provisioning). When to migrate, how to write and register one: [docs/migrations.md](docs/migrations.md).
- **Dated note (2026-07-20)**: production Firestore now holds real data — **every schema-shape change needs its migration**, the pre-release shortcut is over.

## iOS Patterns (SwiftUI)

> Full iOS guide: [docs/ios-guide.md](docs/ios-guide.md) — project wiring; the portable SwiftUI
> rules live in [docs/swiftui-best-practices.md](docs/swiftui-best-practices.md).

- Target iOS 26.0, Swift 6 (strict concurrency). `ios/Shuhari.xcodeproj`, scheme `Shuhari`, bundle id `com.polyforms.shuhari.app`, team `46C337T7YN`. MVVM with `@Observable` (`@MainActor` ViewModels, `Sendable` models), Apollo iOS codegen, Firebase Auth + Sign in with Apple (mono-user, but real auth).
- Style: **Liquid Glass** = native iOS 26 components (no custom re-skins). Feature structure `Features/{Feature}/{pages,organisms,molecules}/`, shared atoms in `Shared/Components/`.
- **Two content tabs** (`ContentView`): **Cuisine** (`HomeView`, `RecipeType.cooking`) and **Café** (`CoffeeView`, `[.coffee]`), plus the shared trailing **Importer** entry — the detected type routes the new recipe to its tab. Both run the same `LibraryStore`/`HomePage`/`LibrarySection`, whose filter facet is primitive-first so it serves a dish course or a brew method: [docs/ios-guide.md](docs/ios-guide.md#the-root-tabs).
- **Primitive-first leaf views** (never domain structs; nested `Item` structs for 5+ parameters); **pages = coordinators** (loading, errors, sheets, API calls, mapping to primitives); **previews as Storybook** (everything below page level previewable offline); **a CTA that hits the network shows it** (`ActionIcon` spinner, `AIThinkingCard` for AI waits, optimistic deletes — never `.disabled(...)` alone).
- Xcode uses `fileSystemSynchronizedGroups` (no manual file adds; `Shuhari.storekit` is excluded from the target via a `membershipExceptions` set). `DEVELOPER_DIR` is required because `xcode-select` points to CommandLineTools.
- **In-app purchase**: StoreKit 2 in `Features/Subscription/` — `SubscriptionStore` (`@Observable`, owned by `AuthRoot`, listens to `Transaction.updates`) buys, restores, and hands every signed transaction to `syncEntitlement`; the server decides the plan. Testing the purchase needs Xcode (the StoreKit configuration is not applied by `simctl launch`): [docs/in-app-purchase.md](docs/in-app-purchase.md).

## App Store Distribution

**A release is a git tag**: an annotated `ios-v<version>` carrying the release notes as its message (`git tag -a ios-v1.0 -m "$(bun scripts/release-notes.ts markdown 1.0 en)"`, then push it) runs `.github/workflows/release.yml`, which guards the version against `MARKETING_VERSION` and the changelog, shoots and composes the store panels, archives with App Store Connect cloud signing, uploads, submits for review and publishes. The whole listing lives in `fastlane/metadata/` and is overwritten on every release — editing it in App Store Connect is pointless. `CURRENT_PROJECT_VERSION` comes from the run number, never edited by hand. Changelog written at release time; latest **final** Xcode only (ITMS-90111); the beta-macOS `BuildMachineOSBuild` patch only applies to archives made from the dev Mac. **Account deletion is mandatory** (guideline 5.1.1(v)) and lives in Settings → Compte, wired to the `deleteAccount` mutation (`server/system/account/`) — never remove or hide it. Full flow: [docs/app-store-release.md](docs/app-store-release.md).

## Gemini API Key & Secrets

- The AI (import + proposals) is **Gemini 2.5 Flash** in `server/system/ai/`, key in `NITRO_GOOGLE_API_KEY`; `POST /admin/migrate` is gated by `NITRO_ADMIN_TOKEN`; `NITRO_SENTRY_DSN`, `NITRO_PREMIUM_USER_IDS` (comped Premium accounts), `NITRO_APPLE_APP_ID` and `NITRO_APPLE_ENVIRONMENT` (pins App Store signature checks, `Xcode` for the local StoreKit file) optional. Local `.env` (see `.env.example`); in production, GCP Secret Manager (project `shuhari-polyforms`). Never commit a key.
- **The connected oven** (`server/system/electrolux/`) needs `NITRO_ELECTROLUX_API_KEY`, `NITRO_ELECTROLUX_REFRESH_TOKEN` and `NITRO_ELECTROLUX_USER_ID` — all three or the feature is off. The refresh token is only a **seed**: Electrolux rotates it on every use, and the current one lives in the `system/electrolux` Firestore document. See [docs/architecture.md](docs/architecture.md#system-layer-serversystem).

## iOS Simulator

- Device: iPhone 17, OS 26.2
- **After finishing any iOS task**, build and launch the app in the simulator on your own — do not ask first. When the task touched UI, launch straight into the affected screen with DebugGallery (`xcrun simctl launch booted com.polyforms.shuhari.app -gallery <screen>`) and screenshot it to verify the change visually before reporting. Screens = the `switch` cases in `ios/Shuhari/Shared/DebugGallery.swift`; add a case if the touched screen has none.

## iOS Physical Device Install

- After finishing a task (especially one touching iOS), **offer** to install it on the physical iPhone "TiPhone junior" (UDID `00008130-000A2068029A001C`, automatic dev signing, team `46C337T7YN`). Never install automatically — ask first, run only after a yes.
- On a yes, run `scripts/install-device.sh` to build → install → launch. The device must be connected, unlocked, and trusted. Relay the raw `xcodebuild`/`devicectl` output — don't claim success without it.
