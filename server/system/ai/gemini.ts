import type { ImportSource } from '~/system/ai/types'
import { config } from '~/system/config/index'

const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'

// Under the function's own 60 s budget, with room left to answer.
const GEMINI_TIMEOUT_MS = 45_000

type GeminiResponse = { candidates?: { content: { parts: { text?: string }[] } }[] }

export type GeminiPart = { text: string } | { inline_data: { mime_type: string; data: string } }

export const callGemini = async (body: Record<string, unknown>): Promise<string | undefined> => {
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
  return response.candidates?.[0]?.content?.parts?.find(({ text }) => text)?.text
}

// The request body of an import: the instructions of the flow that asked for it,
// then the source itself. A URL needs web access to be read, so it is the one
// source that turns the search tool on.
export const importBody = (
  instructions: string,
  source: ImportSource,
  responseSchema: Record<string, unknown>,
): Record<string, unknown> => {
  const body: Record<string, unknown> = {
    contents: [{ parts: importParts(instructions, source) }],
    generationConfig: { responseMimeType: 'application/json', responseSchema },
  }
  if (source.kind === 'url') body.tools = [{ google_search: {} }]
  return body
}

const importParts = (instructions: string, source: ImportSource): GeminiPart[] => {
  if (source.kind === 'photos') {
    // The photos are the source; the text the cook typed alongside them completes
    // or corrects what they show, so it is stated as such rather than as a second
    // recipe to merge.
    const withNote = source.text
      ? `${instructions}\n\nThe photos below are the source. The cook also typed this, which completes or corrects what they show — where the two disagree, what the cook typed wins:\n${source.text}`
      : instructions
    return [
      { text: withNote },
      ...source.photos.map(
        (data): GeminiPart => ({ inline_data: { mime_type: 'image/jpeg', data } }),
      ),
    ]
  }
  if (source.kind === 'url') return [{ text: `${instructions}\n\nSource to read: ${source.url}` }]
  return [{ text: `${instructions}\n\nSource text:\n${source.text}` }]
}

// The request body of a prompt that has no source to read — a proposal, a tips
// rewording: one text part, one response schema.
export const promptBody = (
  prompt: string,
  responseSchema: Record<string, unknown>,
): Record<string, unknown> => ({
  contents: [{ parts: [{ text: prompt }] }],
  generationConfig: { responseMimeType: 'application/json', responseSchema },
})
