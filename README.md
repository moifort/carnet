# Shuhari

守破離 — *Shu* (follow the rule), *Ha* (break it), *Ri* (transcend it).

A culinary experimentation notebook: import a recipe, cook a version, rate the attempt, and let the
AI propose the next iteration. Each recipe grows as a chain of versions, and the app always opens on
the one worth cooking next.

## What's in the box

- An **iOS app** to browse your recipe library, cook a version step by step, rate the attempt out of
  5, and review the AI's next proposal
- **AI import** — snap a photo of a recipe, paste a link or some text, and get the title, dish
  category, ingredients and steps extracted for you (Thermomix settings included)
- **AI iteration** — after an attempt with remarks, get a full draft of the next version (what
  changes, why, plus the new ingredients and steps) that you can edit before accepting it
- A **backend server** that stores each recipe and its version chain, and works out on its own which
  version is the best-rated and which one to open
- **Export & import** of all your data, so the notebook is yours to take away
- **Error monitoring** with Sentry (optional)

### How a recipe evolves

1. **Import** a recipe — it becomes `v1`.
2. **Cook** a version and **rate the attempt** (1 to 5 stars, plus remarks and a photo). Rated
   without remarks, the outcome lands on the version you cooked, and re-cooking it simply
   overwrites it.
3. Write remarks and the **AI proposes the next version** instead. Accept it and it is appended as
   `v2` — a straight line, never a fork — carrying that attempt as its own outcome; the version you
   cooked is left untouched. Nothing is saved until you accept.
4. Or ask for an **improvement** without cooking at all: write what you want changed and the AI
   proposes a version from that alone. Accepted, it lands on the **to-cook list** the recipe sheet's
   flask opens, and leaves it the moment you cook it.
5. The app derives the rest: the **best rating** is the highest-rated attempt (most recent one wins a
   tie), and the recipe opens on that best-rated version — falling back to the latest one when
   nothing has been cooked yet. A version still waiting to be cooked never opens on its own.

There is no "promote a version" step and no variations: nothing is flagged by hand, everything is
derived from the ratings.

Recipes come in two kinds — **dish** and **thermomix** (where each step also carries time,
temperature, speed and reverse rotation) — and one of seven courses (starter, main, dessert, soup,
sauce, baking, drink) detected at import and changeable from the recipe sheet. The library is
paginated, filterable by kind and sortable by course or by last edit. The notebook opens on **Tout** — every recipe, both kinds mixed, newest
first — and the other lenses narrow it to one kind. Mark a recipe as a **favourite** from its sheet
and the last lens lists your favourites, course by course; the heart also shows on the library row.

The app is single-user but uses real authentication: Firebase Auth with Sign in with Apple.

## Prerequisites

| Tool | What it does | Install |
|------|--------------|---------|
| [Bun](https://bun.sh/) | Runs the backend server (never use `npm`/`npx` here) | `curl -fsSL https://bun.sh/install \| bash` |
| [Xcode 26](https://developer.apple.com/xcode/) | Builds the iOS app (iOS 26 SDK) | Mac App Store |
| [gcloud CLI](https://cloud.google.com/sdk/docs/install) | Talks to Google Cloud when provisioning | `brew install --cask google-cloud-sdk` |
| [Apollo iOS CLI](https://www.apollographql.com/docs/ios/code-generation/codegen-cli) | Regenerates the app's typed GraphQL code (only needed when the schema changes) | Nothing to install — SwiftPM ships it with the Xcode project; run `bun run generate:ios` |

You also need a Google Cloud billing account and an Apple Developer account (for Sign in with Apple)
if you intend to deploy. Running the backend locally needs neither.

## Installation

1. Clone the repository and install the dependencies:

   ```bash
   bun install
   ```

2. Create your environment file from the template:

   ```bash
   cp .env.example .env
   ```

3. Fill in the keys — see [Setting up keys](#setting-up-keys) below.

4. Generate the local build artefacts (the changelog asset and Nitro's types):

   ```bash
   bun run prepare
   ```

5. For the iOS app, create the local secrets file:

   ```bash
   cp ios/Shuhari/Shared/Secrets.swift.example ios/Shuhari/Shared/Secrets.swift
   ```

   `Secrets.swift` is gitignored and only holds an optional admin token — the app authenticates
   against the API with the Firebase ID token, so `REPLACE-ME` is fine to leave as is.

## Setting up keys

### Gemini API key

**What it does:** powers recipe import and the AI iteration proposals (Gemini 2.5 Flash). Without
it, the server runs but importing and proposing fail.

**How to get it:** create one in [Google AI Studio](https://aistudio.google.com/apikey) →
**Get API key** → **Create API key**.

**Where to put it:**

| File | Variable |
|------|----------|
| `.env` | `NITRO_GOOGLE_API_KEY=your-key-here` |

### Admin token

**What it does:** gates `POST /admin/migrate`, the endpoint that applies the Firestore migrations.
Anyone with this token can run them, so pick a long random string.

**How to get it:** generate one, e.g. `openssl rand -hex 32`.

**Where to put it:**

| File | Variable |
|------|----------|
| `.env` | `NITRO_ADMIN_TOKEN=your-token-here` |

### Sentry DSN (optional)

**What it does:** reports server errors to [Sentry](https://sentry.io). Leave it empty to disable
reporting entirely.

**How to get it:** in Sentry, **Settings** → **Projects** → your project → **Client Keys (DSN)**.

**Where to put it:**

| File | Variable |
|------|----------|
| `.env` | `NITRO_SENTRY_DSN=https://…` |

### Firebase configuration (iOS)

**What it does:** tells the app which Firebase project to authenticate against.

**Where it lives:** committed, at `ios/Shuhari/GoogleService-Info.plist` — unlike the secrets
above, this file is not one: it ships inside every distributed `.ipa`, so it is public by
construction (the same reasoning as the Sentry DSN hardcoded in `ShuhariApp.swift`). It must be
committed: the release pipeline archives from a clean checkout, and an archive built without it
crashes at launch on `FirebaseApp.configure()`. To regenerate it, run `bun run bootstrap` (see
[Deployment](#deployment)) or download it from the Firebase console under **Project settings** →
**Your apps**.

In production, none of the secrets above live in a file: they are stored in GCP Secret Manager
(project `shuhari-polyforms`) and wired in by the infrastructure. Never commit a key.

## Running the project

### Start the backend

```bash
bun run dev
```

The server starts at `http://localhost:3000`. GraphQL — with the Apollo Sandbox in dev — is at
`POST /graphql`. To check it works, open the sandbox and run:

```graphql
query {
  recipes(limit: 5) {
    items {
      title
      bestRating
      versionToOpen { number }
    }
    hasMore
  }
}
```

An empty `items` list means the server is talking to Firestore correctly. In dev the user is faked
(`NITRO_DEV_USER_ID`, default `dev-user`), so no login is needed.

To run against the Firebase emulators instead of the real project:

```bash
firebase emulators:start --only auth,firestore,functions
```

### Run the iOS app

1. Open the project: `open ios/Shuhari.xcodeproj`
2. Set your Development Team under **Signing & Capabilities** for the `Shuhari` target.
3. If the GraphQL schema changed, regenerate the typed operations: `cd ios && apollo-ios-cli generate`
4. Pick the **iPhone 17 (iOS 26.2)** simulator and hit **Run**.

You should land on the sign-in screen; after Sign in with Apple, the recipe library appears (empty
on a fresh install).

### Useful commands

```bash
bun tsc --noEmit           # typecheck the backend
bun test                   # unit tests
bun run test:coverage      # unit tests with coverage
bun run lint               # Biome check (bun run lint:fix to autofix)
bun run generate:graphql   # regenerate shared/schema.graphql from the Pothos schema
```

## Deployment

The whole Google Cloud stack — project, Firebase, Firestore rules and indexes, Identity Platform with
Sign in with Apple, the Cloud Function (Gen 2, `europe-west3`), the secrets and the iOS app
registration — is described as Terraform code in `infra/`.

```bash
bun run bootstrap    # provision everything, end to end
bun run infra:plan   # show the Terraform diff without applying it
bun run infra:apply  # apply it
bun run destroy      # tear the resources down
```

`bun run bootstrap` builds the Nitro bundle (`preset firebase`), runs `terraform apply`, then calls
`POST /admin/migrate` with your admin token to apply the Firestore migrations.

Terraform itself is downloaded automatically (pinned version) into `infra/.bin/` by `scripts/tf` on
the first `infra:*` or `bootstrap` run.

Afterwards, deployments happen by pushing to `main`: GitHub Actions authenticates to GCP through
Workload Identity Federation, deploys the function and runs the migration endpoint.

## Documentation

| Guide | What it covers |
|-------|----------------|
| [Architecture](docs/architecture.md) | How the backend is organized, and where each kind of code lives |
| [Domain guide](docs/domain-guide.md) | How to add a new domain, step by step |
| [GraphQL patterns](docs/graphql-patterns.md) | How the GraphQL layer is built and kept fast |
| [DDD best practices](docs/ddd-best-practices.md) | The portable DDD/CQRS rules this backend follows |
| [GraphQL best practices](docs/graphql-best-practices.md) | The portable code-first schema rules |
| [Branded types](docs/branded-types.md) | How values are validated once and stay trustworthy |
| [Code style](docs/code-style.md) | The conventions the code follows, and which ones the tests enforce |
| [Error handling](docs/error-handling.md) | How failures are represented and surfaced to the app |
| [Migrations](docs/migrations.md) | How to change the shape of stored data safely |
| [iOS guide](docs/ios-guide.md) | How to add screens to the iOS app |
| [SwiftUI best practices](docs/swiftui-best-practices.md) | Portable SwiftUI rules, reusable in any project |
| [Git workflow](docs/git-workflow.md) | How commits and pushes are handled |
| [Git best practices](docs/git-best-practices.md) | Portable commit and history rules |
| [README guide](docs/readme-guide.md) | How to write and maintain this file |
| [Sign in with Apple](docs/apple-sign-in.md) | How the Apple authentication is configured |

App bundle id: `com.polyforms.shuhari.app` · Apple team: `46C337T7YN`.
