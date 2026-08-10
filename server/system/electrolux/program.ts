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
}

export const electroluxProgram = (program: OvenProgram): string | undefined =>
  PROGRAM_CODES[program]

// The reverse read, for a cooking already under way. An unknown code is not an
// error: the cook may have started a cleaning cycle, or one of the model's own
// combinations, that this notebook has no word for — and the recipe sheet still
// has to render.
export const ovenProgram = (code: string): OvenProgram | undefined =>
  OVEN_PROGRAM_VALUES.find((program) => PROGRAM_CODES[program] === code)
