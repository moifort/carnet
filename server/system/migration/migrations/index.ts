import { migration0001 } from '~/system/migration/migrations/0001-rename-version-count'
import { migration0002 } from '~/system/migration/migrations/0002-coffee-parameters'
import { migration0003 } from '~/system/migration/migrations/0003-version-updated-at'
import { migration0004 } from '~/system/migration/migrations/0004-recipe-dated-by-its-best-version'
import { migration0005 } from '~/system/migration/migrations/0005-coffee-roast-vocabulary'
import type { Migration } from '~/system/migration/types'

// Forward-only migrations, applied in order by the runner. Register new
// migrations here, in ascending version order.
export const migrations: Migration[] = [
  migration0001,
  migration0002,
  migration0003,
  migration0004,
  migration0005,
]
