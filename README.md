# rttg — Run-Time Type Guards

Build a validator out of ordinary function calls, and let TypeScript infer the type it guards:

```ts
import { object, number, string } from "@pinesw/rttg";

const commentSchema = object({ id: number(), body: string() });
// commentSchema: Schema<{ id: number; body: string }>
```

`commentSchema.validate(x)` is a type guard, so inside the `if` the compiler knows `x` has
`id: number` and `body: string`. Annotate the schema with the type you already have
(`const commentSchema: Schema<Comment> = object({ ... })`) and the compiler will *also* reject a
schema that has drifted away from `Comment` — wrong property type, missing property, or
superfluous property.

Two things make this cheap to adopt: **zero runtime dependencies**, and **no compile-time
transformer**. Unlike [typia](https://typia.io/), which derives validators from your types and
therefore needs its own compiler plugin wired into your build, rttg is a plain library — a schema
is a value you construct at runtime, and `tsc` is the only tool involved. The price is that you
write the schema by hand; the annotation is what stops it from rotting.

## Installation

```bash
npm install @pinesw/rttg
```

The package ships the TypeScript source (`index.ts`) alongside the compiled `index.js` and
`index.d.ts`, so it works whether your bundler consumes source or your runtime consumes the
emitted JavaScript.

**TypeScript with `strict` enabled is required for the compile-time guarantees.** Specifically,
the superfluous-property check relies on `strictFunctionTypes` (included in `strict`); with
`strictFunctionTypes: false` a schema carrying extra properties is accepted silently. The
library's runtime behaviour does not depend on your compiler settings.

## Quick start

```ts
import { Schema, boolean, number, object, string } from "@pinesw/rttg";

interface Comment {
    id: number;
    body: string;
    pinned: boolean;
}

const commentSchema: Schema<Comment> = object({
    id: number(),
    body: string(),
    pinned: boolean(),
});

function handle(payload: unknown) {
    if (commentSchema.validate(payload)) {
        // payload is Comment here
        console.log(payload.body.toUpperCase());
    }
}
```

Three facts about that snippet:

- `object({ ... })` is a normal function call evaluated at runtime. There is no code generation.
- `validate` is declared `value is T`, so TypeScript narrows `payload` for you.
- `Schema<Comment>` is not decoration. It is the cross-check described next.

## Keeping schemas in sync with your types

This is the core idiom of the library:

```ts
const commentSchema: Schema<Comment> = object({ /* ... */ });
```

Without the annotation you still get a working guard, but nothing ties it to `Comment`:

```ts
// Inference only. Compiles fine, even though it no longer describes Comment.
const commentSchema = object({ id: string(), body: string() });
// => Schema<{ id: string; body: string }>
```

The compiler has no opinion, because you never told it what the schema was *supposed* to be. Add
the annotation and all three ways a schema can drift become compile errors. Each error below is
real `tsc --noEmit --strict` output, with the long file path trimmed.

### Wrong property type

```ts
interface Comment {
    id: number;
    body: string;
    pinned: boolean;
}

const commentSchema: Schema<Comment> = object({
    id: string(),      // should be number()
    body: string(),
    pinned: string(),  // should be boolean()
});
```

```
comment-schema.ts(9,7): error TS2322: Type 'Schema<{ id: string; body: string; pinned: string; }>' is not assignable to type 'Schema<Comment>'.
  Types of property 'validate' are incompatible.
    Type '(value: unknown) => value is { id: string; body: string; pinned: string; }' is not assignable to type '(value: unknown) => value is Comment'.
      Type predicate 'value is { id: string; body: string; pinned: string; }' is not assignable to 'value is Comment'.
        Type '{ id: string; body: string; pinned: string; }' is not assignable to type 'Comment'.
          Types of property 'id' are incompatible.
            Type 'string' is not assignable to type 'number'.
```

### Missing property

```ts
const commentSchema: Schema<Comment> = object({
    id: number(),
    body: string(),
    // pinned is gone
});
```

```
comment-schema.ts(9,7): error TS2322: Type 'Schema<{ id: number; body: string; }>' is not assignable to type 'Schema<Comment>'.
  Types of property 'validate' are incompatible.
    Type '(value: unknown) => value is { id: number; body: string; }' is not assignable to type '(value: unknown) => value is Comment'.
      Type predicate 'value is { id: number; body: string; }' is not assignable to 'value is Comment'.
        Property 'pinned' is missing in type '{ id: number; body: string; }' but required in type 'Comment'.
```

### Superfluous property

```ts
const commentSchema: Schema<Comment> = object({
    id: number(),
    body: string(),
    pinned: boolean(),
    authorId: number(),  // not on Comment
});
```

```
comment-schema.ts(9,7): error TS2322: Type 'Schema<{ id: number; body: string; pinned: boolean; authorId: number; }>' is not assignable to type 'Schema<Comment>'.
  Types of property 'bivarianceHack' are incompatible.
    Type '((arg: { id: number; body: string; pinned: boolean; authorId: number; }) => void) | undefined' is not assignable to type '((arg: Comment) => void) | undefined'.
      Type '(arg: { id: number; body: string; pinned: boolean; authorId: number; }) => void' is not assignable to type '(arg: Comment) => void'.
        Types of parameters 'arg' and 'arg' are incompatible.
          Property 'authorId' is missing in type 'Comment' but required in type '{ id: number; body: string; pinned: boolean; authorId: number; }'.
```

### Why the third case needs `bivarianceHack`

Notice which property each error blames. The first two are caught by `validate`, whose
`value is T` return position makes `Schema<T>` **covariant** in `T`: a schema for a *narrower*
type is assignable, a schema missing a property is not. Covariance alone would happily accept a
schema for `{ id, body, pinned, authorId }` where `Schema<Comment>` is expected, because that
object type is a subtype of `Comment`.

So `Schema<T>` carries one extra, never-called property:

```ts
bivarianceHack?: (arg: T) => void;
```

As a *property* holding a function (not a method), `strictFunctionTypes` checks it
contravariantly, which makes `Schema<T>` **contravariant** in `T` as well. Covariant plus
contravariant means invariant: `T` has to match in both directions, and the extra `authorId` is
reported. You never read or write this property — it exists purely to pin the variance.

## The three ways to use a schema

| Call | Returns | On mismatch | Use when |
| --- | --- | --- | --- |
| `schema.validate(value)` | `boolean` (`value is T`) | returns `false` | you want to branch |
| `schema.assertType(value)` | `void` (`asserts value is T`) | throws `Error` | the value is already in a variable you want narrowed |
| `schema.as(value)` | `T` | throws `Error` | you want an expression of type `T` |

```ts
import { Schema, number, object, string } from "@pinesw/rttg";

interface User {
    id: number;
    name: string;
}

const userSchema: Schema<User> = object({ id: number(), name: string() });

declare const input: unknown;

// 1. branch
if (userSchema.validate(input)) {
    console.log(input.name);
}

// 2. assert, then keep using the same variable
userSchema.assertType(input);
console.log(input.name);

// 3. convert in an expression
const user = userSchema.as(input);
console.log(user.name);
```

`as` is a checked cast, not a parser: it returns **the very same object reference** it was given,
with no copying, stripping of extra keys, or coercion.

```ts
const raw = { id: 1, name: "ada" };
userSchema.as(raw) === raw; // true
```

### `assertType` has two syntactic requirements

`assertType` is an `asserts` function, and TypeScript puts two restrictions on how those may be
called. Both bite in practice, and neither is rttg's doing.

First, the schema variable **must carry an explicit type annotation** — which is exactly the
annotation this library wants you to write anyway, but an inferred schema will not do:

```ts
const inferred = object({ id: number() }); // no `: Schema<...>`
inferred.assertType(input);
```

```
assert-calls.ts(7,1): error TS2775: Assertions require every name in the call target to be declared with an explicit type annotation.
```

Second, the call target must be a plain name — you **cannot** call `.assertType` on the result of
an expression:

```ts
string().assertType(input);
```

```
assert-calls.ts(10,1): error TS2776: Assertions require the call target to be an identifier or qualified name.
```

Neither restriction applies to `validate` or `as`, so `string().validate(x)` and
`string().as(x)` are both fine.

### The standalone `assertType`

`assertType(value, schema)` takes the schema as an argument, which sidesteps the second
restriction above: the call target is the imported `assertType`, so the schema can be any
expression. The trade-off is a generic error message instead of the schema's own:

```ts
import { Schema, assertType, string } from "@pinesw/rttg";

declare const value: unknown;

const nameSchema: Schema<string> = string();

assertType(value, nameSchema); // throws: Type assertion failed
nameSchema.assertType(value);  // throws: Expected string
```

## API reference

Every export of the package. The error strings below are exactly what `assertType` and `as` throw.

### `Schema<T>`

The interface every schema implements.

```ts
interface Schema<T> {
    validate(value: unknown): value is T;
    assertType(value: unknown): asserts value is T;
    as(value: unknown): T;
    bivarianceHack?: (arg: T) => void;
}
```

Use it as an annotation (`const s: Schema<Comment> = ...`) and as a parameter type when you write
functions that take schemas. `bivarianceHack` is explained
[above](#why-the-third-case-needs-bivariancehack); ignore it otherwise.

All three methods are closures over the schema's own validation function rather than `this`, so
they can be destructured or passed as bare callbacks: `const { as } = string(); values.map(as)`
works.

### `of<T>(value: T): Schema<T>`

Matches one specific value, compared with `===`.

```ts
of(42).validate(42);   // true
of(42).validate("42"); // false
```

Error: `Expected <value>`, built from the value — so `of(1).as(2)` throws `Expected 1`. The
message is only built when a mismatch actually throws, so any value can be used as a target,
including symbols and objects that cannot be stringified:

```ts
const id = Symbol("id");
of(id).validate(id);  // true
of(id).as(1);         // throws: Expected Symbol(id)
```

### `instanceOf<T>(constructor: new (...args: any[]) => T): Schema<T>`

Matches values satisfying `value instanceof constructor`.

```ts
instanceOf(Date).validate(new Date()); // true
instanceOf(Date).validate("2020");     // false
```

Error: `Expected instance of <constructor.name>` — e.g. `Expected instance of Date`.

### `number(): Schema<number>`

`typeof value === "number"`.

```ts
number().validate(1);   // true
number().validate("1"); // false
```

Error: `Expected number`.

### `string(): Schema<string>`

`typeof value === "string"`.

```ts
string().validate("a"); // true
string().validate(1);   // false
```

Error: `Expected string`.

### `boolean(): Schema<boolean>`

`typeof value === "boolean"`.

```ts
boolean().validate(false); // true
boolean().validate(0);     // false
```

Error: `Expected boolean`.

### `object<T extends {}>(schema: { [K in keyof T]: Schema<T[K]> }): Schema<T>`

Matches a non-null object that has every listed key as an **own** property with a matching value.
String and symbol keys are both checked. Keys you did not list are ignored at runtime — see
[`object()` checks own properties only](#object-checks-own-properties-only).

```ts
const point = object({ x: number(), y: number() });
point.validate({ x: 1, y: 2 });       // true
point.validate({ x: 1, y: 2, z: 3 }); // true  — extra keys ignored
point.validate({ x: 1 });             // false
```

Error: `Object validation failed`.

### `array<T>(schema: Schema<T>): Schema<T[]>`

`Array.isArray(value)` and every element matches, holes included — see
[Holes in a sparse array](#holes-in-a-sparse-array-are-validated-as-undefined).

```ts
array(number()).validate([1, 2, 3]); // true
array(number()).validate([1, "2"]);  // false
array(string()).validate("ab");      // false — a string is not an array
```

Error: `Array validation failed`.

### `tuple<T extends unknown[]>(...schemas: { [K in keyof T]: Schema<T[K]> }): Schema<T>`

An array of exactly `schemas.length` elements, each matching the schema at its position.

```ts
const pair = tuple(string(), number());
pair.validate(["a", 1]);    // true
pair.validate(["a", 1, 2]); // false — wrong length
pair.validate(["a"]);       // false
```

Error: `Tuple validation failed`.

### `union<T extends unknown[]>(...schemas: { [K in keyof T]: Schema<T[K]> }): Schema<T[number]>`

Matches if **at least one** schema matches.

```ts
union(string(), number()).validate("a");  // true
union(string(), number()).validate(1);    // true
union(string(), number()).validate(true); // false
```

Error: `Union validation failed`.

### `intersection<T extends unknown[]>(...schemas: { [K in keyof T]: Schema<T[K]> }): Schema<A & B & ...>`

Matches if **every** schema matches. The resulting type is the intersection of the element types.

```ts
const identified = intersection(object({ id: number() }), object({ body: string() }));
// Schema<{ id: number; } & { body: string; }>
identified.validate({ id: 1, body: "x" }); // true
identified.validate({ id: 1 });            // false
```

Error: `Intersection validation failed`.

### `assertType<T>(value: unknown, schema: Schema<T>): asserts value is T`

Standalone assertion, for passing the schema as an argument. Unlike `schema.assertType(value)`,
this accepts a schema built inline, because the call target is the imported `assertType` — see
[the two syntactic requirements](#asserttype-has-two-syntactic-requirements).

```ts
assertType(input, userSchema);               // narrows `input` to User
assertType(input, object({ id: number() })); // inline schema: also fine
```

Error: `Type assertion failed` — always this message, whichever schema failed.

## Recipes

### Nullable fields

```ts
import { Schema, number, object, of, string, union } from "@pinesw/rttg";

interface Profile {
    id: number;
    nickname: string | null;
}

const profileSchema: Schema<Profile> = object({
    id: number(),
    nickname: union(string(), of(null)),
});
```

### Enums / literal unions

Use `as const` (or an explicit type argument) so the literal does not widen:

```ts
const statusSchema: Schema<"open" | "closed"> = union(
    of("open" as const),
    of("closed" as const),
);

statusSchema.validate("open");  // true
statusSchema.validate("other"); // false
```

Without `as const`, `of("open")` infers `Schema<string>` and the annotation rejects it:

```
status-schema.ts(3,7): error TS2322: Type 'Schema<string>' is not assignable to type 'Schema<"closed" | "open">'.
  Types of property 'validate' are incompatible.
    Type '(value: unknown) => value is string' is not assignable to type '(value: unknown) => value is "closed" | "open"'.
      Type predicate 'value is string' is not assignable to 'value is "closed" | "open"'.
        Type 'string' is not assignable to type '"closed" | "open"'.
```

`of<"open">("open")` works too. Inside an annotated `object({ ... })` the annotation supplies the
contextual type, so a bare `of("circle")` is fine there — as in the next recipe.

### Discriminated unions

```ts
import { Schema, number, object, of, union } from "@pinesw/rttg";

interface Circle { kind: "circle"; radius: number }
interface Square { kind: "square"; size: number }
type Shape = Circle | Square;

const circleSchema: Schema<Circle> = object({ kind: of("circle"), radius: number() });
const squareSchema: Schema<Square> = object({ kind: of("square"), size: number() });
const shapeSchema: Schema<Shape> = union(circleSchema, squareSchema);

function area(value: unknown): number {
    const shape = shapeSchema.as(value);
    return shape.kind === "circle"
        ? Math.PI * shape.radius ** 2
        : shape.size ** 2;
}
```

Narrowing on `shape.kind` works after `as`, because the schema's type really is `Circle | Square`.
At runtime, `{ kind: "circle", size: 2 }` is rejected: it matches neither member.

### Reusing and composing schemas

Schemas are plain values, so name them and pass them around:

```ts
interface Comment { id: number; body: string; pinned: boolean }
interface Post { id: number; comments: Comment[] }

const commentSchema: Schema<Comment> = object({
    id: number(),
    body: string(),
    pinned: boolean(),
});

const postSchema: Schema<Post> = object({
    id: number(),
    comments: array(commentSchema),
});
```

Annotating both means a change to `Comment` is reported at `commentSchema`, where it belongs,
rather than deep inside `postSchema`.

### Validating at the `JSON.parse` boundary

`JSON.parse` returns `any`, which silently poisons everything downstream. `as` turns that `any`
into a checked `T` in a single expression — a good default at every I/O boundary:

```ts
function parseComment(text: string): Comment {
    return commentSchema.as(JSON.parse(text));
}

parseComment('{"id":1,"body":"hi","pinned":true}');   // { id: 1, body: "hi", pinned: true }
parseComment('{"id":"1","body":"hi","pinned":true}'); // throws: Object validation failed
```

The same shape works for `await response.json()`, `localStorage.getItem` and message handlers.

## Behaviour worth knowing

The library is small and deliberately literal about what it checks. The consequences below are
design choices, but several of them are sharp enough to be worth knowing before you rely on them.

### Errors say what failed, not where

Every message is one of a handful of fixed strings. There is no path to the offending property,
no failing index, and no `cause` chain — a failure deep inside a nested schema reports only the
outermost schema's message:

```ts
const postSchema = object({ comments: array(object({ body: string() })) });

postSchema.as({ comments: [{ body: 1 }] }); // throws: Object validation failed
```

`union()` and `intersection()` swallow their members' messages the same way: a failing
`union(string(), number())` throws `Union validation failed`, never `Expected string`. That makes
these schemas well suited to a boundary check where the answer is yes or no, and poorly suited to
a user-facing validator that has to say *which* field was wrong. If you need that, validate the
parts separately and report per part, or pick a library that carries issue paths
([zod](https://zod.dev/), [typia](https://typia.io/)).

### Extra keys pass at runtime, by design

```ts
object({ x: number() }).validate({ x: 1, y: 2 }); // true
```

`object()` checks the keys you listed and ignores the rest, which is what you want for API
responses that grow new fields. Extra keys in the *schema* are caught at compile time by the
annotation — that is the division of labour: the runtime check is permissive, the compile-time
check is exact.

### Optional properties are not expressible

`object()` requires the key to be **present**:

```ts
object({ a: of(undefined) }).validate({});              // false — key missing
object({ a: of(undefined) }).validate({ a: undefined }); // true  — key present
```

So a type like `{ title?: string }` cannot be matched by any schema. The obvious attempt is
rejected, because an optional property is not the same as a required one that may be `undefined`:

```ts
interface Draft { title?: string }

const draftSchema: Schema<Draft> = object({
    title: union(string(), of(undefined)),
});
```

```
draft-schema.ts(7,7): error TS2322: Type 'Schema<{ title: string | undefined; }>' is not assignable to type 'Schema<Draft>'.
  Types of property 'bivarianceHack' are incompatible.
    Type '((arg: { title: string | undefined; }) => void) | undefined' is not assignable to type '((arg: Draft) => void) | undefined'.
      Type '(arg: { title: string | undefined; }) => void' is not assignable to type '(arg: Draft) => void'.
        Types of parameters 'arg' and 'arg' are incompatible.
          Type 'Draft' is not assignable to type '{ title: string | undefined; }'.
            Property 'title' is optional in type 'Draft' but required in type '{ title: string | undefined; }'.
```

Model the field as required-and-nullable (`title: string | null`) where you can, or leave the key
out of the schema and check it yourself. Leaving it out does satisfy the annotation —
`const draftSchema: Schema<Draft> = object({})` compiles, because `{}` is assignable to an
all-optional interface in both variance directions — which is worth knowing for what it implies:
an annotated `Schema<Draft>` guarantees nothing at all about `title`.

### `object()` is loose about what counts as an object

It tests `typeof value === "object" && value !== null`, and nothing more. Two consequences:

```ts
object({}).validate([]);                                 // true — arrays are typeof "object"
object({ length: number() }).validate(new String("ab")); // true — a boxed String has a length
```

If you need to exclude arrays or boxed primitives, add your own check; the library will not do it
for you.

There is one way it is *stricter* than JavaScript, though: a function fails, because `typeof` a
function is `"function"` rather than `"object"`.

```ts
object({}).validate(() => {}); // false — even though a function is an object in JS
```

A function carrying the required properties cannot satisfy an `object()` schema either. Arguably
a bug; current behaviour either way.

### `object()` checks own properties only

A key must be an **own** property of the value. `object()` walks the schema with `Reflect.ownKeys`
and checks each key with `Object.prototype.hasOwnProperty`, so both string and symbol keys are
validated, and inherited data does not count:

```ts
const id: unique symbol = Symbol("id");

interface Tagged {
    [id]: number;
    name: string;
}

const tagged: Schema<Tagged> = object({ [id]: number(), name: string() });

tagged.validate({ name: "ada", [id]: 1 });              // true
tagged.validate({ name: "ada" });                       // false — property absent
tagged.validate({ name: "ada", [id]: "not a number" }); // false — property wrong type
```

```ts
object({ a: number() }).validate(Object.create({ a: 1 })); // false — inherited, not own
object({ a: number() }).validate({ a: 1 });                // true
```

Own-property checking is the safer default for validating data that came from outside the program,
where an inherited `toString` or a polluted prototype should not be able to satisfy a schema. It
has one cost worth weighing: a **class instance that exposes its data through prototype getters no
longer validates**, because such an instance has no own properties at all.

```ts
class Point {
    get x(): number { return 1; }
}

object({ x: number() }).validate(new Point()); // false — `x` lives on Point.prototype
```

Data assigned in the constructor is an own property and validates normally, so this only bites
accessor-backed classes. Convert such an instance to a plain object before validating it, or check
those properties yourself.

### `number()` accepts `NaN` and `Infinity`

```ts
number().validate(NaN);      // true
number().validate(Infinity); // true
```

This matches TypeScript, where both are of type `number`. It is often *not* what a validator at a
JSON boundary wants, so test for finiteness separately when it matters. Boxed numbers are
rejected, since they are not `typeof "number"`:

```ts
number().validate(new Number(1)); // false
```

### `of()` compares with `===`

Fine for primitives, surprising for objects and `NaN`:

```ts
of(null).validate(undefined); // false — strict comparison, no null/undefined conflation
of({}).validate({});          // false — different references
of(NaN).validate(NaN);        // false — NaN !== NaN
```

For objects, reach for `object()` or `instanceOf()` instead of `of()`.

### Holes in a sparse array are validated as `undefined`

`array()` and `tuple()` walk indices `0..length-1` rather than using `Array.prototype.every`, which
skips holes. Reading a hole yields `undefined`, so a hole is checked exactly as a present
`undefined` is:

```ts
array(number()).validate(new Array(3));           // false — three holes, three undefineds
array(number()).validate([undefined]);            // false — same reason
tuple(string(), string()).validate(new Array(2)); // false
```

A schema that admits `undefined` accepts holes, which is the other half of the same rule:

```ts
array(union(number(), of(undefined))).validate([1, , 3]); // true
```

Note that `length` is still what drives the loop, so a hole counts towards a tuple's arity.

### Degenerate `union()` and `intersection()`

With no arguments, `some()` is `false` and `every()` is `true`:

```ts
union().validate("anything");        // false — matches nothing; the type is Schema<never>
intersection().validate("anything"); // true  — matches everything; the type is Schema<unknown>
```

Consistent with the underlying array methods, and worth remembering if you build schema lists
that can come out empty.

## Development

The library is a single file, `index.ts`. Clone, then:

```bash
npm install
```

| Script | Command | What it does |
| --- | --- | --- |
| `npm run build` | `tsc` | Emits `index.js`, `index.d.ts` and source maps from `index.ts`. |
| `npm test` | `vitest run --typecheck` | Runs the runtime tests *and* the type-level tests. |
| `npm run test:watch` | `vitest --typecheck` | The same, in watch mode. |
| `npm run typecheck` | `tsc -p tsconfig.test.json` | Typechecks `index.ts` plus everything under `test/`, with `strict` on. |

Tests live in `test/` and come in two kinds:

- **`*.test.ts` — runtime tests.** Ordinary Vitest specs that call `validate` / `assertType` /
  `as` and assert on the results and the thrown messages.
- **`*.test-d.ts` — type-level tests.** These are checked by `tsc`, not executed. They are the
  only way to test what this library is really about: that a drifted schema *fails to compile*.
  Vitest runs them via `--typecheck`, which is why `npm test` passes that flag.

Tests import the library by its package name:

```ts
import { object, string } from "@pinesw/rttg";
```

`vitest.config.mts` aliases `@pinesw/rttg` to `./index.ts`, and `tsconfig.test.json` mirrors that
with a `paths` entry. This is deliberate: a relative `../index` import would let Vite resolve the
compiled `index.js` ahead of `index.ts`, so a stale build left over from `npm run build` could end
up under test instead of the source. Importing the package name also means the tests go through
the same entry point a consumer sees.

## License

[Apache-2.0](LICENSE)
