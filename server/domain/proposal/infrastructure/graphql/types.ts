import {
  BrewMethodEnum,
  DishCategoryEnum,
  RecipeTypeEnum,
} from '~/domain/recipe/infrastructure/graphql/enums'
import { VersionContentUnion } from '~/domain/recipe/infrastructure/graphql/types'
import type { Tip } from '~/domain/recipe/types'
import { builder } from '~/domain/shared/graphql/builder'
import type {
  CoffeeImportAnalysis,
  CookingImportAnalysis,
  ImportCoffeeParameters,
  ImportStep,
  ImportThermomixSettings,
} from '~/system/ai/types'
import type { Proposal } from '../../types'

export const ProposalType = builder.objectRef<Proposal>('Proposal').implement({
  description:
    'The AI’s suggestion for your next attempt, e.g. `"Less sugar, longer resting time"`. After ' +
    'an attempt, the AI reads your rating and remarks and proposes a tweaked version. It is ' +
    'just a proposal shown on screen — nothing is saved until you accept it (see ' +
    'acceptProposal).',
  fields: (t) => ({
    basedOn: t.expose('basedOn', {
      type: 'VersionNumber',
      description:
        'The version this proposal iterates on (the one you just cooked), e.g. `2`. Sent straight ' +
        'back on accept so the new version records what it was based on.',
    }),
    changeSummary: t.exposeString('changeSummary', {
      description:
        'A one-line summary of what it changes, e.g. `"Less sugar, longer resting time"`',
    }),
    rationale: t.exposeString('rationale', {
      description:
        'The AI’s reasoning — why it thinks this change will help, based on your last remarks, ' +
        'e.g. `"You noted it was too sweet, so cutting the sugar should balance it"`',
    }),
    content: t.field({
      type: VersionContentUnion,
      description:
        'The complete body of the suggested version (not just what changed) — a `DishContent`, ' +
        'a `ThermomixContent` or a `CoffeeContent` depending on the recipe type',
      resolve: (d) => d.content,
    }),
    tips: t.field({
      type: ['Tip'],
      description:
        'The complete tips list of the suggested version — the current tips carried over, any ' +
        'advice found in your remarks folded in, e.g. `["Serve over rice"]`',
      resolve: (d) => d.tips,
    }),
  }),
})

// The tips-only proposal: the complete merged list the current version's tips
// would be replaced with. Ephemeral like ProposalType — accepting it goes through
// the updateTips mutation, which touches no other part of the version.
export const TipsProposalType = builder.objectRef<{ tips: Tip[] }>('TipsProposal').implement({
  description:
    'The AI’s reworded, merged tips list for one version — what you asked to add, folded into ' +
    'the tips it already had. Just a proposal shown on screen: nothing is saved until you send ' +
    'it back through updateTips.',
  fields: (t) => ({
    tips: t.field({
      type: ['Tip'],
      description:
        'The complete new tips list, e.g. `["Serve over rice", "Freezes well"]` — every current ' +
        'tip kept, the requested advice reworded and deduplicated',
      resolve: (p) => p.tips,
    }),
  }),
})

// Raw ingredient from the import analysis — plain strings, shown in the editable
// preview before the user confirms (values are validated into branded types on create).
type ImportIngredient = { name: string; quantity: string }

const ImportIngredientType = builder.objectRef<ImportIngredient>('ImportIngredient').implement({
  description: 'A recipe ingredient extracted by the AI (unvalidated preview)',
  fields: (t) => ({
    name: t.exposeString('name'),
    quantity: t.exposeString('quantity'),
  }),
})

const ImportThermomixSettingsType = builder
  .objectRef<ImportThermomixSettings>('ImportThermomixSettings')
  .implement({
    description: 'Thermomix settings for one step extracted by the AI (unvalidated preview)',
    fields: (t) => ({
      time: t.exposeString('time', { nullable: true }),
      temperature: t.exposeString('temperature', { nullable: true }),
      speed: t.exposeString('speed', { nullable: true }),
      reverse: t.exposeBoolean('reverse', { nullable: true }),
    }),
  })

// The parameter blocks of an extracted coffee. Flat string fields, all nullable:
// this is the editable preview, where "the source did not say" is the normal case
// and the cook fills the rest in before confirming.
const ImportCoffeeBeansType = builder
  .objectRef<NonNullable<ImportCoffeeParameters['beans']>>('ImportCoffeeBeans')
  .implement({
    description: 'The coffee itself as extracted by the AI (unvalidated preview)',
    fields: (t) => ({
      name: t.exposeString('name', { nullable: true }),
      country: t.exposeString('country', { nullable: true }),
      producer: t.exposeString('producer', { nullable: true }),
      roastedOn: t.exposeString('roastedOn', {
        nullable: true,
        description: 'The roast date as the source states it, ISO 8601 — `null` when not stated',
      }),
      dose: t.exposeString('dose', { nullable: true }),
    }),
  })

const ImportCoffeeWaterType = builder
  .objectRef<NonNullable<ImportCoffeeParameters['water']>>('ImportCoffeeWater')
  .implement({
    description: 'The water as extracted by the AI (unvalidated preview)',
    fields: (t) => ({
      kind: t.exposeString('kind', { nullable: true }),
      amount: t.exposeString('amount', { nullable: true }),
      temperature: t.exposeString('temperature', { nullable: true }),
    }),
  })

const ImportCoffeeExtractionType = builder
  .objectRef<NonNullable<ImportCoffeeParameters['extraction']>>('ImportCoffeeExtraction')
  .implement({
    description: 'The extraction dials as extracted by the AI (unvalidated preview)',
    fields: (t) => ({
      grind: t.exposeString('grind', { nullable: true }),
      time: t.exposeString('time', { nullable: true }),
      yield: t.exposeString('yield', { nullable: true }),
    }),
  })

const ImportCoffeeMilkType = builder
  .objectRef<NonNullable<ImportCoffeeParameters['milk']>>('ImportCoffeeMilk')
  .implement({
    description: 'The milk as extracted by the AI (unvalidated preview)',
    fields: (t) => ({
      kind: t.exposeString('kind', { nullable: true }),
      amount: t.exposeString('amount', { nullable: true }),
      temperature: t.exposeString('temperature', { nullable: true }),
    }),
  })

const ImportCoffeeGearType = builder
  .objectRef<NonNullable<ImportCoffeeParameters['gear']>>('ImportCoffeeGear')
  .implement({
    description: 'The gear as extracted by the AI (unvalidated preview)',
    fields: (t) => ({
      machine: t.exposeString('machine', { nullable: true }),
      grinder: t.exposeString('grinder', { nullable: true }),
    }),
  })

const ImportCoffeeParametersType = builder
  .objectRef<ImportCoffeeParameters>('ImportCoffeeParameters')
  .implement({
    description:
      'The coffee parameters extracted by the AI (unvalidated preview) — `null` on anything ' +
      'that is not a coffee. `milk` is `null` on a drink that has none.',
    fields: (t) => ({
      beans: t.field({ type: ImportCoffeeBeansType, resolve: (p) => p.beans }),
      water: t.field({ type: ImportCoffeeWaterType, resolve: (p) => p.water }),
      extraction: t.field({ type: ImportCoffeeExtractionType, resolve: (p) => p.extraction }),
      milk: t.field({
        type: ImportCoffeeMilkType,
        nullable: true,
        resolve: (p) => p.milk ?? null,
      }),
      gear: t.field({ type: ImportCoffeeGearType, resolve: (p) => p.gear }),
    }),
  })

const ImportStepType = builder.objectRef<ImportStep>('ImportStep').implement({
  description:
    'A recipe step extracted by the AI (unvalidated preview): its text plus the Thermomix ' +
    'settings that go with it (every field `null` = a step that sets nothing).',
  fields: (t) => ({
    text: t.exposeString('text'),
    thermomix: t.field({
      type: ImportThermomixSettingsType,
      description: 'The step’s Thermomix settings (every field `null` = a step that sets nothing)',
      resolve: (s) => s.thermomix,
    }),
  }),
})

export const CoffeeImportAnalysisType = builder
  .objectRef<CoffeeImportAnalysis>('CoffeeImportAnalysis')
  .implement({
    description:
      'A coffee extracted from an import source (editable preview): how it is brewed and the ' +
      'dials it is set by. No ingredient list and no steps — a coffee has neither.',
    fields: (t) => ({
      method: t.expose('method', {
        type: BrewMethodEnum,
        description: 'How the AI read that it is brewed — `OTHER` when nothing else fits',
      }),
      title: t.exposeString('title'),
      sourceLabel: t.exposeString('sourceLabel', { nullable: true }),
      parameters: t.field({
        type: ImportCoffeeParametersType,
        description:
          'The dials read off the source. A field is `null` whenever the source says nothing ' +
          'of it — except a value entirely determined by one that WAS read (the water from the ' +
          'dose, at the method’s ratio). The app shows every field anyway, filled or not.',
        resolve: (a) => a.parameters,
      }),
      tips: t.exposeStringList('tips', {
        description:
          'The advice found in the source (unvalidated preview) — empty list when it carries none',
      }),
    }),
  })

export const CookingImportAnalysisType = builder
  .objectRef<CookingImportAnalysis>('CookingImportAnalysis')
  .implement({
    description:
      'A cooked dish or a Thermomix recipe extracted from an import source (editable preview).',
    fields: (t) => ({
      type: t.expose('type', {
        type: RecipeTypeEnum,
        description: 'What the AI read it to be — `DISH` or `THERMOMIX`, never `COFFEE`',
      }),
      category: t.expose('category', {
        type: DishCategoryEnum,
        description: 'The dish category detected by the AI',
      }),
      title: t.exposeString('title'),
      sourceLabel: t.exposeString('sourceLabel', { nullable: true }),
      ingredients: t.field({
        type: [ImportIngredientType],
        description: 'The extracted ingredients',
        resolve: (a) => a.ingredients,
      }),
      steps: t.field({
        type: [ImportStepType],
        description: 'The extracted steps, each carrying its own Thermomix settings',
        resolve: (a) => a.steps,
      }),
      tips: t.exposeStringList('tips', {
        description:
          'The cooking tips found in the source (unvalidated preview) — empty list when it ' +
          'carries none',
      }),
    }),
  })
