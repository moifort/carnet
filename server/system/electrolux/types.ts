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

// The assisted-cooking catalogue is NOT exposed by the Electrolux Group API. The
// appliance's own capabilities list heating functions and dials, never the dishes
// its screen offers, so nothing here can prefill a profile from "Quiche". Left as
// a note rather than a stub: the absence is a fact about the API, not a gap to
// fill later without checking again.

// Why the appliance would not cook. Outcomes of asking, not bugs in asking — hence
// sentinels rather than exceptions.
export type ApplianceRefusal =
  | 'oven-offline'
  | 'remote-control-disabled'
  | 'oven-busy'
  // The heating function the version asks for is not on this model's menu.
  | 'program-unsupported'
