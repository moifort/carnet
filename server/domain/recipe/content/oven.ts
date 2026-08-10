import type {
  OvenCoreTemperature,
  OvenDuration,
  OvenProgram,
  OvenTemperature,
} from '~/domain/recipe/types'

// The oven settings one version bakes at: plain values owned by the version, never
// a reference to anything the oven might rename or drop — the API exposes no dish
// catalogue to reference anyway, only heating functions and dials. Versioned rather
// than aggregate-level, like the coffee gear: dropping the temperature by ten
// degrees is an iteration, and the lineage is where that shows.
export type OvenProfile = {
  program: OvenProgram
  temperature: OvenTemperature
  // Absent when the probe is what ends the cooking.
  duration?: OvenDuration
  // The target at the heart of the food. Absent on a plain timed cook — its absence
  // IS "no probe in this dish", never a zero.
  core?: OvenCoreTemperature
}

// The profile as it arrives from a GraphQL input or an AI proposal: those
// boundaries speak `null`, the domain does not.
export type LooseOvenProfile = {
  program: OvenProgram
  temperature: OvenTemperature
  duration?: OvenDuration | null
  core?: OvenCoreTemperature | null
}

// Normalize a loose profile: the two optional dials disappear when unset, they are
// never stored as null. The role `toCoffeeParameters` plays for a coffee.
export const toOvenProfile = (loose: LooseOvenProfile): OvenProfile => ({
  program: loose.program,
  temperature: loose.temperature,
  ...(loose.duration != null ? { duration: loose.duration } : {}),
  ...(loose.core != null ? { core: loose.core } : {}),
})
