import { describe, expectTypeOf, it } from "vitest";
import {
    array,
    assertType,
    boolean,
    instanceOf,
    intersection,
    number,
    object,
    of,
    Schema,
    string,
    tuple,
    union,
} from "@pinesw/rttg";

/**
 * Type-level tests. These are executed by `tsc` (via `vitest run --typecheck`),
 * not by the runtime: every assertion here is about what the compiler infers and
 * what it refuses to accept, which is the whole point of the library.
 */

interface Comment {
    language: string;
    value: string;
}

interface Thread {
    title: string;
    comments: Comment[];
}

/** Returns a value whose *static* type is `unknown`, for the narrowing tests. */
function unknownValue(): unknown {
    return "ok";
}

/** Returns a value whose *static* type is a union, so the else branch is observable. */
function stringOrNumber(): string | number {
    return "ok";
}

describe("inference", () => {
    it("infers Schema<number> from number()", () => {
        expectTypeOf(number()).toEqualTypeOf<Schema<number>>();
    });

    it("infers Schema<string> from string()", () => {
        expectTypeOf(string()).toEqualTypeOf<Schema<string>>();
    });

    it("infers Schema<boolean> from boolean()", () => {
        expectTypeOf(boolean()).toEqualTypeOf<Schema<boolean>>();
    });

    it("widens a literal passed to of() to its base type", () => {
        // Oddity: `of<T>(value: T)` has no `extends` constraint, so TypeScript
        // widens the literal. `of("a")` is Schema<string>, NOT Schema<"a">, so
        // of() cannot express a literal type without an `as const` at the call.
        expectTypeOf(of("a")).toEqualTypeOf<Schema<string>>();
        expectTypeOf(of(1)).toEqualTypeOf<Schema<number>>();
        expectTypeOf(of(true)).toEqualTypeOf<Schema<boolean>>();
    });

    it("keeps the literal type when the argument is const-asserted", () => {
        expectTypeOf(of("a" as const)).toEqualTypeOf<Schema<"a">>();
        expectTypeOf(of(1 as const)).toEqualTypeOf<Schema<1>>();
    });

    it("infers Schema<null> from of(null)", () => {
        expectTypeOf(of(null)).toEqualTypeOf<Schema<null>>();
        expectTypeOf(of(undefined)).toEqualTypeOf<Schema<undefined>>();
    });

    it("infers the instance type from instanceOf()", () => {
        expectTypeOf(instanceOf(Date)).toEqualTypeOf<Schema<Date>>();
        expectTypeOf(instanceOf(Error)).toEqualTypeOf<Schema<Error>>();
    });

    it("infers Schema<string[]> from array(string())", () => {
        expectTypeOf(array(string())).toEqualTypeOf<Schema<string[]>>();
        expectTypeOf(array(array(number()))).toEqualTypeOf<Schema<number[][]>>();
    });

    it("infers the object shape from object()", () => {
        expectTypeOf(object({ a: string(), b: number() })).toEqualTypeOf<Schema<{ a: string; b: number }>>();
    });

    it("infers a fixed-length tuple from tuple()", () => {
        expectTypeOf(tuple(string(), number())).toEqualTypeOf<Schema<[string, number]>>();
        expectTypeOf(tuple(string(), tuple(number(), boolean()))).toEqualTypeOf<
            Schema<[string, [number, boolean]]>
        >();
    });

    it("infers a union from union()", () => {
        expectTypeOf(union(string(), number())).toEqualTypeOf<Schema<string | number>>();
        expectTypeOf(union(array(number()), of(null))).toEqualTypeOf<Schema<number[] | null>>();
    });

    it("infers an unreduced intersection from intersection()", () => {
        // Oddity: the inferred type is the *intersection* `{ a: string } & { b: number }`,
        // not the flattened object `{ a: string; b: number }`. The two are mutually
        // assignable but not identical, so this assertion pins the real shape.
        expectTypeOf(intersection(object({ a: string() }), object({ b: number() }))).toEqualTypeOf<
            Schema<{ a: string } & { b: number }>
        >();
    });

    it("infers never for an empty union and unknown for an empty intersection", () => {
        // Matches the runtime: an empty union matches nothing (Schema<never>),
        // an empty intersection matches everything (Schema<unknown>).
        expectTypeOf(union()).toEqualTypeOf<Schema<never>>();
        expectTypeOf(intersection()).toEqualTypeOf<Schema<unknown>>();
    });

    it("infers nested combinations", () => {
        expectTypeOf(
            object({
                title: string(),
                comments: array(object({ language: string(), value: string() })),
                tags: union(array(string()), of(null)),
            }),
        ).toEqualTypeOf<
            Schema<{
                title: string;
                comments: { language: string; value: string }[];
                tags: string[] | null;
            }>
        >();
    });

    it("exposes bivarianceHack as an optional property on the inferred schema", () => {
        // The hack is load-bearing for the superfluous-property check below, so
        // pin its exact type here too.
        expectTypeOf(string())
            .toHaveProperty("bivarianceHack")
            .toEqualTypeOf<((arg: string) => void) | undefined>();
    });
});

describe("narrowing", () => {
    it("narrows inside an if (validate) block", () => {
        const schema: Schema<{ a: string }> = object({ a: string() });
        const value = unknownValue();

        if (schema.validate(value)) {
            expectTypeOf(value).toEqualTypeOf<{ a: string }>();
        }
    });

    it("narrows the else branch of a union-typed value", () => {
        const schema: Schema<string> = string();
        const value = stringOrNumber();

        if (schema.validate(value)) {
            expectTypeOf(value).toEqualTypeOf<string>();
        } else {
            expectTypeOf(value).toEqualTypeOf<number>();
        }
    });

    it("leaves an unknown value unknown in the else branch", () => {
        const schema: Schema<string> = string();
        const value = unknownValue();

        if (!schema.validate(value)) {
            expectTypeOf(value).toEqualTypeOf<unknown>();
        }
    });

    it("narrows the rest of the scope after assertType()", () => {
        const schema: Schema<number[]> = array(number());
        const value = unknownValue();

        schema.assertType(value);
        expectTypeOf(value).toEqualTypeOf<number[]>();
    });

    it("requires an explicit annotation to call assertType as a method", () => {
        // Papercut: an assertion signature may only be called through a name with
        // an explicit type annotation (TS2775). An inferred `const schema = ...`
        // therefore cannot call assertType in statement position, even though
        // validate() works. The rule is only enforced where the assertion would
        // actually narrow the enclosing scope, which is why the runtime tests can
        // still write `expect(() => schema.assertType(x))` on an inferred schema.
        const schema = string();
        const value = unknownValue();

        // @ts-expect-error TS2775: assertions require an explicit type annotation
        schema.assertType(value);
    });

    it("returns T from as()", () => {
        const schema: Schema<[string, number]> = tuple(string(), number());

        expectTypeOf(schema.as(unknownValue())).toEqualTypeOf<[string, number]>();
        expectTypeOf(object({ a: boolean() }).as(unknownValue())).toEqualTypeOf<{ a: boolean }>();
    });

    it("narrows via the standalone assertType()", () => {
        const value = unknownValue();

        assertType(value, object({ language: string(), value: string() }));
        expectTypeOf(value).toEqualTypeOf<{ language: string; value: string }>();
    });

    it("narrows to a literal type via the standalone assertType()", () => {
        const value = unknownValue();

        assertType(value, of("a" as const));
        expectTypeOf(value).toEqualTypeOf<"a">();
    });
});

/**
 * In every rejection test below, the work is done by the `@ts-expect-error`
 * directive: it fails the typecheck if the line it precedes ever compiles.
 * The trailing `expectTypeOf(schema)` line cannot fail - `schema` is *declared*
 * `Schema<Comment>` and the directive swallows the right-hand side's error - so
 * each test also asserts on the bare schema EXPRESSION, whose inferred type is
 * real and would change under a refactor that relaxed the mapped type.
 */
describe("Schema<T> annotation rejects a drifted schema", () => {
    it("accepts the matching schema", () => {
        const schema: Schema<Comment> = object({ language: string(), value: string() });

        expectTypeOf(schema).toEqualTypeOf<Schema<Comment>>();
        expectTypeOf(schema.as(unknownValue())).toEqualTypeOf<Comment>();
    });

    it("rejects a wrong property type", () => {
        // @ts-expect-error `value: number()` does not match Comment["value"]
        const schema: Schema<Comment> = object({ language: string(), value: number() });

        expectTypeOf(schema).toEqualTypeOf<Schema<Comment>>();
        expectTypeOf(object({ language: string(), value: number() })).not.toEqualTypeOf<Schema<Comment>>();
    });

    it("rejects a missing property", () => {
        // @ts-expect-error the `value` property is missing from the schema
        const schema: Schema<Comment> = object({ language: string() });

        expectTypeOf(schema).toEqualTypeOf<Schema<Comment>>();
        expectTypeOf(object({ language: string() })).not.toEqualTypeOf<Schema<Comment>>();
        expectTypeOf(object({ language: string() })).not.toExtend<Schema<Comment>>();
    });

    it("rejects a superfluous property", () => {
        // This is the case only `bivarianceHack` can catch: the wider payload type
        // is still assignable to Comment, so validate()/as() stay happy and the
        // extra key would slip through without the hack.
        // @ts-expect-error `created_at` is not a property of Comment
        const schema: Schema<Comment> = object({
            language: string(),
            value: string(),
            created_at: union(number(), of(null)),
        });

        expectTypeOf(schema).toEqualTypeOf<Schema<Comment>>();
        expectTypeOf(
            object({ language: string(), value: string(), created_at: union(number(), of(null)) }),
        ).not.toEqualTypeOf<Schema<Comment>>();
    });

    it("rejects the superfluous property only because of bivarianceHack", () => {
        // The payload type itself is perfectly assignable to Comment ...
        interface WithExtra {
            language: string;
            value: string;
            created_at: number | null;
        }

        expectTypeOf<WithExtra>().toExtend<Comment>();

        // ... yet Schema<WithExtra> is not assignable to Schema<Comment>, which can
        // only come from the contravariant bivarianceHack parameter. A refactor
        // that dropped that property would silently lose this rejection - which the
        // `not.toExtend` below states directly, without relying on the directive.
        expectTypeOf<Schema<WithExtra>>().not.toExtend<Schema<Comment>>();

        // @ts-expect-error Schema<T> is invariant in T thanks to bivarianceHack
        const schema: Schema<Comment> = {} as Schema<WithExtra>;

        expectTypeOf(schema).toEqualTypeOf<Schema<Comment>>();
    });
});

describe("Schema<T> annotation rejects a drifted nested schema", () => {
    it("accepts the matching nested schema", () => {
        const schema: Schema<Thread> = object({
            title: string(),
            comments: array(object({ language: string(), value: string() })),
        });

        expectTypeOf(schema).toEqualTypeOf<Schema<Thread>>();
        expectTypeOf(schema.as(unknownValue())).toEqualTypeOf<Thread>();
    });

    it("rejects a wrong property type inside the nested array", () => {
        // @ts-expect-error comments[].value is a string, not a number
        const schema: Schema<Thread> = object({
            title: string(),
            comments: array(object({ language: string(), value: number() })),
        });

        expectTypeOf(schema).toEqualTypeOf<Schema<Thread>>();
        expectTypeOf(
            object({ title: string(), comments: array(object({ language: string(), value: number() })) }),
        ).not.toEqualTypeOf<Schema<Thread>>();
    });

    it("rejects a missing property inside the nested array", () => {
        // @ts-expect-error comments[].value is missing from the nested schema
        const schema: Schema<Thread> = object({
            title: string(),
            comments: array(object({ language: string() })),
        });

        expectTypeOf(schema).toEqualTypeOf<Schema<Thread>>();
        expectTypeOf(
            object({ title: string(), comments: array(object({ language: string() })) }),
        ).not.toEqualTypeOf<Schema<Thread>>();
    });

    it("rejects a superfluous property inside the nested array", () => {
        // Again caught by bivarianceHack, this time through array() -> object().
        // @ts-expect-error comments[].created_at is not a property of Comment
        const schema: Schema<Thread> = object({
            title: string(),
            comments: array(object({ language: string(), value: string(), created_at: number() })),
        });

        expectTypeOf(schema).toEqualTypeOf<Schema<Thread>>();
        expectTypeOf(
            object({
                title: string(),
                comments: array(object({ language: string(), value: string(), created_at: number() })),
            }),
        ).not.toEqualTypeOf<Schema<Thread>>();
    });
});

describe("Schema<T> annotation rejects a schema for an optional property", () => {
    interface Draft {
        title?: string;
    }

    it("rejects the closest schema that can be written for an optional property", () => {
        // The compile-time half of "optional properties are not expressible"
        // (object.test.ts covers the runtime half: the key must be PRESENT).
        // An optional property is not the same as a required one that may be
        // undefined, so TypeScript blames bivarianceHack - Draft is not
        // assignable to { title: string | undefined }. If the mapped type inside
        // object() were ever relaxed to a Partial-like form, the library would
        // start claiming support for optional properties it cannot check, and
        // this directive is what catches that.
        // @ts-expect-error TS2322: title is optional in Draft but required in the schema type
        const schema: Schema<Draft> = object({ title: union(string(), of(undefined)) });

        expectTypeOf(schema).toEqualTypeOf<Schema<Draft>>();
        expectTypeOf(object({ title: union(string(), of(undefined)) })).toEqualTypeOf<
            Schema<{ title: string | undefined }>
        >();
        expectTypeOf(object({ title: union(string(), of(undefined)) })).not.toEqualTypeOf<Schema<Draft>>();
    });

    it("rejects of(undefined) for an optional property as well", () => {
        // Dropping the string branch does not help either: the key is still required.
        // @ts-expect-error TS2322: title is optional in Draft but required in the schema type
        const schema: Schema<Draft> = object({ title: of(undefined) });

        expectTypeOf(schema).toEqualTypeOf<Schema<Draft>>();
        expectTypeOf(object({ title: of(undefined) })).not.toEqualTypeOf<Schema<Draft>>();
    });

    it("accepts a schema that leaves the optional property out entirely", () => {
        // Oddity, measured rather than assumed: this one DOES compile. `object({})`
        // infers Schema<{}>, and `{}` is assignable to an all-optional interface in
        // both variance directions, so the annotation is satisfied by a schema that
        // never checks `title` at all. That is the only shape it accepts for Draft -
        // and it means an annotated schema gives no guarantee whatsoever about an
        // optional property. (For a REQUIRED property, object({}) is rejected; see
        // "rejects a missing property" above.)
        const schema: Schema<Draft> = object({});

        expectTypeOf(schema).toEqualTypeOf<Schema<Draft>>();
        expectTypeOf(object({})).toExtend<Schema<Draft>>();
        expectTypeOf(object({})).not.toExtend<Schema<Comment>>();
    });
});
