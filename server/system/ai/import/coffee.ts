import { BREW_METHOD_VALUES } from '~/domain/recipe/types'
import { callGemini, importBody } from '~/system/ai/gemini'
import { parseCoffeeImportResponse } from '~/system/ai/primitives'
import { coffeeParametersSchemaProperty, tipsSchemaProperty } from '~/system/ai/schema'
import type { CoffeeImportAnalysis, ImportSource } from '~/system/ai/types'

const responseSchema = {
  type: 'object',
  properties: {
    coffeeFound: {
      type: 'boolean',
      description: 'true if the source shows a coffee to log, false otherwise',
    },
    method: {
      type: 'string',
      enum: [...BREW_METHOD_VALUES],
      description:
        'How the coffee is brewed. One of: espresso, americano, flat-white, cappuccino, ' +
        'latte, moka (Bialetti), v60, chemex, drip (filter machine, Moccamaster), aeropress, ' +
        'french-press, cold-brew, other',
    },
    title: {
      type: 'string',
      description: 'Name of the coffee, in French (concise, ≤200 characters)',
    },
    sourceLabel: {
      type: 'string',
      nullable: true,
      description: 'Source (roaster, website, book) if identifiable',
    },
    parameters: coffeeParametersSchemaProperty,
    tips: { ...tipsSchemaProperty, nullable: true },
  },
  required: ['coffeeFound', 'method', 'title', 'parameters'],
  propertyOrdering: ['coffeeFound', 'method', 'title', 'sourceLabel', 'parameters', 'tips'],
}

const INSTRUCTIONS = `You are the assistant of a coffee brewing notebook. From the provided source (a bag of beans, a photo of a machine screen, a recipe page or typed notes), extract the PARAMETERS of one brewed coffee.

Rules:
- MANDATORY: write every generated value in French. The reader is a French speaker; never answer in English.
- A coffee has NO ingredient list and NO steps: it is a set of dials. Never return either, and never write a value inside a sentence — every value goes in its own field.
- method: how it is brewed. espresso, americano, flat-white, cappuccino or latte for a machine drink; moka for a stovetop pot (Bialetti); v60 or chemex for a pour-over; drip for a filter machine (Moccamaster, cafetière filtre); aeropress; french-press; cold-brew. Use other ONLY when none of these fits — never force a coffee into a method it was not made with.
- parameters: beans (name as the bag spells it, country, producer, roast profile as it is worded — "Torréfaction claire", "Medium roast" —, roast date, dose), water (what the water is — "Robinet (dureté 3/5)", "Volvic" —, the TOTAL amount, the temperature), extraction (grind, TOTAL brew time, what lands in the cup), milk (null unless the drink has some, written as its type then its brand: "Avoine Oatly", "Vache entier Grandlait"), gear (machine and grinder, brand and model).
- Use null for anything the source does not state. ONE exception: a value ENTIRELY determined by another one you actually read may be computed — the total water from the dose at the method's ratio (about 1:2 on an espresso, 1:16 on a pour-over or a filter machine, 1:12 on an immersion), or the dose from the water the same way. Everything else — the name of the coffee, its country, its producer, its roast profile, its roast date, the grind, the temperature, the machine, the grinder — is NEVER guessed: a missing value is information, an invented one is a lie the cook will brew against.
- tips: the advice the source carries about this coffee (how to serve it, how to store the beans). One short sentence per tip. Empty array when there are none.
- Be concise: title ≤200 characters, a descriptive parameter ≤120, a measurement ≤30.
- If the source shows no coffee at all (an unreadable photo, an off-topic page, a cooked dish), set coffeeFound to false and leave every other field empty or null. Otherwise set coffeeFound to true.

Reminder: all text values you produce must be written in French.`

export const analyze = async (
  source: ImportSource,
): Promise<CoffeeImportAnalysis | 'no-recipe-found'> => {
  const text = await callGemini(importBody(INSTRUCTIONS, source, responseSchema))
  if (!text) throw new Error('Gemini did not return structured coffee parameters')
  return parseCoffeeImportResponse(text)
}
