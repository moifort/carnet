// The appliance, as the rest of the server asks for it. The implementation lives in
// `appliance.ts` and this file is only its door.
//
// The split is a testing seam, and it is load-bearing: a domain test fakes the oven
// with `mock.module('~/system/electrolux', …)`, and `mock.module` replaces a module
// for the WHOLE test process — so the file that tests the real adapter cannot import
// the same specifier, or it gets whichever fake happened to register first and fails
// on assertions about calls it never made. It imports `./appliance` instead, which
// nobody fakes. Callers keep importing `~/system/electrolux`.
export { applianceState, findOven, startCooking } from '~/system/electrolux/appliance'
