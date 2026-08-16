import { callGemini, promptBody } from '~/system/ai/gemini'
import { parseCookingChangeResponse } from '~/system/ai/primitives'
import { formatThermomix } from '~/system/ai/proposal/cooking'
import { ingredientsSchemaProperty, stepsSchemaProperty } from '~/system/ai/schema'
import type { CookingChange, CookingChangeContext } from '~/system/ai/types'

const responseSchema = {
  type: 'object',
  properties: {
    changeSummary: {
      type: 'string',
      description:
        'Short summary of what the cook changed, written in French. One change = "label old → new unit", where → is the arrow character U+2192 — ALWAYS that character between the old and the new value, never a comma, a dash, a slash or quotes (e.g. "Sucre 20 → 10 g"). Several changes are joined by ", " (e.g. "Sucre 20 → 10 g, cuisson 3 h 30 → 4 h"). ≤200 characters',
    },
    ingredients: ingredientsSchemaProperty,
    steps: stepsSchemaProperty,
  },
  required: ['changeSummary', 'ingredients', 'steps'],
  propertyOrdering: ['changeSummary', 'ingredients', 'steps'],
}

// The whole difference with the proposal prompt, which exists to have an opinion:
// here the cook already had theirs, at the stove, and ate the result. Transcribing
// is the entire job — anything invented would be attributed to a plate that was
// actually made.
const APPLY_RULE =
  'Apply EXACTLY what the cook describes, and NOTHING else. This is a transcription, not an iteration: the cook already made this version and already ate it, so you are writing down what they did, never improving on it. Everything the change does not mention stays strictly identical — the same ingredients in the same order with the same quantities, the same steps with the same wording and the same settings. Never add, remove, reorder or reword anything the change does not touch, never round a value, never "fix" a recipe you find odd. Return the COMPLETE ingredient and step list with the change applied, plus changeSummary, which records every change as "old → new" with the arrow character U+2192 between the two, whether the change is a new value or one ingredient replacing another. Put each change in its right structured field — a Thermomix time/temperature/speed in the step settings, a duration in the dish step text, a quantity on the ingredient. When the sentence is ambiguous, take the most literal reading and change the least. When it describes something no ingredient and no step can carry (a remark about the result, a comment on the taste), return the lists untouched and say so in changeSummary. NEVER touch the oven: its programme, temperature, duration and probe are set by hand, on the appliance or in the app.'

const prompt = (context: CookingChangeContext): string => {
  const ingredients =
    context.currentIngredients.map(({ name, quantity }) => `- ${name} : ${quantity}`).join('\n') ||
    '—'
  const steps =
    context.currentSteps
      .map((s, i) => `${i + 1}. ${s.text}${formatThermomix(s.thermomix)}`)
      .join('\n') || '—'

  return `You are the assistant of a culinary experimentation notebook. The cook has ALREADY changed this recipe, ALREADY cooked it and ALREADY eaten the result. Write that version down.

MANDATORY: write every generated value — change summary, ingredient names and quantities, step text — in French. The reader is a French speaker; never answer in English.

${APPLY_RULE}

Current ingredients:
${ingredients}

Current steps:
${steps}

Change made by the cook:
${context.change}

Fill changeSummary (a short summary of what they changed), ingredients and steps (the COMPLETE lists of the version they cooked).

Reminder: all text values you produce must be written in French.`
}

export const apply = async (context: CookingChangeContext): Promise<CookingChange> => {
  const text = await callGemini(promptBody(prompt(context), responseSchema))
  if (!text) throw new Error('Gemini did not return a structured change')
  return parseCookingChangeResponse(text)
}
