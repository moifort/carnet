import { callGemini, promptBody } from '~/system/ai/gemini'
import { parseCoffeeChangeResponse } from '~/system/ai/primitives'
import { formatParameters } from '~/system/ai/proposal/coffee'
import { coffeeParametersSchemaProperty } from '~/system/ai/schema'
import type { CoffeeChange, CoffeeChangeContext } from '~/system/ai/types'

const responseSchema = {
  type: 'object',
  properties: {
    changeSummary: {
      type: 'string',
      description:
        'What the cook changed, written in French as "label old → new", where → is the arrow character U+2192 — ALWAYS that character between the old and the new value, never a comma, a dash, a slash or quotes (e.g. "Mouture Niveau 12 → Niveau 10"). Several changes are joined by ", ". ≤200 characters',
    },
    parameters: coffeeParametersSchemaProperty,
  },
  required: ['changeSummary', 'parameters'],
  propertyOrdering: ['changeSummary', 'parameters'],
}

// A brewed change is transcribed, never advised: the single-variable rule of the
// proposal prompt does not apply here — the cook may well have moved two dials at
// once, and what they drank is what gets written down.
const APPLY_RULE =
  'Apply EXACTLY what the cook describes, and NOTHING else. This is a transcription, not an iteration: the cook already brewed this version and already drank it, so you are writing down what they did, never improving on it. Return the COMPLETE parameters with the change applied, each value in its own field. Every parameter the change does not mention comes back byte-for-byte identical, including the beans (name, country, producer, roast date), the kind of water and the gear (machine, grinder, machine profile). Move as many dials as the cook actually moved — one, or several — and never one more. NEVER fill in a parameter the current version leaves empty unless the change names it: a temperature nobody wrote down is a temperature nobody measured. Never change the brewing method: a V60 stays a V60. When the sentence describes something no parameter can carry (a remark on the taste), return the parameters untouched and say so in changeSummary.'

const prompt = (context: CoffeeChangeContext): string =>
  `You are the assistant of a coffee brewing notebook. The cook has ALREADY changed this coffee, ALREADY brewed it and ALREADY drunk it. Write that version down.

MANDATORY: write every generated value — change summary, parameter values — in French. The reader is a French speaker; never answer in English.

${APPLY_RULE}

Brewing method (fixed, never change it): ${context.method}

Current parameters:
${formatParameters(context.currentParameters)}

Change made by the cook:
${context.change}

Fill changeSummary (what they changed) and parameters (the COMPLETE set of the version they brewed).

Reminder: all text values you produce must be written in French.`

export const apply = async (context: CoffeeChangeContext): Promise<CoffeeChange> => {
  const text = await callGemini(promptBody(prompt(context), responseSchema))
  if (!text) throw new Error('Gemini did not return a structured change')
  return parseCoffeeChangeResponse(text)
}
