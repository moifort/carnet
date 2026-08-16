import SchemaBuilder from '@pothos/core'
import { GraphQLScalarType } from 'graphql'
import type { H3Event } from 'h3'
import type {
  AssistedProgram,
  CoffeeBeanName,
  CoffeeCountry,
  CoffeeDose,
  CoffeeGrind,
  CoffeeGrinder,
  CoffeeMachine,
  CoffeeMilkAmount,
  CoffeeMilkKind,
  CoffeeProducer,
  CoffeeRoast,
  CoffeeTemperature,
  CoffeeTime,
  CoffeeWater,
  CoffeeWaterKind,
  CoffeeYield,
  ComponentScale,
  IngredientName,
  IngredientQuantity,
  OvenCoreTemperature,
  OvenDuration,
  OvenTemperature,
  Rating,
  RecipeId,
  RecipeTitle,
  Remarks,
  StepText,
  ThermomixSpeed,
  ThermomixTemperature,
  ThermomixTime,
  Tip,
  VersionNumber,
  Warning,
} from '~/domain/recipe/types'
import type { UserId } from '~/domain/shared/types'
import type { RecipeSatelliteLoaders } from './loaders'

export type GraphQLContext = {
  event: H3Event
  userId: UserId
  loaders: RecipeSatelliteLoaders
}

const DateTimeScalar = new GraphQLScalarType({
  name: 'DateTime',
  description:
    'A date and time, given in the standard ISO 8601 format, e.g. `"2026-07-18T14:30:00.000Z"` ' +
    '(the `"Z"` means UTC — the app shows it in your local time)',
  serialize: (value: unknown) => (value instanceof Date ? value.toISOString() : value),
  parseValue: (value: unknown) => new Date(value as string),
})

export const builder = new SchemaBuilder<{
  Context: GraphQLContext
  DefaultFieldNullability: false
  Scalars: {
    DateTime: { Input: Date; Output: Date }
    UserId: { Input: UserId; Output: UserId }
    RecipeId: { Input: RecipeId; Output: RecipeId }
    RecipeTitle: { Input: RecipeTitle; Output: RecipeTitle }
    VersionNumber: { Input: VersionNumber; Output: VersionNumber }
    Rating: { Input: Rating; Output: Rating }
    ComponentScale: { Input: ComponentScale; Output: ComponentScale }
    AssistedProgram: { Input: AssistedProgram; Output: AssistedProgram }
    OvenTemperature: { Input: OvenTemperature; Output: OvenTemperature }
    OvenDuration: { Input: OvenDuration; Output: OvenDuration }
    OvenCoreTemperature: { Input: OvenCoreTemperature; Output: OvenCoreTemperature }
    IngredientName: { Input: IngredientName; Output: IngredientName }
    IngredientQuantity: { Input: IngredientQuantity; Output: IngredientQuantity }
    StepText: { Input: StepText; Output: StepText }
    Tip: { Input: Tip; Output: Tip }
    Warning: { Input: Warning; Output: Warning }
    ThermomixTime: { Input: ThermomixTime; Output: ThermomixTime }
    ThermomixTemperature: { Input: ThermomixTemperature; Output: ThermomixTemperature }
    ThermomixSpeed: { Input: ThermomixSpeed; Output: ThermomixSpeed }
    CoffeeGrind: { Input: CoffeeGrind; Output: CoffeeGrind }
    CoffeeWater: { Input: CoffeeWater; Output: CoffeeWater }
    CoffeeTemperature: { Input: CoffeeTemperature; Output: CoffeeTemperature }
    CoffeeTime: { Input: CoffeeTime; Output: CoffeeTime }
    CoffeeYield: { Input: CoffeeYield; Output: CoffeeYield }
    CoffeeBeanName: { Input: CoffeeBeanName; Output: CoffeeBeanName }
    CoffeeCountry: { Input: CoffeeCountry; Output: CoffeeCountry }
    CoffeeProducer: { Input: CoffeeProducer; Output: CoffeeProducer }
    CoffeeRoast: { Input: CoffeeRoast; Output: CoffeeRoast }
    CoffeeDose: { Input: CoffeeDose; Output: CoffeeDose }
    CoffeeWaterKind: { Input: CoffeeWaterKind; Output: CoffeeWaterKind }
    CoffeeMilkKind: { Input: CoffeeMilkKind; Output: CoffeeMilkKind }
    CoffeeMilkAmount: { Input: CoffeeMilkAmount; Output: CoffeeMilkAmount }
    CoffeeMachine: { Input: CoffeeMachine; Output: CoffeeMachine }
    CoffeeGrinder: { Input: CoffeeGrinder; Output: CoffeeGrinder }
    Remarks: { Input: Remarks; Output: Remarks }
  }
}>({
  defaultFieldNullability: false,
})

builder.addScalarType('DateTime', DateTimeScalar)
builder.queryType({})
builder.mutationType({})
