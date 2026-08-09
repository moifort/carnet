import { describe, expect, test } from 'bun:test'
import { OVEN_PROGRAM_VALUES } from '~/domain/recipe/types'
import { electroluxProgram, ovenProgram } from '~/system/electrolux/program'

describe('program mapping', () => {
  test('every heating function the notebook knows has an appliance code', () => {
    for (const program of OVEN_PROGRAM_VALUES) {
      expect(electroluxProgram(program)).toBeTruthy()
    }
  })

  test('a code round-trips back to its heating function', () => {
    expect(ovenProgram(electroluxProgram('convection'))).toBe('convection')
  })

  test('a code this oven invented is not a function we know — and that is not an error', () => {
    expect(ovenProgram('SOUS_VIDE_9000')).toBeUndefined()
  })
})
