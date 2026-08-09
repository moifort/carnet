# GraphQL Patterns

Shuhari is GraphQL-first: a single endpoint `POST /graphql` (Apollo Server 5 + Pothos 4,
code-first). There is **no REST CRUD** — the only other HTTP route is `POST /admin/migrate`.
This guide covers how the schema is built and the conventions to follow.

> The portable rules — validate at the boundary, thin resolvers, exhaustive sentinel mapping, read
> budgets, `@oneOf` mirrors, functional descriptions — are in
> [graphql-best-practices.md](./graphql-best-practices.md). This doc is where they land in shuhari.
> For a task-level checklist, prefer the repo's `graphql-pothos` skill.

## Layout — per-domain slices + shared plumbing

There is **no central `server/graphql/`**. Each domain owns its slice:

```
server/domain/{domain}/infrastructure/graphql/
├── enums.ts      # builder.enumType(...)
├── types.ts      # builder.objectRef<T>('Name').implement(...)
├── inputs.ts     # builder.inputType(...)
├── queries.ts    # builder.queryField(...)
└── mutations.ts  # builder.mutationField(...)
```

The shared plumbing lives in `server/domain/shared/graphql/`:

- **builder.ts** — the single `SchemaBuilder`, the `GraphQLContext`, and the branded `Scalars` map.
- **scalars.ts** — registers each branded scalar.
- **schema.ts** — assembles everything by side-effect imports; exports `schema`.
- **loaders.ts** — per-request satellite loaders.

The server is booted once in `server/plugins/02-graphql.ts`
(`new ApolloServer({ schema, introspection: true })`, stored via `setApollo`), and each request
gets a fresh context in `server/routes/graphql.ts`.

## The Builder and Context

```ts
export type GraphQLContext = {
  event: H3Event
  userId: UserId
  loaders: RecipeSatelliteLoaders
}

export const builder = new SchemaBuilder<{
  Context: GraphQLContext
  DefaultFieldNullability: false
  Scalars: {
    DateTime: { Input: Date; Output: Date }
    RecipeId: { Input: RecipeId; Output: RecipeId }
    Rating: { Input: Rating; Output: Rating }
    // …one entry per branded scalar
  }
}>({ defaultFieldNullability: false })

builder.addScalarType('DateTime', DateTimeScalar)
builder.queryType({})
builder.mutationType({})
```

`defaultFieldNullability: false` means fields are **non-null by default** — mark optional fields
`nullable: true` explicitly.

`userId` comes from the authenticated Firebase context (`middleware/auth.ts`); every resolver
scopes its data access to it.

## Branded Scalars — validation at the boundary

Each branded type is a GraphQL scalar. Its `parseValue` runs the domain's Zod constructor
through `validatedParse`, which converts a `ZodError` into a `BAD_USER_INPUT` `GraphQLError` —
the boundary validation of
[graphql-best-practices.md](./graphql-best-practices.md#validate-at-the-boundary-once-through-scalars),
in Zod.

```ts
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

builder.scalarType('RecipeId', {
  description: 'Recipe unique identifier (UUID v4)',
  serialize: (value) => value as string,
  parseValue: validatedParse('RecipeId', RecipeId),
})
```

Adding a new scalar: declare it in the `Scalars` map (builder.ts) and register it (scalars.ts).

**A bounded number is a scalar too, never a bare `Int`.** `Rating` (1..5) and the three oven dials
(`OvenTemperature` 30..300, `OvenDuration` 1..720, `OvenCoreTemperature` 30..100) all carry their
range in the type, checked once at the boundary: a client sending `900` gets `BAD_USER_INPUT` from
the scalar, not a resolver assertion further in. The exception is a value the *appliance* reports
rather than the cook writing it — `OvenRun` exposes plain `Int`s, because a stray reading must not
fail the query that only meant to display it.

## Object Types back domain models

Pothos objects reference domain types as backing models via `objectRef<T>` — no type
duplication. `t.expose(...)` maps a field directly; `t.field({ resolve })` computes one.

```ts
export const IngredientType = builder.objectRef<Ingredient>('Ingredient').implement({
  fields: (t) => ({
    name: t.expose('name', { type: 'IngredientName' }),
    quantity: t.expose('quantity', { type: 'IngredientQuantity' }),
  }),
})
```

### Derived / satellite fields: declare then implement

When a type is referenced before its full field set is known, or carries fields derived from a
separate collection, declare the `objectRef` first and `.implement()` it separately (Pothos
forward-reference pattern). `Recipe` holds no derived state of its own — its best rating and the
version to open are computed from its versions, resolved through the batched `versionsByRecipe`
loader (see below), so a page of recipes never triggers N+1 reads:

```ts
export const RecipeType = builder.objectRef<Recipe>('Recipe')

RecipeType.implement({
  fields: (t) => ({
    id: t.expose('id', { type: 'RecipeId' }),
    versions: t.field({
      type: [VersionType],
      resolve: (r) => RecipeQuery.versionsOf(r.id),
    }),
    // Derived satellite: the version the fiche opens on, computed from the whole
    // lineage via the batched loader (shares the scan with bestRating — no extra reads).
    versionToOpen: t.field({
      type: VersionType,
      resolve: async (r, _a, { loaders }) => versionToOpen((await loaders.versionsByRecipe.load(r.id)) ?? []),
    }),
    bestRating: t.field({
      type: 'Rating',
      nullable: true,
      resolve: async (r, _a, { loaders }) => bestRating((await loaders.versionsByRecipe.load(r.id)) ?? [])?.rating ?? null,
    }),
  }),
})
```

A satellite field owned by *another* domain can be **grafted** onto `RecipeType` from that
domain's slice with `builder.objectField(RecipeType, 'field', …)`, resolving through the same
per-request loaders — the forward declaration is what makes that cross-domain graft possible.

## Satellite Loaders — the N+1 budget

The read-budget rule is
[here](./graphql-best-practices.md#derived-fields-have-a-read-budget--batch-them). Shuhari's
satellite fields (`versions`, `versionToOpen`, `bestRating`) resolve through per-request loaders
(`server/domain/shared/graphql/loaders.ts`), built once per request in `recipeSatelliteLoaders()`.

`batchedBy` is the DataLoader-style batcher: it memoizes per key, collects every `load(...)` call
in the resolution tick, flushes on `process.nextTick`, and performs **one keyed read** per batch.
The single `versionsByRecipe` loader groups the lineages of exactly the recipes in the batch:

```ts
versionsByRecipe: batchedBy(
  (recipeId) => recipeId,
  async (recipeIds) => {
    const versions = await RecipeQuery.versionsOfMany(recipeIds)
    const grouped = new Map<string, RecipeVersion[]>(recipeIds.map((id) => [id, []]))
    for (const version of versions) grouped.get(version.recipeId)?.push(version)
    for (const lineage of grouped.values()) lineage.sort((a, b) => a.number - b.number)
    return grouped
  },
),
```

So a page of recipes selecting `versionToOpen` costs **one** read; an unselected satellite costs
**nothing**. `versionToOpen`, `bestRating`, the counts **and `versions` itself** all derive from the
full lineage, so they reuse the same `versionsByRecipe` batch — still one read. That last one is the
rule earning its keep: `versions` used to resolve through a per-recipe query, which was one read per
parent on a page and, on a single recipe sheet, a second query duplicating the read `versionToOpen`
already paid for.

**The batch is keyed on the page, never on the notebook.** `versionsOfMany` filters
`recipeId in <the batch>` (Firestore caps `in` at 30 values, so a wider page fans out into
parallel queries), which is what keeps the cost proportional to the page. It used to reuse the
memoized `allVersions` scan instead: one query, but every version document the cook owns, re-read
on every page of an infinite scroll — a budget that grew with the library rather than with the
screen. `findAllVersionsByUser` survives for the whole-notebook read it is actually named after
(the export), and a targeted `findVersionsOf` for the **commands** that rewrite a lineage, never
for a read. These budgets are asserted in `.int.test.ts` and `.feat.test.ts` via
`fake.queryReads` / `fake.docReads` — keep them green.

## Queries and Mutations delegate to the domain

Resolvers are thin: validate/scope, call `Query`/`Command`/`UseCase`, map the result.

```ts
builder.queryField('recipes', (t) =>
  t.field({
    type: [RecipeType],
    args: { type: t.arg({ type: RecipeTypeEnum }) },
    resolve: async (_root, { type }, { userId }) => {
      const recipes = await RecipeQuery.all(userId)
      return type ? recipes.filter((recipe) => recipe.type === type) : recipes
    },
  }),
)
```

### Two flows, two mutations — never one with a discriminator

When a single entry point has to answer two shapes, it answers with a type half-empty either way.
The import is the case in point: `analyzeCoffeeImport → CoffeeImportAnalysis` (method +
parameters) and `analyzeCookingImport → CookingImportAnalysis` (type + category + ingredients +
steps) replaced one `analyzeImport → ImportAnalysis` whose coffee fields were null on a dish and
whose ingredients were empty on a coffee.

The two share their arguments (`photos` / `url` / `text`), their source assembly (`pickSource`,
called **before** the analysis so a malformed request answers `BAD_USER_INPUT` rather than a
failed-Gemini `IMPORT_FAILED`) and their refusal mapping — one `analyzed` helper, so the pair
cannot drift. What they do not share is the prompt or the result: that is the point.

## Mapping Sentinels to GraphQLError

The exhaustive-mapping rule is
[here](./graphql-best-practices.md#map-sentinels-to-errors-exhaustively); shuhari implements it with
`match().exhaustive()` from `ts-pattern` and the `never`-returning `domainError` helper from
`server/domain/shared/graphql/errors.ts`. The success arm matches "not a string"
(`P.not(P.string)`):

```ts
import { match, P } from 'ts-pattern'
import { domainError } from '~/domain/shared/graphql/errors'

builder.mutationField('recordAttempt', (t) =>
  t.field({
    type: VersionType,
    args: {
      recipeId: t.arg({ type: 'RecipeId', required: true }),
      versionNumber: t.arg({ type: 'VersionNumber', required: true }),
      rating: t.arg({ type: 'Rating', required: true }),
      remarks: t.arg({ type: 'Remarks', required: true }),
    },
    resolve: async (_root, { recipeId, versionNumber, rating, remarks }, { userId }) => {
      const result = await RecipeCommand.recordAttempt(userId, { recipeId, versionNumber, rating, remarks })
      return match(result)
        .with('not-found', domainError)
        .with(P.not(P.string), (recorded) => recorded)
        .exhaustive()
    },
  }),
)
```

A delete returns a `Boolean` and matches `undefined` (the command's success value):

```ts
return match(result)
  .with('not-found', domainError)
  .with(undefined, () => true)
  .exhaustive()
```

> **Note.** The narrowing guards *inside* use-cases (`if (recipe === 'not-found') return
> 'not-found'`, then continue with the narrowed value) stay as `if` — they unwrap a query result
> mid-flow rather than mapping a final outcome. See [error-handling.md](./error-handling.md).

## Discriminated unions and `@oneOf` inputs

A field whose shape depends on a discriminant is a Pothos `unionType`, with `resolveType` reading the
backing model's tag. A version's body (`VersionContent`) is a union over the recipe type, tagged by
`kind`:

```ts
export const VersionContentUnion = builder.unionType('VersionContent', {
  types: [DishContentType, ThermomixContentType],
  resolveType: (content: VersionContent) =>
    content.kind === 'dish' ? 'DishContent' : 'ThermomixContent',
})
```

The members are ordinary object types. Nested value objects — like a Thermomix step, which pairs an
instruction with its (total) machine settings — get their own object ref:

```ts
export const ThermomixStepType = builder.objectRef<ThermomixStep>('ThermomixStep').implement({
  fields: (t) => ({
    text: t.expose('text', { type: 'StepText' }),
    settings: t.field({ type: ThermomixSettingsType, resolve: (s) => s.settings }), // {} = a plain step
  }),
})
```

On the **input** side, the mirror of a union is a `@oneOf` input — exactly one arm must be set.
Pothos writes it with `isOneOf: true` and each arm not `required`:

```ts
export const VersionContentInput = builder.inputType('VersionContentInput', {
  isOneOf: true,
  fields: (t) => ({
    dish: t.field({ type: DishContentInput, required: false }),
    thermomix: t.field({ type: ThermomixContentInput, required: false }),
  }),
})
```

A small brancher turns the `@oneOf` arms into the domain's discriminated `VersionContent` (the
server also enforces `content.kind === recipe.type` in the command, rejecting a mismatch with the
`content-type-mismatch` sentinel):

```ts
export const versionContentInput = (input: { dish?: …; thermomix?: … }): VersionContent => {
  if (input.dish) return brandVersionContent({ kind: 'dish', ...input.dish })
  if (input.thermomix) return brandVersionContent({ kind: 'thermomix', ...input.thermomix })
  return domainError('invalid-content')
}
```

Adding a recipe type adds one arm to each of the three (union `types`/`resolveType`, `@oneOf` field,
brancher) — see the [domain guide](./domain-guide.md#adding-a-recipe-type).

## Inputs

`builder.inputType(...)`, backed by branded scalars. Optional fields are simply not `required`;
Pothos hands them back as `null | undefined`, so drop absent keys when mapping to the command.

```ts
export const ThermomixSettingsInput = builder.inputType('ThermomixSettingsInput', {
  fields: (t) => ({
    time: t.field({ type: 'ThermomixTime' }),
    temperature: t.field({ type: 'ThermomixTemperature' }),
    speed: t.field({ type: 'ThermomixSpeed' }),
  }),
})
```

## Document everything — functionally, for a non-technical reader

The rule and its checklist are
[here](./graphql-best-practices.md#document-every-field-functionally-for-a-non-technical-reader).
In shuhari, "business language" means the cook's: name the Shu-Ha-Ri concepts (recipe, version =
attempt, iteration, best rating) rather than the storage mechanics, and take examples from the
culinary domain — `e.g. "Grandma’s lasagna"`, `e.g. "250 g"`, `e.g. "Baked at 180°C instead of
200°C"`, `1 (bad) to 5 (excellent)`. Keep the vocabulary stable across the schema: an *attempt* is a
cook, a *version* is one entry in the chain, an *iteration* is an accepted AI proposal.

```typescript
rating: t.field({
  type: 'Rating',
  nullable: true,
  description:
    'Your rating of this attempt, from `1` (bad) to `5` (excellent). `null` until you have ' +
    'cooked it. The recipe’s best rating across its versions drives what it displays (see ' +
    'bestRating).',
  resolve: (v) => v.rating ?? null,
}),
```

Descriptions still obey the repo language rule: **English only** (the schema is versioned/technical;
only user-facing app copy is French). Wrap long strings with `'…' + '…'` concatenation to stay under
Biome's 100-column limit.

## Regenerating the SDL and iOS types

The SDL is the contract shared with the iOS app (`shared/schema.graphql`).

```bash
bun run generate:graphql            # regenerate shared/schema.graphql
bun run generate:ios                # regenerate Generated/GraphQL from the SDL
```

Order of changes: **domain first** (types/primitives) → GraphQL slice → regenerate SDL → iOS
codegen. See [ios-guide.md](./ios-guide.md) for the client side.
