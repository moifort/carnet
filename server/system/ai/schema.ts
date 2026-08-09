import { OVEN_RANGE } from '~/domain/recipe/limits'
import { OVEN_PROGRAM_VALUES } from '~/domain/recipe/types'

// The Gemini response-schema fragments, in one place so an import and a proposal
// of the same world can never describe the same field differently.

export const ingredientsSchemaProperty = {
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
// not performed on the Thermomix (or on a recipe that is not a Thermomix one).
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

export const stepsSchemaProperty = {
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
    },
    required: ['text'],
    propertyOrdering: ['text', 'thermomix'],
  },
}

// A coffee's parameters — what it IS, as opposed to gestures nobody logs twice.
// Null field by field for everything the source does not state: a guessed roast
// date would falsify the whole log.
export const coffeeParametersSchemaProperty = {
  type: 'object',
  description:
    'The parameters of a coffee. Never invent a value the source does not give — the only ' +
    'exception is a value entirely determined by one you did read',
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
          description:
            'What the milk is, its type then its brand (e.g. "Avoine Oatly", "Vache entier ' +
            'Grandlait"); null when not stated',
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

// The oven a dish bakes in. Null on anything cooked on a hob, raw or assembled —
// and a setting the source does not state is never guessed: a made-up temperature
// is a temperature the cook then bakes against.
export const ovenSchemaProperty = {
  type: 'object',
  nullable: true,
  description:
    'The oven settings, ONLY when the source states an oven cooking; null otherwise. Never ' +
    'invent a value the source does not give.',
  properties: {
    program: {
      type: 'string',
      enum: OVEN_PROGRAM_VALUES,
      description:
        'The heating function. "chaleur tournante"/"fan" → convection; a plain oven or a ' +
        'thermostat number → conventional; "gril" → grill; "vapeur" → steam. When the source ' +
        'gives a temperature but names no function, use conventional.',
    },
    temperature: {
      type: 'integer',
      description: `Dial temperature in °C, ${OVEN_RANGE.temperature.min}–${OVEN_RANGE.temperature.max}. A French gas mark "th. N" means N × 30 °C (th. 6 = 180).`,
    },
    duration: {
      type: 'integer',
      nullable: true,
      description: `Cooking time in WHOLE MINUTES, ${OVEN_RANGE.duration.min}–${OVEN_RANGE.duration.max} (e.g. "1 h 15" → 75); null when the source states none`,
    },
    core: {
      type: 'integer',
      nullable: true,
      description: `Target temperature at the HEART of the food, read by a probe, ${OVEN_RANGE.core.min}–${OVEN_RANGE.core.max} °C (e.g. "63°C à cœur" → 63); null unless the source names a core temperature`,
    },
  },
  required: ['program', 'temperature'],
  propertyOrdering: ['program', 'temperature', 'duration', 'core'],
}

export const tipsSchemaProperty = {
  type: 'array',
  description:
    'Cooking tips (serving, storage, technique advice — neither an ingredient nor a step), ' +
    'written in French. One short sentence per tip, ≤300 characters. Empty array when there are none.',
  items: { type: 'string' },
}
