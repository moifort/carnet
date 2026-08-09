import { builder } from './builder'

// Custom scalars must be registered before any type that references them.
import './scalars'

// Recipe domain (the aggregate root: Recipe + Version types, incl. the attempt
// outcome folded onto each version and the recordAttempt mutation)
import '~/domain/recipe/infrastructure/graphql/enums'
import '~/domain/recipe/infrastructure/graphql/types'
import '~/domain/recipe/infrastructure/graphql/inputs'
import '~/domain/recipe/infrastructure/graphql/queries'
import '~/domain/recipe/infrastructure/graphql/mutations'

// Proposal domain (ephemeral AI proposals — import preview + next-version
// suggestions; request/accept + analyzeImport mutations)
import '~/domain/proposal/infrastructure/graphql/types'
import '~/domain/proposal/infrastructure/graphql/inputs'
import '~/domain/proposal/infrastructure/graphql/mutations'

// Oven domain (ephemeral — the connected oven's live state, and starting a
// version's cooking on it; nothing about it is stored)
import '~/domain/oven/infrastructure/graphql/types'
import '~/domain/oven/infrastructure/graphql/queries'
import '~/domain/oven/infrastructure/graphql/mutations'

// Quota domain (the freemium plan and the monthly AI allowance it comes with)
import '~/domain/quota/infrastructure/graphql/enums'
import '~/domain/quota/infrastructure/graphql/types'
import '~/domain/quota/infrastructure/graphql/queries'

// Entitlement domain (what the App Store sold — the sole source of the plan)
import '~/domain/entitlement/infrastructure/graphql/types'
import '~/domain/entitlement/infrastructure/graphql/queries'
import '~/domain/entitlement/infrastructure/graphql/mutations'

// Changelog (application release notes)
import '~/system/changelog/infrastructure/graphql/types'
import '~/system/changelog/infrastructure/graphql/queries'

// Portability (export and import of user data)
import '~/system/portability/infrastructure/graphql/types'
import '~/system/portability/infrastructure/graphql/queries'
import '~/system/portability/infrastructure/graphql/mutations'

// Account (erasing a cook and everything held on them)
import '~/system/account/infrastructure/graphql/mutations'

export const schema = builder.toSchema()
