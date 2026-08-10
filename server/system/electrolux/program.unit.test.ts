import { describe, expect, test } from 'bun:test'
import type { OvenProfile } from '~/domain/recipe/content/oven'
import { electroluxProgram, ovenProgram } from '~/system/electrolux/program'

const profile = (program: string, assisted?: string) =>
  ({ program, ...(assisted ? { assisted } : {}), temperature: 180 }) as unknown as OvenProfile

describe('program mapping', () => {
  test('maps the functions this oven has, with the codes it answered with', () => {
    expect(electroluxProgram(profile('convection'))).toBe('TRUE_FAN')
    expect(electroluxProgram(profile('conventional'))).toBe('BAKE')
    expect(electroluxProgram(profile('grill'))).toBe('BROIL')
  })

  test('a function this oven does not have maps to nothing — refused by name, later', () => {
    expect(electroluxProgram(profile('pizza'))).toBeUndefined()
    expect(electroluxProgram(profile('defrost'))).toBeUndefined()
  })

  test('a code round-trips back to its heating function', () => {
    expect(ovenProgram('TRUE_FAN')).toEqual({ program: 'convection' })
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
