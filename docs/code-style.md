# Code Style Guide

Portable rules — nothing here names this project. Many implement DDD principles from Evans
(*Domain-Driven Design*) and Wlaschin (*Domain Modeling Made Functional*). Examples use a fictional
`bean` domain.

Rules marked ⛔ are meant to be **enforced by an architecture test** that walks the source tree, so a
violation fails the build; the rest are conventions the codebase follows by preference. The concrete
tools this repo picks (formatter settings, utility libraries, runtime) are recorded in
[CLAUDE.md](../CLAUDE.md#backend-patterns-typescript--nitro).

## Formatting is a decision made once

A formatter with its settings committed to the repo, run in CI, and never argued about in review.
Nobody hand-formats; nobody debates a line break. Same for the runtime and package manager: one
choice, used everywhere.

## TypeScript rules

### Never type return values

Let TypeScript infer — the annotation duplicates what the body already proves, and drifts from it.
That includes command outcomes: the discriminated union follows from the `as const` sentinels and
the returned entity.

```ts
// Bad
export const all = async (userId: UserId): Promise<Bean[]> => repository.findAllByUser(userId)
// Good
export const all = async (userId: UserId) => repository.findAllByUser(userId)
```

### `as const` on literal sentinel returns

Required for the union to narrow. Sentinels are **bare strings**, not objects:

```ts
if (!bean) return 'not-found' as const
```

### Full variable names

> **Evans:** Ubiquitous Language — code reads like the domain. `bean` says what it is; `b` says nothing.

```ts
// Bad
beans.filter((b) => b.roast === 'dark')
// Good
beans.filter((bean) => bean.roast === 'dark')
```

### Destructure in callbacks

Every callback whose parameter is only ever read for its properties destructures them — predicates,
mappings and GraphQL resolvers alike.

```ts
// Bad
sortBy(beans, (b) => b.name)
beans.find((bean) => bean.roast === 'dark')
resolve: (bean) => bean.roastedOn ?? null
// Good
sortBy(beans, ({ name }) => name)
beans.find(({ roast }) => roast === 'dark')
resolve: ({ roastedOn }) => roastedOn ?? null
```

Three exceptions, and nothing else:

- **A method call** — `snap.data()`, `file.endsWith('.ts')`. Destructuring a method detaches it from
  its receiver, so the parameter stays whole.
- **The object itself is used** — `versions.map((version) => [version.number, version])` needs both.
- **A reserved word** is renamed rather than left undestructured: `({ yield: extracted }) =>
  extracted`.

A property read off a primitive (`tip.length`) is not the case this rule is about: keep the
parameter, whose name says what the value is.

### Inline single-line guards

```ts
// Bad
if (!bean) {
  return 'not-found' as const
}
// Good
if (!bean) return 'not-found' as const
```

### Use a date type, not a string, for timestamps

```ts
type Bean = { createdAt: Date; updatedAt: Date }
```

The storage converter is responsible for restoring the database's timestamp type to a real `Date` on
read — a string date in the domain is a bug that surfaces months later, at a sort.

### Arrays are never optional

> **Wlaschin:** make illegal states unrepresentable — `[]` is a valid array. An optional array
> creates two representations of "empty" (`undefined` vs `[]`), an illegal state.

```ts
// Bad
type Bean = { tastingNotes?: Note[] }
// Good
type Bean = { tastingNotes: Note[] }   // [] is the neutral state
```

**Items are never optional either** — an array is *total*: neither the list nor any of its slots can
be absent. A parallel array aligned by index must not spell "nothing here" as a hole; give the
element type a neutral value instead.

```ts
// Bad — two spellings of "no setting", and a hole most databases can't store
settings: (Settings | undefined)[]
// Good — every field of Settings is optional, so `{}` IS "nothing set"
settings: Settings[]
```

At the API boundary this means **`[T!]!` everywhere**, in output types *and* inputs/args — never
`[T]`, `[T]!` or `[T!]`. A client sends `[]` for "none", never `null`, and a neutral element for "this
slot carries nothing". The same rule applies on the client (Swift: `[Settings]`, never `[Settings?]`
nor `[Settings]?`).

When absence seems meaningful, derive it from a real field instead of the array's presence — a
variant is `type === 'x'`, not "the `x` array is present" (see the next rule but one).

### ⛔ No `null` in the domain — absence is `?` / `undefined`

> **Wlaschin:** one representation per state. `null` and `undefined` are two spellings of "absent";
> keeping both makes every guard a coin flip (`=== null`? `== null`? `??`?).

The domain never spells absence `null`: an absent field is `field?: T` (and the key is simply **not
written**), a lookup that finds nothing returns `T | undefined` — or the discriminated
`'not-found' as const` sentinel where the flow already uses one.

```ts
// Bad
type Bean = { openedAt: Date | null; score: Score | null }
export const best = (beans: Bean[]): Bean | null => …
// Good
type Bean = { openedAt?: Date; score?: Score }
export const best = (beans: Bean[]): Bean | undefined => …
```

`null` survives only at the **boundaries**, where a protocol imposes it, and is converted on the
spot: the API layer maps `undefined` → `null` on the way out and strips `null` keys on the way in;
the storage layer drops absent fields on write and turns stored nulls back into `undefined` on read;
a model returning loose JSON is normalised at parse time.

Two storage consequences worth knowing: a write must be a **full replace** for a dropped key to
*erase* the stored field (an omitted key in a merge leaves the old value untouched), and an array
element cannot be absent — a positional hole is stored as `null` and decoded back to `undefined`.

### No boolean derivable from another field

Never store a boolean whose truth is already implied by another field (`pending !== undefined`
implies "has something pending"; `type === 'x'` implies "is an x"). Derive it in a pure function or a
resolver.

### ⛔ Never cast raw input to a brand — go through the constructor

```ts
// Bad
const id = body.id as BeanId
// Good
const id = BeanId(body.id)
```

(Casting an already-validated value to its own union type, as enum constructors do, is fine.)

### ⛔ No `throw` in domain `query.ts` / `command.ts`

Expected absence is a returned sentinel, not an exception. `throw` is reserved for impossible
states, and lives outside these two files. See [error-handling.md](./error-handling.md).

### ⛔ Names carry the business concept, not the technical pattern

Exported names in `query.ts` / `command.ts` / `business-rules.ts` may not start with
`get`/`compute`/`handle`/`process`/`manage`/`perform`/`fetch` + a capital. Reads read as `all`,
`byId`, `versionsOf`; writes as the action (`add`, `remove`, `recordAttempt`); rules as the concept
(`bestScore`, `nextNumber`). `findAll` / `findBy` stay — that is the repository idiom.

### ⛔ `business-rules.ts` is pure — no `async`, no storage

Pure, synchronous functions only.

### ⛔ No cross-domain repository imports

A domain may import only its own `infrastructure/repository`. Reach other domains through their
public `Query` / `Command` namespaces.

### Never `switch` — use exhaustive pattern matching

> **Wlaschin:** totality — exhaustiveness forces every case; a new sentinel becomes a compile error,
> not a silent fall-through.

Map a command's sentinels with a pattern-matching library, terminating on an exhaustiveness check —
never a catch-all. The error helper's `never` return type sits in one arm while the success arm
keeps the resolver's inferred type:

```ts
match(result)
  .with('not-found', domainError)
  .with(P.not(P.string), (bean) => bean)
  .exhaustive()
```

### Prefer a tree-shakeable utility library over hand-rolled helpers

`chunk`, `sortBy`, `groupBy` and friends are solved problems; a private `utils/array.ts` reinvents
them with fewer tests.

### Never `for` / `while` loops — use functional style

> **Wlaschin:** functional composition — `map`/`filter`/`reduce` express intent declaratively.

```ts
// Bad
for (const change of changes) { … }
// Good
changes.reduce((params, change) => …, params)
```

The pragmatic exceptions are inherently sequential infrastructure loops: writing under a database's
batch-operation cap, or a batched loader's dispatch.

### Error handling at the caller level

Don't wrap each unit in try/catch; let the orchestrator handle failure once (a migration runner
wrapping each migration). See [error-handling.md](./error-handling.md).

### ⛔ No `console` in server code

Error reporting goes through the reporter, not stdout. A single deliberate `console.info` site (a
migration runner narrating its work) is tolerated; `console.log` / `error` / `warn` are not.

## Language

**One language for everything versioned and technical: English.** Code, identifiers, folder and file
names, comments, commit messages, documentation, API descriptions, model prompts, test names, and —
on mobile — accessibility *identifiers*. A reader should never need to know the product's UI
language to read the model.

```ts
// Bad
export const noterEssai = async (userId: UserId, input: EssaiInput) => …
// Good
export const recordAttempt = async (userId: UserId, input: RecordAttemptInput) => …
```

### Enum values, unions and discriminants are English technical symbols

> **Evans:** Ubiquitous Language — but the language of the *domain model*, not of the *reader*. A
> schema value is an identity, not a label; the moment it doubles as a label it can never be
> translated, renamed or reused.

Enum members, their backing values (`dish`, `starter`, `ai-proposal`) and every discriminant
(`origin.kind`, `'not-found'`) are English symbols. The front-end owns the wording: the symbol
travels over the wire and the client maps it to a translated label. The schema never speaks the
user's language.

```ts
// Bad — the label leaks into the schema; the day the app speaks another language, the data is wrong
export const TYPE_VALUES = ['plat', 'boisson'] as const
// Good — a symbol the app translates
export const TYPE_VALUES = ['dish', 'drink'] as const
```

### The UI language is display copy only

On the client, identifiers, file names, comments and accessibility **identifiers**
(`"home-settings-button"`) stay English. The product's language is reserved for the copy the user
actually reads: labels, titles, accessibility *labels*, and preview names (a preview gallery of the
translated UI is legitimately named in that UI's language).

```swift
// Bad
button.accessibilityIdentifier = "bouton-reglages"
// Good — English identifier, translated label
Button("Historique") { … }.accessibilityIdentifier("recipe-history-button")
```

### Declare the exceptions, and control them

Every project has a short list of files and values that are legitimately in the product's language:
the user-facing changelog, data values quoted as examples in prompts or fixtures, a fallback string
the server produces. **List them explicitly** and keep a cheap control — a grep for the language's
accented range over the server tree — that must return nothing but that list. It is a smoke test,
not a proof: unaccented words slip through, so read the names too.

This repo's list is in [CLAUDE.md](../CLAUDE.md#language).

## Client-side rules

See [swiftui-best-practices.md](./swiftui-best-practices.md) for the portable UI rules and
[ios-guide.md](./ios-guide.md) for this app's conventions. The two style rules that cross the
boundary:

- Arrays are never optional (same rule as above), on the wire and in the client model.
- Write the UI language's accented copy as real UTF-8 characters, never as `"\u{00E9}"` escapes.
