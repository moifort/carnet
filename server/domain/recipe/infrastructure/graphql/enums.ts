import { builder } from '~/domain/shared/graphql/builder'

export const RecipeTypeEnum = builder.enumType('RecipeType', {
  description:
    'The kind of culinary experiment. Fixed at import, it decides how a version is displayed ' +
    'and how the AI is allowed to iterate on it.',
  values: {
    DISH: {
      value: 'dish',
      description: 'A cooked dish — steps are plain text, e.g. `"Grandma’s lasagna"`',
    },
    THERMOMIX: {
      value: 'thermomix',
      description:
        'A Thermomix recipe — each step also carries machine settings, e.g. ' +
        '`"10 min / 100°C / speed 2"`',
    },
    COFFEE: {
      value: 'coffee',
      description:
        'A brewed coffee — each step also carries its extraction settings, e.g. ' +
        '`"18 g → 36 g / 93°C / 28 s"`. It always carries a `method` too, and lives in the ' +
        'app’s coffee tab rather than the cooking notebook.',
    },
  } as const,
})

export const BrewMethodEnum = builder.enumType('BrewMethod', {
  description:
    'How a coffee is brewed. Detected once at import, shared by every version, and the axis the ' +
    'coffee tab groups and sorts on — the counterpart of `DishCategory` for cooking. Present on ' +
    'a `COFFEE` recipe and on no other.',
  values: {
    ESPRESSO: { value: 'espresso', description: 'A shot pulled on an espresso machine' },
    AMERICANO: { value: 'americano', description: 'An espresso lengthened with hot water' },
    FLAT_WHITE: { value: 'flat-white', description: 'An espresso with steamed microfoam milk' },
    CAPPUCCINO: { value: 'cappuccino', description: 'An espresso with steamed and foamed milk' },
    LATTE: { value: 'latte', description: 'An espresso with a large share of steamed milk' },
    MOKA: { value: 'moka', description: 'A stovetop pot, e.g. a Bialetti' },
    V60: { value: 'v60', description: 'A cone pour-over, e.g. a Hario V60' },
    CHEMEX: { value: 'chemex', description: 'A Chemex pour-over, on its thick paper filter' },
    DRIP: { value: 'drip', description: 'A filter machine, e.g. a Moccamaster' },
    AEROPRESS: { value: 'aeropress', description: 'An AeroPress, brewed under hand pressure' },
    FRENCH_PRESS: { value: 'french-press', description: 'A French press, full immersion' },
    COLD_BREW: { value: 'cold-brew', description: 'A long cold-water extraction' },
    OTHER: {
      value: 'other',
      description: 'Any other way of brewing — where a coffee lands when none of the above fits',
    },
  } as const,
})

export const DishCategoryEnum = builder.enumType('DishCategory', {
  description:
    'The course a dish belongs to. Detected once at import, shared by every version, and used ' +
    'to group and sort the library.',
  values: {
    STARTER: { value: 'starter', description: 'Starter, e.g. `"Goat cheese salad"`' },
    MAIN: { value: 'main', description: 'Main course, e.g. `"Grandma’s lasagna"`' },
    DESSERT: { value: 'dessert', description: 'Dessert, e.g. `"Tarte tatin"`' },
    SOUP: { value: 'soup', description: 'Soup, e.g. `"Pumpkin velouté"`' },
    SAUCE: { value: 'sauce', description: 'Sauce or condiment, e.g. `"Béchamel"`' },
    BAKING: { value: 'baking', description: 'Bread and bakery, e.g. `"Sourdough loaf"`' },
    DRINK: { value: 'drink', description: 'Drink, e.g. `"Ginger lemonade"`' },
  } as const,
})

export const RecipeSortEnum = builder.enumType('RecipeSort', {
  description: 'Field the paginated recipe library is ordered by, e.g. `UPDATED_AT`',
  values: {
    UPDATED_AT: {
      value: 'updatedAt',
      description: 'Most recently modified first (honours order), e.g. today’s lasagna edit on top',
    },
    CATEGORY: {
      value: 'category',
      description:
        'Dish course order (`STARTER → MAIN → DESSERT → SOUP → SAUCE → BAKING → DRINK`), ' +
        'most recently modified first within a course',
    },
    METHOD: {
      value: 'method',
      description:
        'Brewing order (`ESPRESSO → … → COLD_BREW → OTHER`), most recently modified first ' +
        'within a method — the coffee tab’s own order',
    },
  } as const,
})

export const SortOrderEnum = builder.enumType('SortOrder', {
  description: 'Sort direction, e.g. `DESC`',
  values: {
    ASC: { value: 'asc', description: 'Ascending (oldest / lowest first), e.g. `v1` first' },
    DESC: { value: 'desc', description: 'Descending (newest / highest first), e.g. `v3` first' },
  } as const,
})

export const VersionOriginKindEnum = builder.enumType('VersionOriginKind', {
  description: 'Where a version came from — how this entry in the lineage was born, e.g. `IMPORT`',
  values: {
    IMPORT: {
      value: 'import',
      description:
        'The original `v1`, created when the recipe was imported, e.g. from `"Marmiton"`',
    },
    AI_PROPOSAL: {
      value: 'ai-proposal',
      description:
        'An iteration the AI proposed from the previous attempt and the cook accepted, e.g. ' +
        '`"Less sugar, longer resting time"`',
    },
    MANUAL: {
      value: 'manual',
      description: 'A version the cook wrote by hand, without the AI, e.g. `"Swapped in honey"`',
    },
  } as const,
})
