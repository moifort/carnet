import { GraphQLError } from 'graphql'
import { ZodError } from 'zod'
import {
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
} from '~/domain/recipe/primitives'
import { UserId } from '~/domain/shared/primitives'
import { builder } from './builder'

const validatedParse =
  <T>(name: string, parse: (value: unknown) => T) =>
  (value: unknown): T => {
    try {
      return parse(value)
    } catch (error) {
      const message =
        error instanceof ZodError
          ? error.issues.map(({ message }) => message).join(', ')
          : `Invalid ${name}`
      throw new GraphQLError(`Invalid value for ${name}: ${message}`, {
        extensions: { code: 'BAD_USER_INPUT' },
      })
    }
  }

builder.scalarType('UserId', {
  description:
    'Identifies one signed-in cook, e.g. `"user-7f3a"`. Every recipe belongs to exactly one of ' +
    'these.',
  serialize: (value) => value as string,
  parseValue: validatedParse('UserId', UserId),
})

builder.scalarType('RecipeId', {
  description:
    'The unique id of a recipe — a long random string like `"9f1c…-a3b2"` you pass around to ' +
    'fetch or change that one recipe (e.g. your `"Grandma’s lasagna"`)',
  serialize: (value) => value as string,
  parseValue: validatedParse('RecipeId', RecipeId),
})

builder.scalarType('RecipeTitle', {
  description: 'A recipe’s name, e.g. `"Grandma’s lasagna"` (1 to 200 characters)',
  serialize: (value) => value as string,
  parseValue: validatedParse('RecipeTitle', RecipeTitle),
})

builder.scalarType('VersionNumber', {
  description:
    'Which attempt in the chain — a whole number starting at `1` (`1` = the original, `2` = the ' +
    'first tweak…)',
  serialize: (value) => value as number,
  parseValue: validatedParse('VersionNumber', VersionNumber),
})

builder.scalarType('Rating', {
  description:
    'A rating out of 5, as a whole number from `1` (bad) to `5` (excellent), e.g. `4`. The best ' +
    'rating across a recipe’s attempts drives the version its recipe sheet opens on.',
  serialize: (value) => value as number,
  parseValue: validatedParse('Rating', Rating),
})

builder.scalarType('AssistedProgram', {
  description:
    'One of the oven’s own assisted-cooking programmes, as the appliance names it, e.g. ' +
    '`"ASSIST_QUICHEANDTARTETHIN"`. Opaque: copied off the oven and handed back to it, never ' +
    'parsed. Paired with `OvenProgram.ASSISTED`.',
  serialize: (value) => value as string,
  parseValue: validatedParse('AssistedProgram', AssistedProgram),
})

builder.scalarType('OvenTemperature', {
  description:
    'An oven temperature in °C, as a whole number from `30` to `300`, e.g. `180`. What the dial ' +
    'is set to — not what the food reaches inside, which is an `OvenCoreTemperature`.',
  serialize: (value) => value as number,
  parseValue: validatedParse('OvenTemperature', OvenTemperature),
})

builder.scalarType('OvenDuration', {
  description:
    'A cooking time in whole minutes, from `1` to `720` (12 h), e.g. `25`. Absent on a dish ' +
    'whose probe is what decides it is done.',
  serialize: (value) => value as number,
  parseValue: validatedParse('OvenDuration', OvenDuration),
})

builder.scalarType('OvenCoreTemperature', {
  description:
    'The target temperature at the heart of the food, read by the oven’s probe, in °C from `30` ' +
    'to `100`, e.g. `63` for a pink leg of lamb. Absent on a plain timed cook.',
  serialize: (value) => value as number,
  parseValue: validatedParse('OvenCoreTemperature', OvenCoreTemperature),
})

builder.scalarType('IngredientName', {
  description: 'The name of an ingredient, e.g. `"Flour"` or `"Fine salt"` (1 to 120 characters)',
  serialize: (value) => value as string,
  parseValue: validatedParse('IngredientName', IngredientName),
})

builder.scalarType('IngredientQuantity', {
  description:
    'How much of an ingredient, unit included, e.g. `"250 g"`, `"2 tbsp"`, `"1 pinch"` (1 to 60 ' +
    'characters)',
  serialize: (value) => value as string,
  parseValue: validatedParse('IngredientQuantity', IngredientQuantity),
})

builder.scalarType('StepText', {
  description:
    'One instruction in the method, e.g. `"Fold in the egg whites"` (1 to 300 characters)',
  serialize: (value) => value as string,
  parseValue: validatedParse('StepText', StepText),
})

builder.scalarType('Tip', {
  description:
    'One cooking tip — serving, storage or technique advice that is neither an ingredient nor ' +
    'a step, e.g. `"Serve over rice"` (1 to 300 characters)',
  serialize: (value) => value as string,
  parseValue: validatedParse('Tip', Tip),
})

builder.scalarType('Warning', {
  description:
    'One recipe-level caution the cook pinned so it is read before cooking starts, e.g. `"The ' +
    'whisk must go in from the very start"` (1 to 300 characters)',
  serialize: (value) => value as string,
  parseValue: validatedParse('Warning', Warning),
})

builder.scalarType('ThermomixTime', {
  description:
    'How long a Thermomix step runs, written as you would read it, e.g. `"3 min"` or `"30 s"`',
  serialize: (value) => value as string,
  parseValue: validatedParse('ThermomixTime', ThermomixTime),
})

builder.scalarType('ThermomixTemperature', {
  description:
    'The temperature of a Thermomix step, e.g. `"100°C"` or `"Varoma"` (its steam setting)',
  serialize: (value) => value as string,
  parseValue: validatedParse('ThermomixTemperature', ThermomixTemperature),
})

builder.scalarType('ThermomixSpeed', {
  description:
    'The blade speed of a Thermomix step, e.g. `"5"`, `"pétrin"` (kneading) or `"turbo"`',
  serialize: (value) => value as string,
  parseValue: validatedParse('ThermomixSpeed', ThermomixSpeed),
})

builder.scalarType('CoffeeGrind', {
  description:
    'How fine the coffee is ground for a step, written as you would read it off the grinder, ' +
    'e.g. `"fine"`, `"moyenne"` or `"Niveau 12"`',
  serialize: (value) => value as string,
  parseValue: validatedParse('CoffeeGrind', CoffeeGrind),
})

builder.scalarType('CoffeeWater', {
  description: 'The water poured at one brewing step, e.g. `"50 g"` (a bloom) or `"300 ml"`',
  serialize: (value) => value as string,
  parseValue: validatedParse('CoffeeWater', CoffeeWater),
})

builder.scalarType('CoffeeTemperature', {
  description: 'The water temperature of a brewing step, e.g. `"93°C"`',
  serialize: (value) => value as string,
  parseValue: validatedParse('CoffeeTemperature', CoffeeTemperature),
})

builder.scalarType('CoffeeTime', {
  description: 'How long a brewing step runs, e.g. `"28 s"` (an espresso shot) or `"4 min"`',
  serialize: (value) => value as string,
  parseValue: validatedParse('CoffeeTime', CoffeeTime),
})

builder.scalarType('CoffeeYield', {
  description:
    'What lands in the cup at the end of a brewing step, e.g. `"36 g"` for a double espresso',
  serialize: (value) => value as string,
  parseValue: validatedParse('CoffeeYield', CoffeeYield),
})

builder.scalarType('CoffeeBeanName', {
  description:
    'The coffee itself, as the bag names it — roaster and lot, e.g. `"Belleville — Guji"`',
  serialize: (value) => value as string,
  parseValue: validatedParse('CoffeeBeanName', CoffeeBeanName),
})

builder.scalarType('CoffeeCountry', {
  description: 'Where the coffee grew, e.g. `"Éthiopie"`',
  serialize: (value) => value as string,
  parseValue: validatedParse('CoffeeCountry', CoffeeCountry),
})

builder.scalarType('CoffeeProducer', {
  description: 'Who grew it — farm, washing station or co-op, e.g. `"Coop. Hambela"`',
  serialize: (value) => value as string,
  parseValue: validatedParse('CoffeeProducer', CoffeeProducer),
})

builder.scalarType('CoffeeRoast', {
  description:
    'How far the roaster took the beans, as the bag words it, e.g. `"Torréfaction claire"` or ' +
    '`"Medium roast"`',
  serialize: (value) => value as string,
  parseValue: validatedParse('CoffeeRoast', CoffeeRoast),
})

builder.scalarType('CoffeeDose', {
  description: 'The ground coffee that goes in, e.g. `"18 g"`',
  serialize: (value) => value as string,
  parseValue: validatedParse('CoffeeDose', CoffeeDose),
})

builder.scalarType('CoffeeWaterKind', {
  description:
    'What the water IS, written as you would say it, e.g. `"Robinet (dureté 3/5)"` or ' +
    '`"Volvic + minéralisation Lotus"`',
  serialize: (value) => value as string,
  parseValue: validatedParse('CoffeeWaterKind', CoffeeWaterKind),
})

builder.scalarType('CoffeeMilkKind', {
  description: 'What the milk is, e.g. `"Entier"` or `"Avoine Oatly"`',
  serialize: (value) => value as string,
  parseValue: validatedParse('CoffeeMilkKind', CoffeeMilkKind),
})

builder.scalarType('CoffeeMilkAmount', {
  description: 'How much milk goes in, e.g. `"150 ml"`',
  serialize: (value) => value as string,
  parseValue: validatedParse('CoffeeMilkAmount', CoffeeMilkAmount),
})

builder.scalarType('CoffeeMachine', {
  description:
    'What brews it, brand and model, e.g. `"Rancilio Silvia"`, `"Hario V60 02"` or ' +
    '`"Moccamaster KBG"`',
  serialize: (value) => value as string,
  parseValue: validatedParse('CoffeeMachine', CoffeeMachine),
})

builder.scalarType('CoffeeGrinder', {
  description: 'What grinds it, brand and model, e.g. `"Niche Zero"`',
  serialize: (value) => value as string,
  parseValue: validatedParse('CoffeeGrinder', CoffeeGrinder),
})

builder.scalarType('Remarks', {
  description:
    'Free notes you jot down about an attempt, e.g. `"Still too sweet, cut the sugar next time"` ' +
    '(up to 2000 characters)',
  serialize: (value) => value as string,
  parseValue: validatedParse('Remarks', Remarks),
})
