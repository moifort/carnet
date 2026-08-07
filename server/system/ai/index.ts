import { createHash } from 'node:crypto'
import { BREW_METHOD_VALUES, DISH_CATEGORY_VALUES, RECIPE_TYPE_VALUES } from '~/domain/recipe/types'
import {
  ImportHash,
  parseImportResponse,
  parseProposalResponse,
  parseTipsResponse,
} from '~/system/ai/primitives'
import * as repository from '~/system/ai/repository'
import type {
  ImportCoffeeParameters,
  ImportHash as ImportHashType,
  ImportSource,
  ImportStep,
  Proposal,
  ProposalContext,
  TipsContext,
} from '~/system/ai/types'
import { config } from '~/system/config/index'

const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'

// Under the function's own 60 s budget, with room left to answer.
const GEMINI_TIMEOUT_MS = 45_000

type GeminiResponse = { candidates?: { content: { parts: { text?: string }[] } }[] }

type GeminiPart = { text: string } | { inline_data: { mime_type: string; data: string } }

const RECIPE_TYPE_ENUM = [...RECIPE_TYPE_VALUES]
const BREW_METHOD_ENUM = [...BREW_METHOD_VALUES]

// Shared ingredient/step item shapes so the import and proposal schemas can't drift.
const ingredientsSchemaProperty = {
  type: 'array',
  description: 'Recipe ingredients with their quantity, written in French',
  items: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description:
          'Short name of the ingredient in French (e.g. "Gin", "Beurre", "Pommes de terre"). Transient preparation (peeled, sliced…) belongs in the steps, NOT in the name. But an intrinsic variety, type or grade (a potato cultivar, a flour type, a cocoa percentage) belongs in the name, in parentheses: "Pommes de terre (Marbella)", "Farine (T45)", "Chocolat noir (70 %)". ≤120 characters.',
      },
      quantity: {
        type: 'string',
        description:
          'Quantity with its unit, in French (e.g. "50 ml", "170 g", "3 pièces"). When the unit is an imprecise kitchen measure (spoon, pinch, glass, cup…), append the estimated gram equivalent for THAT ingredient in parentheses: "1 c. à café (6 g)" for salt, "1 c. à soupe (8 g)" for flour. Metric weights/volumes and countable pieces stay as-is. ≤60 characters',
      },
    },
    required: ['name', 'quantity'],
  },
}

// Nested Thermomix settings for one step. Every field is null on a step that is
// not performed on the Thermomix (or on a non-Thermomix recipe).
const thermomixSettingsSchemaProperty = {
  type: 'object',
  nullable: true,
  description: 'Thermomix settings for this step; null (or every field null) when it has none',
  properties: {
    time: {
      type: 'string',
      nullable: true,
      description: 'Thermomix time (e.g. "3 min", "30 s"); null when the step has none',
    },
    temperature: {
      type: 'string',
      nullable: true,
      description: 'Thermomix temperature (e.g. "100°C", "Varoma"); null when the step has none',
    },
    speed: {
      type: 'string',
      nullable: true,
      description:
        'Thermomix speed (e.g. "5", "3,5", "pétrin", "mijotage", "turbo"); null when the step has none',
    },
    reverse: {
      type: 'boolean',
      nullable: true,
      description: 'Reverse rotation enabled; null when the step has none',
    },
  },
  propertyOrdering: ['time', 'temperature', 'speed', 'reverse'],
}

// Nested extraction settings for one brewing step. Every field is null on a step
// that sets nothing (or on a recipe that is not a coffee).
const coffeeSettingsSchemaProperty = {
  type: 'object',
  nullable: true,
  description: 'Extraction settings for this step; null (or every field null) when it has none',
  properties: {
    grind: {
      type: 'string',
      nullable: true,
      description:
        'Grind size (e.g. "fine", "moyenne", "grossière", "Niveau 12"); null when the step has none',
    },
    water: {
      type: 'string',
      nullable: true,
      description:
        'Water poured at THIS step (e.g. "50 g" for a bloom, "300 g"); null when the step has none',
    },
    temperature: {
      type: 'string',
      nullable: true,
      description: 'Water temperature (e.g. "93°C"); null when the step has none',
    },
    time: {
      type: 'string',
      nullable: true,
      description: 'Duration of this step (e.g. "28 s", "4 min"); null when the step has none',
    },
    yield: {
      type: 'string',
      nullable: true,
      description:
        'What lands in the cup at the end of this step (e.g. "36 g" for a double espresso); null when the step has none',
    },
  },
  propertyOrdering: ['grind', 'water', 'temperature', 'time', 'yield'],
}

// A coffee's parameters — what it IS, as opposed to the gestures that brew it.
// Null on anything that is not a coffee, and null field by field for everything
// the source does not state: a guessed roast date would falsify the whole log.
const coffeeParametersSchemaProperty = {
  type: 'object',
  nullable: true,
  description:
    'The parameters of a coffee; null on anything that is not of type coffee. Never invent a value the source does not give',
  properties: {
    beans: {
      type: 'object',
      nullable: true,
      description: 'The coffee itself, as the bag names it',
      properties: {
        name: {
          type: 'string',
          nullable: true,
          description: 'Roaster and lot (e.g. "Belleville — Guji"); null when not stated',
        },
        country: {
          type: 'string',
          nullable: true,
          description: 'Origin country (e.g. "Éthiopie"); null when not stated',
        },
        producer: {
          type: 'string',
          nullable: true,
          description:
            'Farm, washing station or co-op (e.g. "Coop. Hambela"); null when not stated',
        },
        roastedOn: {
          type: 'string',
          nullable: true,
          description: 'Roast date, ISO 8601 (e.g. "2026-06-12"); null when not stated',
        },
        dose: {
          type: 'string',
          nullable: true,
          description: 'Ground coffee in (e.g. "18 g"); null when not stated',
        },
      },
      propertyOrdering: ['name', 'country', 'producer', 'roastedOn', 'dose'],
    },
    water: {
      type: 'object',
      nullable: true,
      description: 'The water',
      properties: {
        kind: {
          type: 'string',
          nullable: true,
          description:
            'What the water is (e.g. "Robinet (dureté 3/5)", "Volvic"); null when not stated',
        },
        amount: {
          type: 'string',
          nullable: true,
          description: 'TOTAL water (e.g. "300 g"); null when not stated',
        },
        temperature: {
          type: 'string',
          nullable: true,
          description: 'Water temperature (e.g. "93°C"); null when not stated',
        },
      },
      propertyOrdering: ['kind', 'amount', 'temperature'],
    },
    extraction: {
      type: 'object',
      nullable: true,
      description: 'The extraction dials',
      properties: {
        grind: {
          type: 'string',
          nullable: true,
          description: 'Grind size (e.g. "fine", "Niveau 12"); null when not stated',
        },
        time: {
          type: 'string',
          nullable: true,
          description: 'TOTAL brew time (e.g. "28 s", "4 min"); null when not stated',
        },
        yield: {
          type: 'string',
          nullable: true,
          description: 'What lands in the cup (e.g. "36 g"); null when not stated',
        },
      },
      propertyOrdering: ['grind', 'time', 'yield'],
    },
    milk: {
      type: 'object',
      nullable: true,
      description: 'The milk; null on a drink that has none (an espresso, a V60)',
      properties: {
        kind: {
          type: 'string',
          nullable: true,
          description: 'What the milk is (e.g. "Entier", "Avoine Oatly"); null when not stated',
        },
        amount: {
          type: 'string',
          nullable: true,
          description: 'How much milk (e.g. "150 ml"); null when not stated',
        },
        temperature: {
          type: 'string',
          nullable: true,
          description: 'Steaming temperature (e.g. "65°C"); null when not stated',
        },
      },
      propertyOrdering: ['kind', 'amount', 'temperature'],
    },
    gear: {
      type: 'object',
      nullable: true,
      description: 'What brews it and what grinds it',
      properties: {
        machine: {
          type: 'string',
          nullable: true,
          description:
            'Brand and model (e.g. "Rancilio Silvia", "Hario V60 02", "Moccamaster KBG"); null when not stated',
        },
        grinder: {
          type: 'string',
          nullable: true,
          description: 'Brand and model (e.g. "Niche Zero"); null when not stated',
        },
      },
      propertyOrdering: ['machine', 'grinder'],
    },
  },
  propertyOrdering: ['beans', 'water', 'extraction', 'milk', 'gear'],
}

const stepsSchemaProperty = {
  type: 'array',
  description: 'Short, actionable steps in order, written in French',
  items: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'Short step text, in French, imperative mood, ≤300 characters',
      },
      // Always return the step object; its settings are null on a step that is not
      // performed on the Thermomix (never skip or drop the step itself).
      thermomix: thermomixSettingsSchemaProperty,
      // Same, for a coffee's extraction settings.
      coffee: coffeeSettingsSchemaProperty,
    },
    required: ['text'],
    propertyOrdering: ['text', 'thermomix', 'coffee'],
  },
}

// Shared tips item shape (import, proposal and tips-formatting schemas), so the
// three can't drift.
const tipsSchemaProperty = {
  type: 'array',
  description:
    'Cooking tips (serving, storage, technique advice — neither an ingredient nor a step), ' +
    'written in French. One short sentence per tip, ≤300 characters. Empty array when there are none.',
  items: { type: 'string' },
}

const importResponseSchema = {
  type: 'object',
  properties: {
    recipeFound: {
      type: 'boolean',
      description: 'true if the source contains a usable recipe, false otherwise',
    },
    type: {
      type: 'string',
      enum: RECIPE_TYPE_ENUM,
      description:
        'Experiment type: dish (cooked recipe), thermomix (Thermomix) or coffee (brewed coffee)',
    },
    category: {
      type: 'string',
      enum: DISH_CATEGORY_VALUES,
      description: 'Dish category: starter, main, dessert, soup, sauce, baking or drink',
    },
    method: {
      type: 'string',
      nullable: true,
      enum: BREW_METHOD_ENUM,
      description:
        'How the coffee is brewed; null on anything that is not of type coffee. One of: ' +
        'espresso, americano, flat-white, cappuccino, latte, moka (Bialetti), v60, chemex, ' +
        'drip (filter machine, Moccamaster), aeropress, french-press, cold-brew, other',
    },
    title: {
      type: 'string',
      description: 'Recipe name, in French (concise, ≤200 characters)',
    },
    sourceLabel: {
      type: 'string',
      nullable: true,
      description: 'Recipe source (author, website, book) if identifiable',
    },
    ingredients: ingredientsSchemaProperty,
    coffee: coffeeParametersSchemaProperty,
    steps: stepsSchemaProperty,
    tips: { ...tipsSchemaProperty, nullable: true },
  },
  required: ['recipeFound', 'type', 'category', 'title'],
  propertyOrdering: [
    'recipeFound',
    'type',
    'category',
    'method',
    'title',
    'sourceLabel',
    'ingredients',
    'coffee',
    'steps',
    'tips',
  ],
}

const proposalResponseSchema = {
  type: 'object',
  properties: {
    changeSummary: {
      type: 'string',
      description:
        'Short summary of what changes, written in French. One change = "label old → new unit", where → is the arrow character U+2192 — ALWAYS that character between the old and the new value, never a comma, a dash, a slash or quotes. Replacing one thing by another is written the same way (e.g. "Citrons jaunes 2-3 pièces → Pomelo 1 pièce"). Several changes are joined by ", " (e.g. "Bouillon 50 → 40 cl, cuisson 3 h 30 → 4 h"). ≤200 characters',
    },
    rationale: { type: 'string', description: 'Explanation of the reasoning, written in French' },
    ingredients: ingredientsSchemaProperty,
    coffee: coffeeParametersSchemaProperty,
    steps: stepsSchemaProperty,
    tips: tipsSchemaProperty,
  },
  required: ['changeSummary', 'rationale', 'ingredients', 'steps', 'tips'],
  propertyOrdering: ['changeSummary', 'rationale', 'ingredients', 'coffee', 'steps', 'tips'],
}

const tipsResponseSchema = {
  type: 'object',
  properties: { tips: tipsSchemaProperty },
  required: ['tips'],
  propertyOrdering: ['tips'],
}

const IMPORT_INSTRUCTIONS = `You are the assistant of a culinary experimentation notebook. From the provided source (photos, web page or recipe text), extract a STRUCTURED and REPRODUCIBLE recipe.

Rules:
- MANDATORY: write every generated value — title, ingredient names and quantities, step text — in French. The reader is a French speaker; never answer in English.
- Determine the type: dish (cooked recipe), thermomix (Thermomix recipe) or coffee (a brewed coffee — espresso, filter, pour-over, stovetop, immersion, or a milk drink built on an espresso).
- Determine the dish category: starter, main, dessert, soup, sauce, baking (pastry, bread, viennoiserie) or drink (cocktail, smoothie, hot or cold beverage). When in doubt, pick main. For type coffee, always answer drink.
- ingredients: the ORDERED list of the recipe's components with their quantity (e.g. Gin → 50 ml, Beurre → 170 g, Fraise → 3 pièces). Include EVERY ingredient visible in the source, each with its quantity and unit. This is the recipe's "shopping list". The NAME stays short: the ingredient alone, never its transient preparation ("Pommes de terre", not "Pommes de terre épluchées et coupées en rondelles" — the preparation belongs in the steps). An intrinsic variety, type or grade stays in the name, in parentheses ("Pommes de terre (Marbella)", "Farine (T45)"). A QUANTITY in an imprecise kitchen unit (spoon, pinch, glass, cup…) carries its estimated gram equivalent in parentheses, specific to that ingredient ("1 c. à café (6 g)" for salt) — quantities already in metric weight/volume and countable pieces stay as-is.
- steps: short steps, imperative mood, in order. Precise settings (oven temperature, duration, ratio…) stay in the step text.
- tips: the cooking tips found in the source — serving suggestions, storage/freezing advice, technique pointers ("Servir avec du riz", "Se congèle bien"). One short sentence per tip. A tip is neither an ingredient nor a step: never duplicate the method here. Empty array when the source carries none.
- For a Thermomix recipe (type thermomix): for every step performed on the Thermomix, fill the nested thermomix object (time, temperature, speed, reverse) exactly as stated in the recipe (time "3 min" / "30 s" / "1 h 10 min"; temperature "100°C" or "Varoma"; speed "0,5" to "10", "pétrin", "mijotage" or "turbo"). ALWAYS return every step as an object: use null for every missing setting, and set thermomix to null (or leave its fields null) when the step is not done on the Thermomix or when the recipe is not of type thermomix — never omit or merge a step because it carries no setting.
- For a coffee (type coffee):
  - method: how it is brewed. espresso, americano, flat-white, cappuccino or latte for a machine drink; moka for a stovetop pot (Bialetti); v60 or chemex for a pour-over; drip for a filter machine (Moccamaster, cafetière filtre); aeropress; french-press; cold-brew. Use other ONLY when none of these fits — never force a coffee into a method it was not made with.
  - ingredients: leave it empty. A coffee has no ingredient list — its dose, its water and its milk are parameters.
  - coffee: the parameters, read off the source and NEVER guessed. beans (name as the bag spells it, country, producer, roast date, dose), water (what the water is — "Robinet (dureté 3/5)", "Volvic" —, the TOTAL amount, the temperature), extraction (grind, TOTAL brew time, what lands in the cup), milk (null unless the drink has some), gear (machine and grinder, brand and model). Use null for anything the source does not state: a missing value is information, an invented one is a lie the cook will brew against.
  - steps: only for a method that has gestures — a pour-over (v60, chemex), an immersion (french-press, aeropress, cold-brew), a filter machine, a milk drink to steam. An espresso is wholly described by its parameters: return an empty array. When there ARE steps, fill the nested coffee object of each one that carries a parameter: grind ("fine", "moyenne", "grossière", or a grinder setting like "Niveau 12"), water (the amount poured AT THAT STEP — "50 g" for a bloom, not the total), temperature ("93°C"), time ("28 s", "4 min"), yield (what lands in the cup at that step). Use null for every missing setting, and set coffee to null when the step carries none — never omit or merge a step because it carries no setting.
  - The whole point is reproducibility: a dose, a grind, a temperature, a time or a yield stated in the source goes into the structured field, never only in the step text.
- Be concise: every value stays short (ingredient name ≤120, quantity ≤60, step ≤300, title ≤200, Thermomix setting ≤20, extraction setting ≤30 characters).
- If the source contains no usable recipe (unreadable image or one without a recipe, off-topic page or text), set recipeFound to false and leave every other field empty or null. Otherwise set recipeFound to true.
- Use null for any missing information.

Reminder: all text values you produce must be written in French.`

const CUISINE_ITERATION_RULE =
  'For a dish or a Thermomix recipe, you may adjust several coherent elements at once. Return the COMPLETE ingredient and step list of the next version (not only what changes), plus a short summary of the changes. When the remarks ask for a precise adjustment (a new cooking time, temperature, speed or quantity), apply that exact value in the right structured field — a Thermomix time/temperature/speed in the step settings, a duration in the dish step text, a quantity on the ingredient — and record every change in changeSummary as "old → new", with the arrow character U+2192 between the two, whether the change is a new value or one ingredient replacing another. Also return tips: the COMPLETE tips list of the next version — keep the current tips, and when a remark carries advice that changes nothing in the method (a serving suggestion, storage advice, a technique pointer like "la prochaine fois, servir avec du riz"), fold it in as a short reworded tip instead of forcing it into an ingredient or a step.'

// The scientific constraint of the notebook, and the reason a coffee log is worth
// keeping: change one thing, taste, learn what that one thing did.
const COFFEE_ITERATION_RULE =
  'For a coffee, change EXACTLY ONE variable in this version, and only one of these: the grind, the dose, the water amount (the ratio), the water temperature, the brew time, the yield, or the milk. Never two. This is the whole point: with a single variable moved, the next tasting says what that variable did; move two and the result teaches nothing. When the remarks call for several changes, pick the ONE that most likely explains what was tasted (a sour, under-extracted cup asks for a finer grind, a hotter water or a longer contact; a bitter, over-extracted one for the opposite), apply it, and say in the rationale which change you are holding back for the iteration after this one. NEVER change the beans (name, country, producer, roast date), the kind of water, or the gear (machine, grinder): those are what the cook observed, not dials you may turn — your job is to set an extraction, not to tell them what to buy. Return them unchanged. Never change the brewing method either: a V60 recipe stays a V60. Return the COMPLETE coffee parameters of the next version in the coffee object (not only what changes), with the new value in its own field, plus the complete step list — never write a value only in a step text. Leave ingredients empty: a coffee has none. changeSummary names the single variable and its move, as "label old → new", with the arrow character U+2192 between the two (e.g. "Mouture Niveau 12 → Niveau 10", "Température 93 → 95°C"). Also return tips: the COMPLETE tips list of the next version — keep the current tips, and when a remark carries advice that changes nothing in the extraction (how to serve it, which beans suit it, how to store them), fold it in as a short reworded tip.'

export namespace Ai {
  export const analyzeImport = async (source: ImportSource) => {
    const importHash = hashSource(source)
    const cached = await repository.findBy(importHash)
    if (cached) return cached.result

    const parts = importParts(source)
    const body: Record<string, unknown> = {
      contents: [{ parts }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: importResponseSchema,
      },
    }
    // A URL source needs web access to read the page.
    if (source.kind === 'url') body.tools = [{ google_search: {} }]

    const text = await callGemini(body)
    if (!text) throw new Error('Gemini did not return a structured recipe')
    const result = parseImportResponse(text)
    // The cache stores only real analyses; a "no recipe" outcome must re-scan on
    // the next attempt rather than serve a memoized miss.
    if (result === 'no-recipe-found') return result
    // Best-effort cache: a failed write only costs a re-analysis on the next hit.
    repository.save({ importHash, result, cachedAt: new Date() }).catch(() => {})
    return result
  }

  export const proposeNext = async (context: ProposalContext): Promise<Proposal> => {
    const text = await callGemini({
      contents: [{ parts: [{ text: proposalPrompt(context) }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: proposalResponseSchema,
      },
    })
    if (!text) throw new Error('Gemini did not return a structured proposal')
    return parseProposalResponse(text)
  }

  // Merge the cook's raw advice into the version's tips list. No version is at
  // stake: the answer is the complete reworded list the current version's tips are
  // replaced with (once accepted — nothing is persisted here).
  export const formatTips = async (context: TipsContext): Promise<string[]> => {
    const text = await callGemini({
      contents: [{ parts: [{ text: tipsPrompt(context) }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: tipsResponseSchema,
      },
    })
    if (!text) throw new Error('Gemini did not return structured tips')
    return parseTipsResponse(text)
  }

  const tipsPrompt = (context: TipsContext): string => {
    const ingredients =
      context.currentIngredients.map((i) => `- ${i.name} : ${i.quantity}`).join('\n') || '—'
    const steps =
      context.currentSteps.map((s, i) => `${i + 1}. ${s.text}${formatSettings(s)}`).join('\n') ||
      '—'
    const tips = context.currentTips.map((t) => `- ${t}`).join('\n') || '—'

    return `You are the assistant of a culinary experimentation notebook. The cook wants to add tips to this recipe — serving suggestions, storage advice, technique pointers. Merge them into the recipe's tips list.

MANDATORY: write every tip in French. The reader is a French speaker; never answer in English.

Rules:
- Return the COMPLETE tips list: every current tip kept, plus the requested advice folded in.
- Reword each requested tip into one short, clear sentence (≤300 characters). A tip is neither an ingredient nor a step: never restate the method.
- Deduplicate: when a requested tip says the same thing as a current one, keep a single merged tip.
- The recipe below is context for the rewording only — change nothing else about it.

Current ingredients:
${ingredients}

Current steps:
${steps}

Current tips:
${tips}

Tips requested by the cook, in their own words:
${context.requested}

Reminder: all tips you produce must be written in French.`
  }

  const importParts = (source: ImportSource): GeminiPart[] => {
    if (source.kind === 'photos') {
      // The photos are the recipe; the text the cook typed alongside them completes
      // or corrects what they show, so it is stated as such rather than as a second
      // recipe to merge.
      const instructions = source.text
        ? `${IMPORT_INSTRUCTIONS}\n\nThe photos below are the recipe. The cook also typed this, which completes or corrects what the photos show — where the two disagree, what the cook typed wins:\n${source.text}`
        : IMPORT_INSTRUCTIONS
      return [
        { text: instructions },
        ...source.photos.map(
          (data): GeminiPart => ({ inline_data: { mime_type: 'image/jpeg', data } }),
        ),
      ]
    }
    if (source.kind === 'url') {
      return [{ text: `${IMPORT_INSTRUCTIONS}\n\nSource to read: ${source.url}` }]
    }
    return [{ text: `${IMPORT_INSTRUCTIONS}\n\nRecipe text:\n${source.text}` }]
  }

  // How far one iteration may go, and it differs by type: cooking converges faster
  // when several coherent elements move together, coffee only tells you anything
  // when a single variable moves at a time.
  const iterationRule = (type: ProposalContext['type']) =>
    type === 'coffee' ? COFFEE_ITERATION_RULE : CUISINE_ITERATION_RULE

  // A step's settings, spelled out for the prompt — the machine ones, then the
  // extraction ones. A step that sets nothing adds nothing.
  const formatSettings = (step: ImportStep): string =>
    `${formatThermomix(step.thermomix)}${formatCoffee(step.coffee)}`

  const formatThermomix = (settings: ImportStep['thermomix']): string => {
    const parts = [
      settings.time && `time ${settings.time}`,
      settings.temperature && `temperature ${settings.temperature}`,
      settings.speed && `speed ${settings.speed}`,
      settings.reverse && 'reverse rotation',
    ].filter(Boolean)
    return parts.length ? ` [Thermomix: ${parts.join(', ')}]` : ''
  }

  const formatCoffee = (settings: ImportStep['coffee']): string => {
    const parts = [
      settings.grind && `grind ${settings.grind}`,
      settings.water && `water ${settings.water}`,
      settings.temperature && `temperature ${settings.temperature}`,
      settings.time && `time ${settings.time}`,
      settings.yield && `yield ${settings.yield}`,
    ].filter(Boolean)
    return parts.length ? ` [Extraction: ${parts.join(', ')}]` : ''
  }

  // The coffee parameters, block by block, as the prompt shows them — the state the
  // single moved variable starts from. A field the cook never filled in is left out
  // rather than shown empty: nothing to iterate on there.
  const formatCoffeeParameters = (parameters: ImportCoffeeParameters): string => {
    const lines = [
      ['Beans', parameters.beans],
      ['Water', parameters.water],
      ['Extraction', parameters.extraction],
      ['Milk', parameters.milk],
      ['Gear', parameters.gear],
    ] as const
    return (
      lines
        .flatMap(([label, block]) => {
          const entries = Object.entries(block ?? {}).filter(([, value]) => value)
          return entries.length
            ? [`- ${label}: ${entries.map(([key, value]) => `${key} ${value}`).join(', ')}`]
            : []
        })
        .join('\n') || '—'
    )
  }

  const proposalPrompt = (context: ProposalContext): string => {
    const ingredients =
      context.currentIngredients.map((i) => `- ${i.name} : ${i.quantity}`).join('\n') || '—'
    const steps =
      context.currentSteps
        // Each step carries its own settings — an empty settings object is a plain step.
        .map((s, i) => `${i + 1}. ${s.text}${formatSettings(s)}`)
        .join('\n') || '—'
    const tips = context.currentTips.map((t) => `- ${t}`).join('\n') || '—'
    // The proposal answers either the cooks that were run, or — when the cook asked
    // for one outright — the improvement they described.
    const request = context.improvement
      ? `Improvement requested by the cook:\n${context.improvement}`
      : `Attempts made:\n${
          context.attempts
            .map((t) => `- Note ${t.rating}/5. Remarks: ${t.remarks || '—'}.`)
            .join('\n') || '—'
        }`

    return `You are the assistant of a culinary experimentation notebook. Analyse what is asked below and propose the NEXT version of the recipe.

MANDATORY: write every generated value — change summary, rationale, ingredient names and quantities, step text — in French. The reader is a French speaker; never answer in English.

${iterationRule(context.type)}
${context.method ? `\nBrewing method (fixed, never change it): ${context.method}\n` : ''}${
  context.currentCoffee
    ? `\nCurrent coffee parameters:\n${formatCoffeeParameters(context.currentCoffee)}\n`
    : `\nCurrent ingredients:\n${ingredients}\n`
}
Current steps:
${steps}

Current tips:
${tips}

${request}

Propose an iteration: an improvement of this recipe. Fill changeSummary (a short summary of what changes), rationale (why), ${
      context.currentCoffee ? 'coffee (the COMPLETE parameters)' : 'ingredients'
    }, steps and tips (the COMPLETE lists of the next version).

Reminder: all text values you produce must be written in French.`
  }

  const callGemini = async (body: Record<string, unknown>): Promise<string | undefined> => {
    const { googleApiKey } = config()
    const response = await $fetch<GeminiResponse>(`${GEMINI_API_URL}?key=${googleApiKey}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      // Give up before the function does (60 s, see nitro.config.ts): a Gemini call
      // that hangs must fail as our error, while there is still a request to answer
      // it with, rather than be killed mid-flight and surface as a platform 500.
      // The quota is recorded after the answer, so giving up costs the cook nothing.
      timeout: GEMINI_TIMEOUT_MS,
    })
    return response.candidates?.[0]?.content?.parts?.find((p) => p.text)?.text
  }

  const hashSource = (source: ImportSource): ImportHashType => {
    // 'v11' salts the cache: bumped from 'v10' because coffee became a recipe type,
    // with a brew method and per-step extraction settings — so previously-analysed
    // sources re-run instead of serving a stale result that knows none of it.
    // The text typed alongside photos is part of what was analysed, so it is part
    // of the key — two identical photo sets with different notes are two analyses.
    // Photos with no text hash exactly as before, keeping those entries valid.
    const material =
      source.kind === 'photos'
        ? `v11|${source.photos.join('|')}${source.text ? `|note:${source.text}` : ''}`
        : source.kind === 'url'
          ? `v11|url:${source.url}`
          : `v11|text:${source.text}`
    return ImportHash(createHash('sha256').update(material).digest('hex'))
  }
}
