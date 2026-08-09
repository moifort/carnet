import { callGemini, promptBody } from '~/system/ai/gemini'
import { parseCookingProposalResponse } from '~/system/ai/primitives'
import { formatRequest } from '~/system/ai/prompt'
import {
  ingredientsSchemaProperty,
  ovenSchemaProperty,
  stepsSchemaProperty,
  tipsSchemaProperty,
} from '~/system/ai/schema'
import type {
  CookingProposal,
  CookingProposalContext,
  ImportOvenProfile,
  ImportStep,
} from '~/system/ai/types'

const responseSchema = {
  type: 'object',
  properties: {
    changeSummary: {
      type: 'string',
      description:
        'Short summary of what changes, written in French. One change = "label old → new unit", where → is the arrow character U+2192 — ALWAYS that character between the old and the new value, never a comma, a dash, a slash or quotes. Replacing one thing by another is written the same way (e.g. "Citrons jaunes 2-3 pièces → Pomelo 1 pièce"). Several changes are joined by ", " (e.g. "Bouillon 50 → 40 cl, cuisson 3 h 30 → 4 h"). ≤200 characters',
    },
    rationale: { type: 'string', description: 'Explanation of the reasoning, written in French' },
    ingredients: ingredientsSchemaProperty,
    steps: stepsSchemaProperty,
    tips: tipsSchemaProperty,
    oven: ovenSchemaProperty,
  },
  required: ['changeSummary', 'rationale', 'ingredients', 'steps', 'tips'],
  propertyOrdering: ['changeSummary', 'rationale', 'ingredients', 'steps', 'tips', 'oven'],
}

// How far one iteration may go here: cooking converges faster when several coherent
// elements move together (a coffee, whose single-variable rule is the opposite,
// lives in its own module).
const ITERATION_RULE =
  'For a dish or a Thermomix recipe, you may adjust several coherent elements at once. Return the COMPLETE ingredient and step list of the next version (not only what changes), plus a short summary of the changes. When the remarks ask for a precise adjustment (a new cooking time, temperature, speed or quantity), apply that exact value in the right structured field — a Thermomix time/temperature/speed in the step settings, a duration in the dish step text, a quantity on the ingredient — and record every change in changeSummary as "old → new", with the arrow character U+2192 between the two, whether the change is a new value or one ingredient replacing another. Also return tips: the COMPLETE tips list of the next version — keep the current tips, and when a remark carries advice that changes nothing in the method (a serving suggestion, storage advice, a technique pointer like "la prochaine fois, servir avec du riz"), fold it in as a short reworded tip instead of forcing it into an ingredient or a step. The OVEN PROFILE counts as ONE element: lower the temperature OR shorten the cooking, never both in the same iteration, and only when the remarks point at the baking ("trop cuit", "pas assez doré", "cru au centre"). When the iteration changes anything else, echo the current oven profile back UNCHANGED — a proposal that drops it would silently unset the oven. Return null for oven only when the current version has none.'

// The current oven profile, spelled out for the prompt. A dish that never bakes
// says so plainly rather than leaving the model to guess from a blank.
const formatOven = (oven: ImportOvenProfile | undefined): string => {
  if (!oven) return 'This dish does not go in the oven.'
  const parts = [
    `program ${oven.program}`,
    `${oven.temperature}°C`,
    oven.duration && `${oven.duration} min`,
    oven.core && `core ${oven.core}°C`,
  ].filter(Boolean)
  return parts.join(', ')
}

// A step's Thermomix settings, spelled out for the prompt. A step that sets nothing
// adds nothing.
export const formatThermomix = (settings: ImportStep['thermomix']): string => {
  const parts = [
    settings.time && `time ${settings.time}`,
    settings.temperature && `temperature ${settings.temperature}`,
    settings.speed && `speed ${settings.speed}`,
    settings.reverse && 'reverse rotation',
  ].filter(Boolean)
  return parts.length ? ` [Thermomix: ${parts.join(', ')}]` : ''
}

const prompt = (context: CookingProposalContext): string => {
  const ingredients =
    context.currentIngredients.map((i) => `- ${i.name} : ${i.quantity}`).join('\n') || '—'
  const steps =
    context.currentSteps
      .map((s, i) => `${i + 1}. ${s.text}${formatThermomix(s.thermomix)}`)
      .join('\n') || '—'
  const tips = context.currentTips.map((t) => `- ${t}`).join('\n') || '—'

  return `You are the assistant of a culinary experimentation notebook. Analyse what is asked below and propose the NEXT version of the recipe.

MANDATORY: write every generated value — change summary, rationale, ingredient names and quantities, step text — in French. The reader is a French speaker; never answer in English.

${ITERATION_RULE}

Current ingredients:
${ingredients}

Current steps:
${steps}

Current tips:
${tips}

Current oven:
${formatOven(context.currentOven)}

${formatRequest(context)}

Propose an iteration: an improvement of this recipe. Fill changeSummary (a short summary of what changes), rationale (why), ingredients, steps and tips (the COMPLETE lists of the next version), and oven (the next version's oven profile — the current one unchanged unless THIS iteration is what moves it, null when the dish never bakes).

Reminder: all text values you produce must be written in French.`
}

export const propose = async (context: CookingProposalContext): Promise<CookingProposal> => {
  const text = await callGemini(promptBody(prompt(context), responseSchema))
  if (!text) throw new Error('Gemini did not return a structured proposal')
  return parseCookingProposalResponse(text)
}
