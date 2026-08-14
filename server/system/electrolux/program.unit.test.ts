import { describe, expect, test } from 'bun:test'
import type { OvenProfile } from '~/domain/recipe/content/oven'
import { electroluxProgram, ovenProgram } from '~/system/electrolux/program'

const profile = (program: string, assisted?: string) =>
  ({ program, ...(assisted ? { assisted } : {}), temperature: 180 }) as unknown as OvenProfile

describe('program mapping', () => {
  test('maps the functions this oven has, with the codes it answered with', () => {
    expect(electroluxProgram(profile('convection'))).toBe('TRUE_FAN')
    // The top AND bottom elements together, which is what conventional heat is.
    // `BAKE` alone is a different code this oven also accepts, and starting a
    // conventional version on it would cook on another heat than the one written
    // down.
    expect(electroluxProgram(profile('conventional'))).toBe('BAKE_BROIL')
    expect(electroluxProgram(profile('grill'))).toBe('BROIL')
  })

  test('a function this oven does not have maps to nothing — refused by name, later', () => {
    expect(electroluxProgram(profile('pizza'))).toBeUndefined()
    expect(electroluxProgram(profile('defrost'))).toBeUndefined()
  })

  test('a code round-trips back to its heating function', () => {
    expect(ovenProgram('TRUE_FAN')).toEqual({ program: 'convection' })
    // The reading a real bread bake answered with. Unmapped, it made the oven's
    // settings uncopyable while the very same response still counted the minutes
    // down — the settings arrived, the mode alone was missing.
    expect(ovenProgram('BAKE_BROIL')).toEqual({ program: 'conventional' })
  })

  test('a code the appliance declares but nobody has identified yet reads as nothing', () => {
    // Declared in this oven's capabilities, left unmapped on purpose: pairing them
    // by guesswork is how a version ends up cooked on another heat than its own.
    expect(ovenProgram('BAKE')).toBeUndefined()
    expect(ovenProgram('BAKE_TRUE_FAN')).toBeUndefined()
  })

  test('a code this notebook has no word for is not an error', () => {
    // A cleaning cycle the cook started on the oven itself.
    expect(ovenProgram('STEAM_CLEAN_INTENSE')).toBeUndefined()
  })
})

describe("the oven's own assisted programmes", () => {
  test('an ASSIST_ code reads as `assisted`, keeping the code beside it', () => {
    expect(ovenProgram('ASSIST_QUICHEANDTARTETHIN')).toEqual({
      program: 'assisted',
      assisted: 'ASSIST_QUICHEANDTARTETHIN',
    })
  })

  test('starting one sends the oven its own code back', () => {
    // Nothing else reproduces it: an assisted cooking varies heat and humidity over
    // time, so "convection at 170" would cook something else without saying so.
    expect(electroluxProgram(profile('assisted', 'ASSIST_QUICHEANDTARTETHIN'))).toBe(
      'ASSIST_QUICHEANDTARTETHIN',
    )
  })

  test('`assisted` with no code is not startable — the pair is the whole point', () => {
    expect(electroluxProgram(profile('assisted'))).toBeUndefined()
  })
})
