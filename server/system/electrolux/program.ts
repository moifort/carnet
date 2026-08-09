import { OVEN_PROGRAM_VALUES, type OvenProgram } from '~/domain/recipe/types'

// The ONLY place that knows how this oven spells its heating functions. The values
// come from `GET /appliances/{id}/capabilities` on the real appliance — a different
// model is a different table here, and nothing else anywhere: that is the whole
// reason the domain speaks `OvenProgram` and not a manufacturer's string.
//
// UNVERIFIED against a real oven: these codes are the documented Electrolux/AEG
// spellings, not a capability read. Confirm them on the appliance before trusting a
// cook to them.
const PROGRAM_CODES: Record<OvenProgram, string> = {
  conventional: 'CONVENTIONAL_HEATING',
  convection: 'TRUE_FAN_COOKING',
  'convection-humid': 'MOIST_FAN_BAKING',
  'top-heat': 'TOP_HEATING',
  'bottom-heat': 'BOTTOM_HEATING',
  grill: 'GRILL',
  'turbo-grill': 'TURBO_GRILLING',
  pizza: 'PIZZA_SETTING',
  steam: 'FULL_STEAM',
  'steam-combi': 'STEAM_BAKE',
  defrost: 'DEFROST',
}

export const electroluxProgram = (program: OvenProgram): string => PROGRAM_CODES[program]

// The reverse read, for a cooking already under way. An unknown code is not an
// error: the cook may have started something on the oven itself that this notebook
// has no word for, and the recipe sheet still has to render.
export const ovenProgram = (code: string): OvenProgram | undefined =>
  OVEN_PROGRAM_VALUES.find((program) => PROGRAM_CODES[program] === code)
