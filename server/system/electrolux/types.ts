import type { OvenProgram } from '~/domain/recipe/types'

// The connected oven, once found among the account's appliances.
export type OvenAppliance = { id: string }

// What the appliance reports about itself. Deliberately NOT the domain's
// `OvenState`: the shape of Electrolux's API stops at this module, and the numbers
// here are raw readings — unbranded, possibly nonsense, never trusted enough to be
// branded into recipe values.
export type ApplianceState = {
  reachable: boolean
  remoteControlEnabled: boolean
  busy: boolean
  program?: OvenProgram
  temperature?: number
  // Minutes, converted from the seconds the appliance counts in.
  remaining?: number
}

// One entry of the oven's assisted-cooking catalogue, offered as a prefill and
// nothing more: picking it copies these values into a version.
export type AssistedEntry = {
  label: string
  program: OvenProgram
  temperature: number
  duration?: number
}

// Why the appliance would not cook. Outcomes of asking, not bugs in asking — hence
// sentinels rather than exceptions.
export type ApplianceRefusal = 'oven-offline' | 'remote-control-disabled' | 'oven-busy'
