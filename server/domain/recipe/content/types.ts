import type { CoffeeContent } from '~/domain/recipe/content/coffee'
import type { DishContent } from '~/domain/recipe/content/dish'
import type { ThermomixContent } from '~/domain/recipe/content/thermomix'

// The versioned recipe content, discriminated by `kind` — which mirrors the recipe
// type (`dish` | `thermomix` | `coffee`). Adding a recipe type later is one new
// variant here and one new file under `content/`, leaving the versioning envelope
// untouched.
export type VersionContent = DishContent | ThermomixContent | CoffeeContent
