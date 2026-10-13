import { describe, expect, it } from "vitest";
import {
    array,
    assertType,
    boolean,
    instanceOf,
    intersection,
    number,
    object,
    of,
    string,
    tuple,
    union,
    type Schema,
} from "@pinesw/rttg";

// This file tests the Schema<T> API surface itself - validate / assertType / as -
// independently of which factory produced the schema. Every schema below is
// annotated as `Schema<T>` rather than left to inference, because TypeScript
// requires an explicit type annotation on the call target of an assertion
// function (`asserts value is T`), which is what `assertType` is.
const numberSchema: Schema<number> = number();
const stringSchema: Schema<string> = string();
const booleanSchema: Schema<boolean> = boolean();
const literalSchema: Schema<number> = of(1);
const dateSchema: Schema<Date> = instanceOf(Date);
const objectSchema: Schema<{ a: number }> = object({ a: number() });
const arraySchema: Schema<number[]> = array(number());
const tupleSchema: Schema<[string, number]> = tuple(string(), number());
const unionSchema: Schema<string | number> = union(string(), number());
const intersectionSchema: Schema<{ a: number } & { b: string }> = intersection(
    object({ a: number() }),
    object({ b: string() }),
);

describe("Schema<T> runtime API", () => {
    describe("validate()", () => {
        it("returns the boolean primitive true, not merely a truthy value", () => {
            expect(stringSchema.validate("ab")).toBe(true);
            expect(typeof stringSchema.validate("ab")).toBe("boolean");
        });

        it("returns the boolean primitive false, not merely a falsy value", () => {
            expect(stringSchema.validate(1)).toBe(false);
            expect(typeof stringSchema.validate(1)).toBe("boolean");
        });

        it("returns real booleans for every composite factory too", () => {
            // array(), tuple(), union() and intersection() delegate to
            // Array.prototype.every/some, which return booleans. object() does NOT:
            // it runs a `for (const key in schema)` loop and returns the literals
            // true/false itself (index.ts:119-128). Either way the result is a real
            // boolean rather than, say, the last sub-schema's result.
            expect(typeof objectSchema.validate({ a: 1 })).toBe("boolean");
            expect(typeof arraySchema.validate([1])).toBe("boolean");
            expect(typeof tupleSchema.validate(["a", 1])).toBe("boolean");
            expect(typeof unionSchema.validate(true)).toBe("boolean");
            expect(typeof intersectionSchema.validate(null)).toBe("boolean");
        });

        it("can be called repeatedly on one schema with different values", () => {
            expect(numberSchema.validate(1)).toBe(true);
            expect(numberSchema.validate("1")).toBe(false);
            expect(numberSchema.validate(2)).toBe(true);
            expect(numberSchema.validate(undefined)).toBe(false);
            expect(numberSchema.validate(0)).toBe(true);
        });

        it("is stable: the same value validated twice gives the same answer", () => {
            const value = { a: 1 };

            expect(objectSchema.validate(value)).toBe(true);
            expect(objectSchema.validate(value)).toBe(true);

            const invalid = { a: "1" };

            expect(objectSchema.validate(invalid)).toBe(false);
            expect(objectSchema.validate(invalid)).toBe(false);
        });

        it("does not mutate the value it inspects", () => {
            const value: Record<string, unknown> = { a: 1, extra: "kept" };

            expect(objectSchema.validate(value)).toBe(true);
            expect(Object.keys(value)).toEqual(["a", "extra"]);
            expect(value["a"]).toBe(1);
            expect(value["extra"]).toBe("kept");
        });

        it("does not mutate the arrays it inspects", () => {
            const value = [1, 2, 3];

            expect(arraySchema.validate(value)).toBe(true);
            expect(value).toEqual([1, 2, 3]);
            expect(value.length).toBe(3);
        });

        it("is independent across sibling schemas built from the same factory", () => {
            const one: Schema<number> = of(1);
            const two: Schema<number> = of(2);

            expect(one.validate(1)).toBe(true);
            expect(two.validate(1)).toBe(false);
            expect(one.validate(2)).toBe(false);
            expect(two.validate(2)).toBe(true);
        });
    });

    describe("assertType() method", () => {
        it("returns undefined on a valid value", () => {
            expect(stringSchema.assertType("ab")).toBeUndefined();
            expect(numberSchema.assertType(1)).toBeUndefined();
        });

        it("does not throw on a valid value", () => {
            expect(() => objectSchema.assertType({ a: 1 })).not.toThrow();
            expect(() => arraySchema.assertType([1, 2])).not.toThrow();
            expect(() => tupleSchema.assertType(["a", 1])).not.toThrow();
        });

        it("throws an instance of Error on an invalid value", () => {
            let caught: unknown;
            try {
                stringSchema.assertType(1);
            } catch (error) {
                caught = error;
            }

            expect(caught).toBeInstanceOf(Error);
            expect((caught as Error).message).toBe("Expected string");
        });

        it("throws the factory's own message for number()", () => {
            expect(() => numberSchema.assertType("1")).toThrow(new Error("Expected number"));
        });

        it("throws the factory's own message for string()", () => {
            expect(() => stringSchema.assertType(1)).toThrow(new Error("Expected string"));
        });

        it("throws the factory's own message for boolean()", () => {
            expect(() => booleanSchema.assertType("true")).toThrow(new Error("Expected boolean"));
        });

        it("throws the factory's own message for of()", () => {
            // of() interpolates the expected value straight into the message.
            expect(() => literalSchema.assertType(2)).toThrow(new Error("Expected 1"));
        });

        it("throws the factory's own message for instanceOf()", () => {
            // instanceOf() uses the constructor's `name`, so Date becomes "Date".
            expect(() => dateSchema.assertType("2020-01-01")).toThrow(new Error("Expected instance of Date"));
        });

        it("throws the factory's own message for object()", () => {
            expect(() => objectSchema.assertType({ a: "1" })).toThrow(new Error("Object validation failed"));
        });

        it("throws the factory's own message for array()", () => {
            expect(() => arraySchema.assertType(["1"])).toThrow(new Error("Array validation failed"));
        });

        it("throws the factory's own message for tuple()", () => {
            expect(() => tupleSchema.assertType(["a"])).toThrow(new Error("Tuple validation failed"));
        });

        it("throws the factory's own message for union()", () => {
            expect(() => unionSchema.assertType(true)).toThrow(new Error("Union validation failed"));
        });

        it("throws the factory's own message for intersection()", () => {
            expect(() => intersectionSchema.assertType({ a: 1 })).toThrow(
                new Error("Intersection validation failed"),
            );
        });

        it("reports only the outer schema's message when a nested schema is the cause", () => {
            // The messages are flat: there is no path or cause chain, so the inner
            // "Expected number" never surfaces.
            const nested: Schema<{ a: number[] }> = object({ a: array(number()) });

            expect(() => nested.assertType({ a: ["x"] })).toThrow(new Error("Object validation failed"));
        });

        it("can be called repeatedly on the same schema", () => {
            expect(() => numberSchema.assertType(1)).not.toThrow();
            expect(() => numberSchema.assertType("1")).toThrow(new Error("Expected number"));
            expect(() => numberSchema.assertType(2)).not.toThrow();
        });
    });

    describe("as()", () => {
        it("returns the input value on success", () => {
            expect(stringSchema.as("ab")).toBe("ab");
            expect(numberSchema.as(1)).toBe(1);
            expect(booleanSchema.as(false)).toBe(false);
        });

        it("returns the identical object reference - it validates, it does not clone", () => {
            const input = { a: 1 };

            expect(objectSchema.as(input)).toBe(input);
        });

        it("returns the identical array reference", () => {
            const input = [1, 2, 3];

            expect(arraySchema.as(input)).toBe(input);
        });

        it("returns the identical reference for class instances", () => {
            const input = new Date(0);

            expect(dateSchema.as(input)).toBe(input);
        });

        it("keeps superfluous properties, because nothing is stripped", () => {
            // Contrast with schema libraries that return a parsed copy: `as` is a
            // checked cast, so extra keys survive untouched.
            const input = { a: 1, extra: "kept" };
            const result = objectSchema.as(input);

            expect(result).toBe(input);
            expect((result as typeof input).extra).toBe("kept");
        });

        it("throws the same message as assertType on failure", () => {
            expect(() => numberSchema.as("1")).toThrow(new Error("Expected number"));
            expect(() => stringSchema.as(1)).toThrow(new Error("Expected string"));
            expect(() => booleanSchema.as(0)).toThrow(new Error("Expected boolean"));
            expect(() => literalSchema.as(2)).toThrow(new Error("Expected 1"));
            expect(() => dateSchema.as(0)).toThrow(new Error("Expected instance of Date"));
            expect(() => objectSchema.as(null)).toThrow(new Error("Object validation failed"));
            expect(() => arraySchema.as("ab")).toThrow(new Error("Array validation failed"));
            expect(() => tupleSchema.as([])).toThrow(new Error("Tuple validation failed"));
            expect(() => unionSchema.as(null)).toThrow(new Error("Union validation failed"));
            expect(() => intersectionSchema.as({ b: "x" })).toThrow(new Error("Intersection validation failed"));
        });

        it("throws an instance of Error on failure", () => {
            let caught: unknown;
            try {
                objectSchema.as(null);
            } catch (error) {
                caught = error;
            }

            expect(caught).toBeInstanceOf(Error);
            expect((caught as Error).message).toBe("Object validation failed");
        });

        it("can be called repeatedly on the same schema", () => {
            const first = { a: 1 };
            const second = { a: 2 };

            expect(objectSchema.as(first)).toBe(first);
            expect(() => objectSchema.as({ a: "1" })).toThrow(new Error("Object validation failed"));
            expect(objectSchema.as(second)).toBe(second);
        });
    });

    describe("standalone assertType(value, schema)", () => {
        it("does not throw on a valid value", () => {
            expect(() => assertType("ab", stringSchema)).not.toThrow();
            expect(() => assertType({ a: 1 }, objectSchema)).not.toThrow();
        });

        it("returns undefined on a valid value", () => {
            expect(assertType(1, numberSchema)).toBeUndefined();
        });

        it("throws the generic message, NOT the schema's own message", () => {
            // Papercut: the standalone function ignores the schema's errorMessage
            // and always reports "Type assertion failed", so it is strictly less
            // informative than schema.assertType(value).
            expect(() => assertType(1, stringSchema)).toThrow(new Error("Type assertion failed"));
            expect(() => assertType("1", numberSchema)).toThrow(new Error("Type assertion failed"));
            expect(() => assertType(null, objectSchema)).toThrow(new Error("Type assertion failed"));
            expect(() => assertType("ab", arraySchema)).toThrow(new Error("Type assertion failed"));
            expect(() => assertType(2, literalSchema)).toThrow(new Error("Type assertion failed"));
        });

        it("throws a message that differs from the method's message for the same schema", () => {
            let fromFunction = "";
            try {
                assertType(1, stringSchema);
            } catch (error) {
                fromFunction = (error as Error).message;
            }

            let fromMethod = "";
            try {
                stringSchema.assertType(1);
            } catch (error) {
                fromMethod = (error as Error).message;
            }

            expect(fromFunction).toBe("Type assertion failed");
            expect(fromMethod).toBe("Expected string");
            expect(fromFunction === fromMethod).toBe(false);
        });

        it("throws an instance of Error", () => {
            let caught: unknown;
            try {
                assertType(1, stringSchema);
            } catch (error) {
                caught = error;
            }

            expect(caught).toBeInstanceOf(Error);
        });

        it("works with a detached validate, because validate does not use `this`", () => {
            // The standalone function only ever calls schema.validate(...) as a
            // method, so it is immune to the this-binding papercut below.
            const detached: Schema<string> = { validate: stringSchema.validate.bind(null) } as Schema<string>;

            expect(() => assertType("ab", detached)).not.toThrow();
            expect(() => assertType(1, detached)).toThrow(new Error("Type assertion failed"));
        });
    });

    describe("methods survive being detached from the schema", () => {
        // `fromOptions` closes over the validation function directly instead of
        // reaching for `this.validate(value)`, so assertType and as keep working
        // when they are pulled off the schema object.

        it("works when assertType is destructured off the schema", () => {
            const schema: Schema<string> = string();
            const { assertType: detachedAssertType } = schema;

            expect(() => detachedAssertType("ok")).not.toThrow();
            expect(detachedAssertType("ok")).toBeUndefined();
        });

        it("still reports a real failure when assertType is destructured", () => {
            // The error is the schema's own validation error, not a TypeError
            // about a lost receiver.
            const schema: Schema<string> = string();
            const { assertType: detachedAssertType } = schema;

            expect(() => detachedAssertType(1)).toThrow(new Error("Expected string"));
            expect(() => detachedAssertType(1)).not.toThrow(TypeError);
        });

        it("works when assertType is called as a method", () => {
            const schema: Schema<string> = string();

            expect(() => schema.assertType("ok")).not.toThrow();
            expect(schema.assertType("ok")).toBeUndefined();
        });

        it("works when as is destructured off the schema", () => {
            const schema: Schema<string> = string();
            const { as: detachedAs } = schema;

            expect(detachedAs("ok")).toBe("ok");
            expect(() => detachedAs(1)).toThrow(new Error("Expected string"));
        });

        it("works when as is called as a method", () => {
            const schema: Schema<string> = string();

            expect(schema.as("ok")).toBe("ok");
        });

        it("behaves the same for a valid and an invalid value once detached", () => {
            // Detaching changes nothing: a valid value passes and an invalid one
            // throws the ordinary validation error.
            const schema: Schema<number> = number();
            const { assertType: detachedAssertType } = schema;

            expect(() => detachedAssertType(1)).not.toThrow();
            expect(() => detachedAssertType("nope")).toThrow(new Error("Expected number"));
        });

        it("works for a detached method of a composite schema", () => {
            // Not just the primitives: object() and array() go through the same
            // factory, so their methods detach safely too.
            const { as: detachedAs } = object({ a: number() });
            const { assertType: detachedAssertType } = array(string());

            expect(detachedAs({ a: 1 })).toEqual({ a: 1 });
            expect(() => detachedAs({ a: "x" })).toThrow(new Error("Object validation failed"));
            expect(() => detachedAssertType(["a"])).not.toThrow();
            expect(() => detachedAssertType([1])).toThrow(new Error("Array validation failed"));
        });

        it("still works when the receiver is restored with bind or call", () => {
            const schema: Schema<string> = string();
            const bound: Schema<string>["assertType"] = schema.assertType.bind(schema);

            expect(() => bound("ok")).not.toThrow();
            expect(() => bound(1)).toThrow(new Error("Expected string"));
            expect(() => schema.as.call(schema, "ok")).not.toThrow();
        });

        it("works for validate too, which was always a plain function", () => {
            const schema: Schema<string> = string();
            const { validate: detachedValidate } = schema;

            expect(detachedValidate("ok")).toBe(true);
            expect(detachedValidate(1)).toBe(false);
        });

        it("keeps working after being passed around as a bare callback", () => {
            // The practical payoff: the methods can be used point-free.
            const schema: Schema<string> = string();
            const values: unknown[] = ["a", "b"];

            expect(values.map(schema.as)).toEqual(["a", "b"]);
            expect(values.every(schema.validate)).toBe(true);
        });
    });

    describe("receiver preservation through normal plumbing", () => {
        it("works for a schema stored in an array and used by index", () => {
            const schemas: Schema<string>[] = [string(), string()];

            expect(schemas[0].validate("ab")).toBe(true);
            expect(schemas[0].assertType("ab")).toBeUndefined();
            expect(schemas[1].as("cd")).toBe("cd");
            expect(() => schemas[0].assertType(1)).toThrow(new Error("Expected string"));
        });

        it("works for a schema iterated out of an array", () => {
            const schemas: Schema<number>[] = [number(), of(1)];
            const results: boolean[] = [];

            for (const schema of schemas) {
                results.push(schema.validate(1));
                results.push(schema.validate(2));
            }

            expect(results).toEqual([true, true, true, false]);
        });

        it("works for a schema passed as a function argument", () => {
            function check<T>(schema: Schema<T>, value: unknown): boolean {
                return schema.validate(value);
            }

            function coerce<T>(schema: Schema<T>, value: unknown): T {
                return schema.as(value);
            }

            expect(check(stringSchema, "ab")).toBe(true);
            expect(check(stringSchema, 1)).toBe(false);
            expect(coerce(numberSchema, 1)).toBe(1);
            expect(() => coerce(numberSchema, "1")).toThrow(new Error("Expected number"));
        });

        it("works for a schema held in an object property", () => {
            const registry: { user: Schema<{ a: number }> } = { user: objectSchema };
            const input = { a: 1 };

            expect(registry.user.validate(input)).toBe(true);
            expect(registry.user.as(input)).toBe(input);
            expect(() => registry.user.assertType({})).toThrow(new Error("Object validation failed"));
        });

        it("works for a schema returned from a function and immediately used", () => {
            function makeSchema(): Schema<string> {
                return string();
            }

            expect(makeSchema().validate("ab")).toBe(true);
            expect(makeSchema().as("ab")).toBe("ab");
            expect(() => makeSchema().assertType(1)).toThrow(new Error("Expected string"));
        });

        it("works through a wrapper that forwards with the schema as receiver", () => {
            const schemas: Schema<number>[] = [number()];
            const apply = (index: number, value: unknown): number => schemas[index].as(value);

            expect(apply(0, 42)).toBe(42);
            expect(() => apply(0, "42")).toThrow(new Error("Expected number"));
        });
    });
});
