import { describe, expect, test } from 'bun:test'
import { toOvenProfile } from '~/domain/recipe/content/oven'
import {
  OvenCoreTemperature,
  OvenDuration,
  OvenProgram,
  OvenTemperature,
} from '~/domain/recipe/primitives'
import type {
  OvenCoreTemperature as OvenCoreTemperatureType,
  OvenDuration as OvenDurationType,
  OvenTemperature as OvenTemperatureType,
} from '~/domain/recipe/types'

describe('toOvenProfile', () => {
  test('keeps the two dials the cook filled in', () => {
    const profile = toOvenProfile({
      program: OvenProgram('convection'),
      temperature: OvenTemperature(180),
      duration: OvenDuration(25),
      core: OvenCoreTemperature(63),
    })

    expect(profile).toEqual({
      program: 'convection',
      temperature: 180 as OvenTemperatureType,
      duration: 25 as OvenDurationType,
      core: 63 as OvenCoreTemperatureType,
    })
  })

  test('drops an absent timer and an absent probe rather than storing null', () => {
    const profile = toOvenProfile({
      program: OvenProgram('grill'),
      temperature: OvenTemperature(220),
      duration: null,
      core: undefined,
    })

    expect(profile).toEqual({ program: 'grill', temperature: 220 as OvenTemperatureType })
    expect('duration' in profile).toBe(false)
    expect('core' in profile).toBe(false)
  })
})
