import { callGemini, promptBody } from '~/system/ai/gemini'
import { parseTipsResponse } from '~/system/ai/primitives'
import { formatParameters } from '~/system/ai/proposal/coffee'
import { formatThermomix } from '~/system/ai/proposal/cooking'
import { tipsSchemaProperty } from '~/system/ai/schema'
import type { TipsContext } from '~/system/ai/types'

const responseSchema = {
  type: 'object',
  properties: { tips: tipsSchemaProperty },
  required: ['tips'],
  propertyOrdering: ['tips'],
}

// What the version is, for grounding the rewording only: a coffee shows its dials,
// anything cooked its ingredients and its steps.
const current = (context: TipsContext): string => {
  if (context.currentParameters)
    return `Current parameters:\n${formatParameters(context.currentParameters)}`
  const ingredients =
    context.currentIngredients.map((i) => `- ${i.name} : ${i.quantity}`).join('\n') || '—'
  const steps =
    context.currentSteps
      .map((s, i) => `${i + 1}. ${s.text}${formatThermomix(s.thermomix)}`)
      .join('\n') || '—'
  return `Current ingredients:\n${ingredients}\n\nCurrent steps:\n${steps}`
}

const prompt = (context: TipsContext): string => {
  const tips = context.currentTips.map((t) => `- ${t}`).join('\n') || '—'

  return `You are the assistant of a culinary experimentation notebook. The cook wants to add tips to this recipe — serving suggestions, storage advice, technique pointers. Merge them into the recipe's tips list.

MANDATORY: write every tip in French. The reader is a French speaker; never answer in English.

Rules:
- Return the COMPLETE tips list: every current tip kept, plus the requested advice folded in.
- Reword each requested tip into one short, clear sentence (≤300 characters). A tip is neither an ingredient nor a step: never restate the method.
- Deduplicate: when a requested tip says the same thing as a current one, keep a single merged tip.
- The recipe below is context for the rewording only — change nothing else about it.

${current(context)}

Current tips:
${tips}

Tips requested by the cook, in their own words:
${context.requested}

Reminder: all tips you produce must be written in French.`
}

// Merge the cook's raw advice into the version's tips list. No version is at
// stake: the answer is the complete reworded list the current version's tips are
// replaced with (once accepted — nothing is persisted here).
export const format = async (context: TipsContext): Promise<string[]> => {
  const text = await callGemini(promptBody(prompt(context), responseSchema))
  if (!text) throw new Error('Gemini did not return structured tips')
  return parseTipsResponse(text)
}
