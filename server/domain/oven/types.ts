import type { OvenProgram } from '~/domain/recipe/types'

// A cooking under way, as the oven reports it. The numbers stay unbranded on
// purpose: they are the APPLIANCE's readings, not the cook's settings, and a stray
// value must not fail the recipe sheet that only meant to display it.
export type OvenRun = { program?: OvenProgram; temperature?: number; remaining?: number }

// One entry of the oven's assisted-cooking catalogue, offered as a prefill. Picking
// it copies these values into a version; nothing keeps a reference to it.
export type AssistedProfile = {
  label: string
  program: OvenProgram
  temperature: number
  duration?: number
}

// What the recipe sheet needs to know before offering a button. Deliberately not
// the system's `ApplianceState`: the shape of the Electrolux API stops at its
// client.
export type OvenState = {
  reachable: boolean
  remoteControlEnabled: boolean
  // Absent when the oven is idle.
  running?: OvenRun
  assisted: AssistedProfile[]
}

// Why the oven would not cook. Every one of them is an outcome of asking, not a bug
// in asking — hence sentinels, never exceptions.
export type StartRefusal =
  | 'oven-unavailable'
  | 'no-oven-profile'
  | 'oven-offline'
  | 'remote-control-disabled'
  | 'oven-busy'
