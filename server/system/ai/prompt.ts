// The prompt fragments both proposal flows share. What motivates the next version
// is the same question whether it is cooked or brewed — only the answer differs.

// What asks for the next version: the cooks that were run, or — when the cook asked
// for one outright — the improvement they described.
export const formatRequest = (context: {
  attempts: { rating: number; remarks: string }[]
  improvement?: string
}): string =>
  context.improvement
    ? `Improvement requested by the cook:\n${context.improvement}`
    : `Attempts made:\n${
        context.attempts
          .map(({ rating, remarks }) => `- Note ${rating}/5. Remarks: ${remarks || '—'}.`)
          .join('\n') || '—'
      }`
