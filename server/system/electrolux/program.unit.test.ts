import { describe, expect, test } from 'bun:test'
import { electroluxProgram, ovenProgram } from '~/system/electrolux/program'

describe('program mapping', () => {
  test('maps the functions this oven has, with the codes it answered with', () => {
    expect(electroluxProgram('convection')).toBe('TRUE_FAN')
    expect(electroluxProgram('conventional')).toBe('BAKE')
    expect(electroluxProgram('grill')).toBe('BROIL')
    expect(electroluxProgram('steam-combi')).toBe('STEAMIFY')
  })

  test('a code round-trips back to its heating function', () => {
    expect(ovenProgram('TRUE_FAN')).toBe('convection')
  })

  test('a function this oven does not have maps to nothing — refused by name, later', () => {
    expect(electroluxProgram('pizza')).toBeUndefined()
    expect(electroluxProgram('defrost')).toBeUndefined()
  })

  test('a code this notebook has no word for is not an error', () => {
    // A cleaning cycle the cook started on the oven itself.
    expect(ovenProgram('STEAM_CLEAN_INTENSE')).toBeUndefined()
  })
})
