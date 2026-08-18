import { callGemini, promptBody } from '~/system/ai/gemini'
import { parseCoffeeProposalResponse } from '~/system/ai/primitives'
import { formatRequest } from '~/system/ai/prompt'
import { coffeeParametersSchemaProperty, tipsSchemaProperty } from '~/system/ai/schema'
import type {
  CoffeeProposal,
  CoffeeProposalContext,
  ImportCoffeeParameters,
} from '~/system/ai/types'

const responseSchema = {
  type: 'object',
  properties: {
    changeSummary: {
      type: 'string',
      description:
        'The single variable that moves, written in French as "label old → new", where → is the arrow character U+2192 — ALWAYS that character between the old and the new value, never a comma, a dash, a slash or quotes (e.g. "Mouture Niveau 12 → Niveau 10"). ≤200 characters',
    },
    rationale: { type: 'string', description: 'Explanation of the reasoning, written in French' },
    parameters: coffeeParametersSchemaProperty,
    tips: tipsSchemaProperty,
  },
  required: ['changeSummary', 'rationale', 'parameters', 'tips'],
  propertyOrdering: ['changeSummary', 'rationale', 'parameters', 'tips'],
}

// The scientific constraint of the notebook, and the reason a coffee log is worth
// keeping: change one thing, taste, learn what that one thing did.
const ITERATION_RULE =
  'Change EXACTLY ONE variable in this version, and only one of these: the grind, the dose, the water amount (the ratio), the water temperature, the brew time, the yield, or the milk. Never two. This is the whole point: with a single variable moved, the next tasting says what that variable did; move two and the result teaches nothing. When the remarks call for several changes, pick the ONE that most likely explains what was tasted (a sour, under-extracted cup asks for a finer grind, a hotter water or a longer contact; a bitter, over-extracted one for the opposite), apply it, and say in the rationale which change you are holding back for the iteration after this one. NEVER change the beans (name, country, producer, roast date), the kind of water, or the gear (machine, grinder): those are what the cook observed, not dials you may turn — your job is to set an extraction, not to tell them what to buy. Return them unchanged. Never change the brewing method either: a V60 recipe stays a V60. NEVER fill in a parameter the current version leaves empty, not even the one you are about to move: a temperature nobody wrote down is a temperature nobody measured, and writing one would rewrite the cook’s experiment rather than continue it — leave it null, the app shows the empty field and the cook fills it in. Return the COMPLETE parameters of the next version (not only what changes), with the new value in its own field. Also return tips: the COMPLETE tips list of the next version — keep the current tips, and when a remark carries advice that changes nothing in the extraction (how to serve it, which beans suit it, how to store them), fold it in as a short reworded tip.'

// The parameters, block by block, as the prompt shows them — the state the single
// moved variable starts from. A field the cook never filled in is left out rather
// than shown empty: nothing to iterate on there.
export const formatParameters = (parameters: ImportCoffeeParameters): string => {
  const blocks = [
    ['Beans', parameters.beans],
    ['Water', parameters.water],
    ['Extraction', parameters.extraction],
    ['Milk', parameters.milk],
    ['Gear', parameters.gear],
  ] as const
  return (
    blocks
      .flatMap(([label, block]) => {
        const entries = Object.entries(block ?? {}).filter(([, value]) => value)
        return entries.length
          ? [`- ${label}: ${entries.map(([key, value]) => `${key} ${value}`).join(', ')}`]
          : []
      })
      .join('\n') || '—'
  )
}

const prompt = (context: CoffeeProposalContext): string => {
  const tips = context.currentTips.map((t) => `- ${t}`).join('\n') || '—'

  return `You are the assistant of a coffee brewing notebook. Analyse what is asked below and propose the NEXT version of this coffee.

MANDATORY: write every generated value — change summary, rationale, parameter values — in French. The reader is a French speaker; never answer in English.

${ITERATION_RULE}

Brewing method (fixed, never change it): ${context.method}

Current parameters:
${formatParameters(context.currentParameters)}

Current tips:
${tips}

${formatRequest(context)}

Propose an iteration: one dial moved. Fill changeSummary (the variable and its move), rationale (why), parameters (the COMPLETE set) and tips (the COMPLETE list of the next version).

Reminder: all text values you produce must be written in French.`
}

export const propose = async (context: CoffeeProposalContext): Promise<CoffeeProposal> => {
  const text = await callGemini(promptBody(prompt(context), responseSchema))
  if (!text) throw new Error('Gemini did not return a structured proposal')
  return parseCoffeeProposalResponse(text)
}
