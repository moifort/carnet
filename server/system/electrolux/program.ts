import type { OvenProfile } from '~/domain/recipe/content/oven'
import { OVEN_PROGRAM_VALUES, type OvenProgram } from '~/domain/recipe/types'

// The ONLY place that knows how this oven spells its heating functions. Read off
// the real appliance (AEG KOBAS3XH, `applianceType: SO`) through
// `GET /appliances/{id}/info`, which is where capabilities live — there is no
// `/capabilities` endpoint, whatever the shape of the URL suggests.
//
// `conventional` is `BAKE_BROIL`: the top AND bottom elements together, which is
// what conventional heat is. It was `BAKE` until a real oven baking bread reported
// `BAKE_BROIL` and the app could neither read the cooking nor copy it. `BAKE` alone
// is a code this oven also accepts, but it is NOT the conventional heat — a version
// written for both elements would have been started on something else.
//
// PARTIAL on purpose, twice over. The notebook's vocabulary is wider than any one
// oven's menu, and this appliance's own list is wider than what has been identified
// on it: `BAKE`, `BAKE_BROIL_FAN`, `BAKE_TRUE_FAN`, `STEAM_HIGH` and `STEAM_LOW` are
// declared by the oven and deliberately left unmapped until each has been read off
// the appliance with the function selected — a guessed pairing is a cook given the
// wrong heat without being told. An unmapped program is not a word to delete: it is
// a cook this appliance must refuse BY NAME (`program-unsupported`), so the cook is
// told what their oven cannot do instead of being silently given a different heat.
const PROGRAM_CODES: Partial<Record<OvenProgram, string>> = {
  conventional: 'BAKE_BROIL',
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
