import { MigrationName, MigrationVersion } from '~/system/migration/primitives'
import type { Migration } from '~/system/migration/types'

// A link to another recipe moves from an ingredient LINE onto the recipe itself: it
// is what a recipe is made of, not what one of its lines is, and it now carries the
// weight it is used at. Each distinct recipe a lineage pointed at becomes one entry
// on the aggregate, in the order it was met, and the ingredient lines lose the field.
//
// The weight is `1` — the linked recipe as it is written. Nothing in the old model
// said what proportion of the dough the line's "400 g" was, and a factor invented
// here would be a quantity nobody chose; the cook corrects it in one tap. The line
// itself keeps its name and its quantity: it stops being a link, it stays a line of
// the shopping list.
//
// `componentIds` is written alongside, or the link could not be read backwards
// (`usedBy` queries it with `array-contains`). The rule is spelled out here rather
// than imported — a migration states what was applied on the day it ran.
export const migration0008: Migration = {
  version: MigrationVersion(8),
  name: MigrationName('components-onto-the-recipe'),
  migrate: async ({ db }) => {
    const [recipes, versions] = await Promise.all([
      db.collection('recipes').get(),
      db.collection('recipe-versions').get(),
    ])
    // Grouped in memory rather than queried per recipe, like `migration0006`, and
    // keyed on the stored `id` field — what a version's `recipeId` points at.
    const lineages = new Map<string, typeof versions.docs>()
    for (const doc of versions.docs) {
      const { recipeId } = doc.data()
      lineages.set(recipeId, [...(lineages.get(recipeId) ?? []), doc])
    }

    let transformed = 0
    for (const doc of recipes.docs) {
      const recipe = doc.data()
      const lineage = lineages.get(recipe.id) ?? []
      const linked: string[] = []
      for (const version of lineage) {
        const stored = version.data() as StoredVersion
        const ingredients = stored.content?.ingredients
        if (!ingredients) continue
        let touched = false
        const plain = ingredients.map(({ name, quantity, component }) => {
          if (component === undefined) return { name, quantity }
          if (!linked.includes(component)) linked.push(component)
          touched = true
          return { name, quantity }
        })
        if (!touched) continue
        await version.ref.set({ ...stored, content: { ...stored.content, ingredients: plain } })
      }
      if (linked.length === 0) continue
      await doc.ref.set({
        ...recipe,
        components: linked.map((component) => ({ recipe: component, scale: 1 })),
        componentIds: linked,
      })
      transformed++
    }
    return { ok: true, transformed }
  },
}

type StoredIngredient = { name: string; quantity: string; component?: string }
type StoredVersion = { content?: { ingredients?: StoredIngredient[] } }
