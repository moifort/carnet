import type { OvenProgram } from '~/domain/recipe/types'

// What the oven's dials are set to right now — whatever it is doing, and whoever
// turned them, including the cook standing in front of it. This is what "copy the
// oven's settings" copies. The numbers stay unbranded on purpose: they are the
// APPLIANCE's readings, not the cook's settings, and a stray value must not fail
// the recipe sheet that only meant to display them.
export type OvenSettings = {
  program?: OvenProgram
  temperature?: number
  duration?: number
  core?: number
}

// A cooking under way. Only how long is left: WHAT is cooking is the dials, and
// duplicating them here would be two answers to one question.
export type OvenRun = { remaining?: number }

// What the recipe sheet needs to know before offering a button. Deliberately not
// the system's `ApplianceState`: the shape of the Electrolux API stops at its
// client.
export type OvenState = {
  reachable: boolean
  remoteControlEnabled: boolean
  // Always present, even on an idle oven: a cook selects a programme long before
  // pressing start, and that selection is exactly what is worth copying.
  settings: OvenSettings
  // Absent when the oven is idle.
  running?: OvenRun
}

// Why the oven would not cook. Every one of them is an outcome of asking, not a bug
// in asking — hence sentinels, never exceptions.
export type StartRefusal =
  | 'oven-unavailable'
  | 'no-oven-profile'
  | 'oven-offline'
  | 'remote-control-disabled'
  | 'oven-busy'
  // The heating function the version asks for is not on this oven's menu — the
  // notebook's vocabulary is wider than any one model, on purpose.
  | 'program-unsupported'
