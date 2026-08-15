# Migration System

> **Dated note (2026-07-20): production Firestore holds real data.** The app is still
> pre-first-release, but the deployed backend serves the recipes cooked on the physical
> device — a `versionCount` → `lastVersionNumber` rename shipped without a migration and
> broke every recipe stored before it (`undefined + 1` = `NaN` at the next `addVersion`).
> The "no data, no migration" shortcut is over: **every schema-shape change needs its
> migration**, per the rules below.

## Overview

Forward-only, sequential Firestore migrations. Meta is tracked in the Firestore collection
`migration-meta`, document `state`. Migrations are triggered on demand by `POST /admin/migrate`
(during provisioning / CI deploy) — there is **no** boot-time plugin and nothing calls
`process.exit`.

Location: `server/system/migration/`.

```
server/system/migration/
├── types.ts              # Migration, MigrationContext, MigrationResult, MigrationMeta
├── primitives.ts         # MigrationVersion / MigrationName constructors
├── runner.ts             # runMigrations(migrations)
└── migrations/
    ├── index.ts          # export const migrations: Migration[] = []
    └── NNNN-name.ts       # individual migrations
```

## When to Migrate

The rule is
[here](./ddd-best-practices.md#migrations-are-forward-only-and-owned-by-a-runner): migrate when a
field is renamed, restructured or removed, or when an enum value changes meaning (a new
`RecipeType` value is *additive* — no migration); don't migrate for a new optional (`?`) field, a
new collection, or a change in query logic or routes.

## Types

```ts
export type MigrationVersion = Brand<number, 'MigrationVersion'>
export type MigrationName = Brand<string, 'MigrationName'>

export type MigrationContext = { db: Firestore }

export type Migration = {
  version: MigrationVersion
  name: MigrationName
  migrate: (ctx: MigrationContext) => Promise<MigrationResult>
}

export type MigrationResult = { ok: true; transformed: number } | { ok: false; error: string }
```

The context hands you the native Firestore `db` directly — a migration reads and writes
collections itself (it is infrastructure, not a domain, so it bypasses repositories).

## Creating a Migration

### 1. Create the file

`server/system/migration/migrations/0001-rename-foo-to-bar.ts`:

```ts
import { MigrationName, MigrationVersion } from '~/system/migration/primitives'
import type { Migration } from '~/system/migration/types'

export const migration0001: Migration = {
  version: MigrationVersion(1),
  name: MigrationName('rename-foo-to-bar'),
  migrate: async ({ db }) => {
    const snap = await db.collection('recipes').get()
    let transformed = 0
    for (const doc of snap.docs) {
      const data = doc.data()
      if ('foo' in data) {
        await doc.ref.update({ bar: data.foo, foo: FieldValue.delete() })
        transformed++
      }
    }
    return { ok: true, transformed }
  },
}
```

The runner wraps each migration in try/catch, so a migration does **not** need its own error
handling — throwing (or returning `{ ok: false, error }`) marks it failed and stops the run.

### 2. Register it

`server/system/migration/migrations/index.ts` (forward-only, in ascending order):

```ts
import { migration0001 } from '~/system/migration/migrations/0001-rename-foo-to-bar'
import type { Migration } from '~/system/migration/types'

export const migrations: Migration[] = [migration0001]
```

## How It Works (`runner.ts`)

1. `runMigrations(migrations)` reads `migration-meta/state`; absent → version `0` (the reserved
   sentinel — real migrations start at `1`).
2. It filters `version > current`, sorts ascending, and applies each in turn.
3. After each success it writes back `{ version, appliedAt }`, then logs one `console.info` line.
4. On a failed/`throw`n migration it returns `{ outcome: 'failed', version, error }` and stops.
5. It returns `{ outcome: 'up-to-date' }`, `{ outcome: 'migrated', from, to, applied }`, or the
   failure shape.

## Testing a Migration

Co-locate an integration test `NNNN-name.int.test.ts` next to the migration. Mock Firestore with the
in-memory fake, seed the pre-migration documents, run `migrate`, then assert the transformed shape:

```ts
import { expect, test } from 'bun:test'
import { resetFakeFirestore } from '~/test/fake-firestore'

const { migration0001 } = await import('./0001-rename-foo-to-bar')

test('renames foo to bar', async () => {
  const fake = resetFakeFirestore()
  fake.seed('recipes', 'r1', { id: 'r1', foo: 42 })

  const result = await migration0001.migrate({ db: fake.db })

  expect(result).toEqual({ ok: true, transformed: 1 })
  expect(fake.snapshot('recipes').get('r1')).toEqual({ id: 'r1', bar: 42 })
})
```

## Trigger — `POST /admin/migrate`

`server/routes/admin/migrate.post.ts` runs the migrations and sets **HTTP 500** on failure, so a
CI step gating on `curl -fsS` fails the deploy:

```ts
export default defineEventHandler(async (event) => {
  const result = await runMigrations(migrations)
  if (result.outcome === 'failed') setResponseStatus(event, 500)
  return result
})
```

The `/admin/*` routes are gated by the admin bearer token (`middleware/auth.ts`, `adminToken`),
**not** a Firebase user. The bootstrap / GitHub Actions deploy calls this endpoint after
`terraform apply`.

## Applied migrations

| # | Name | What it does |
|---|---|---|
| 1 | `rename-version-count` | Moves the recipe's version allocator from `versionCount` to `lastVersionNumber`, value untouched. |
| 2 | `coffee-parameters` | Drops `ingredients` from every coffee version's content and puts empty `beans`/`water`/`extraction`/`gear` in its place. The brewing **steps are kept**. It deliberately derives nothing from the old lines: "Eau 300 g" does not say which water, and a guessed parameter is one the cook would brew against — so they start empty and are re-entered by hand. |
| 3 | `version-updated-at` | Backfills `updatedAt` on every version that predates the field, with its `createdAt` — nothing stored knows when an older version was last rewritten. |
| 4 | `recipe-dated-by-its-best-version` | Rewrites each recipe's `updatedAt` as the date of the version it opens on (`lastWorkedOn`), the field the library orders and pages on. |
| 5 | `coffee-roast-vocabulary` | Adds an empty `roasts` list to every coffee vocabulary stored before the roast profile existed. It derives nothing from the logged coffees: a profile nobody wrote down is not one to guess. |

## Rules

- `MigrationVersion` is a branded integer (`min 0`, string-coercible); `0` is the reserved
  sentinel, versions start at `1`.
- Migrations are **forward-only** — no rollback mechanism.
- The runner owns error handling; migrations stay focused on the transform.
- **Never run migrations locally against production data** — they run through `POST /admin/migrate`
  during provisioning / deploy.
- **Firestore rejects `undefined` values** — when restructuring a document, only copy fields that are
  actually present (`if (value != null) …`).
