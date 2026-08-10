import type { OvenProfile } from '~/domain/recipe/content/oven'
import { OVEN_PROGRAM_VALUES, type OvenProgram } from '~/domain/recipe/types'

// The ONLY place that knows how this oven spells its heating functions. Read off
// the real appliance (AEG KOBAS3XH, `applianceType: SO`) through
// `GET /appliances/{id}/info`, which is where capabilities live — there is no
// `/capabilities` endpoint, whatever the shape of the URL suggests.
//
// PARTIAL on purpose. The notebook's vocabulary is wider than any one oven's menu:
// this model has no top-only, bottom-only, pizza or defrost function. An unmapped
// program is not a word to delete — it is a cook this appliance must refuse BY
// NAME (`program-unsupported`), so the cook is told what their oven cannot do
// instead of being silently given a different heat.
const PROGRAM_CODES: Partial<Record<OvenProgram, string>> = {
  conventional: 'BAKE',
  convection: 'TRUE_FAN',
  'convection-humid': 'MOIST_FAN_BAKING',
  grill: 'BROIL',
  'turbo-grill': 'BROIL_FAN',
  'air-fry': 'GUIDED_AIRFRYPLUS',
  steam: 'FULL_STEAM',
  'steam-combi': 'STEAMIFY',
  // `assisted` is deliberately absent: it has no fixed code, it carries the oven's
  // own on the profile.
}

// The oven's own programmes announce themselves. They are absent from the
// capabilities enum — that lists the heating functions — yet they are programme
// values all the same, and the only way to reproduce one.
const ASSISTED_PREFIX = 'ASSIST_'

// What to send for a whole profile: the oven's own code when it carries one, the
// mapped heating function otherwise. Takes the profile rather than the programme
// because an assisted cooking IS its code — reading only `program` would lose it.
export const electroluxProgram = (profile: OvenProfile): string | undefined =>
  profile.program === 'assisted' ? profile.assisted : PROGRAM_CODES[profile.program]

// The reverse read, for a cooking already under way or merely selected. An oven's
// own programme reads as `assisted`, its code kept beside it; a code this notebook
// has no word for at all — a cleaning cycle — reads as nothing, and the recipe
// sheet still renders.
export const ovenProgram = (
  code: string,
): { program: OvenProgram; assisted?: string } | undefined => {
  if (code.startsWith(ASSISTED_PREFIX)) return { program: 'assisted', assisted: code }
  const program = OVEN_PROGRAM_VALUES.find((known) => PROGRAM_CODES[known] === code)
  return program ? { program } : undefined
}
