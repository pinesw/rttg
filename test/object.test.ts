import { describe, expect, it } from "vitest";
import { array, boolean, instanceOf, number, object, of, string, union, type Schema } from "@pinesw/rttg";

describe("object()", () => {
    describe("basics", () => {
        it("validates an object whose properties all match", () => {
            const schema = object({ name: string(), age: number() });

            expect(schema.validate({ name: "ada", age: 36 })).toBe(true);
        });

        it("rejects an object with a wrong-typed property", () => {
            const schema = object({ name: string(), age: number() });

            expect(schema.validate({ name: "ada", age: "36" })).toBe(false);
        });

        it("rejects an object with a missing property", () => {
            const schema = object({ name: string(), age: number() });

            expect(schema.validate({ name: "ada" })).toBe(false);
        });

        it("accepts an object with superfluous properties at runtime", () => {
            // Documented, intentional behaviour: extra keys are ignored at runtime.
            // Drift of this kind is caught at COMPILE time instead, by annotating the
            // schema as `Schema<T>` - the `bivarianceHack` property makes `T` bivariant,
            // so a schema carrying extra keys is no longer assignable.
            const schema = object({ name: string() });

            expect(schema.validate({ name: "ada", age: 36, extra: null })).toBe(true);
        });

        it("rejects null", () => {
            // The only typeof "object" value that object() explicitly excludes.
            expect(object({}).validate(null)).toBe(false);
            expect(object({ a: number() }).validate(null)).toBe(false);
        });

        it("rejects undefined", () => {
            expect(object({}).validate(undefined)).toBe(false);
            expect(object({ a: number() }).validate(undefined)).toBe(false);
        });

        it("rejects primitives", () => {
            const schema = object({});

            expect(schema.validate("ab")).toBe(false);
            expect(schema.validate(1)).toBe(false);
            expect(schema.validate(true)).toBe(false);
            expect(schema.validate(Symbol("s"))).toBe(false);
            expect(schema.validate(10n)).toBe(false);
        });

        it("rejects functions, because typeof a function is not \"object\"", () => {
            // Arguably a bug: a function IS an object in JavaScript, and a function
            // carrying the required properties still cannot satisfy an object() schema.
            const fn = () => undefined;
            (fn as unknown as Record<string, unknown>)["a"] = 1;

            expect(object({}).validate(fn)).toBe(false);
            expect(object({ a: number() }).validate(fn)).toBe(false);
        });

        it("validates each property with the schema given for that key", () => {
            const schema = object({ a: string(), b: number(), c: boolean() });

            expect(schema.validate({ a: "x", b: 1, c: true })).toBe(true);
            expect(schema.validate({ a: "x", b: 1, c: "true" })).toBe(false);
            expect(schema.validate({ a: "x", b: true, c: true })).toBe(false);
        });

        it("satisfies a Schema<T> annotation when the schema matches the interface", () => {
            interface Point {
                x: number;
                y: number;
            }

            const pointSchema: Schema<Point> = object({ x: number(), y: number() });

            expect(pointSchema.validate({ x: 1, y: 2 })).toBe(true);
            expect(pointSchema.validate({ x: 1 })).toBe(false);
        });
    });

    describe("assertType() / as()", () => {
        it("as() returns the very same object reference", () => {
            const schema = object({ a: number() });
            const input = { a: 1 };

            expect(schema.as(input)).toBe(input);
        });

        it("as() throws \"Object validation failed\" on a mismatch", () => {
            const schema = object({ a: number() });

            expect(() => schema.as({ a: "1" })).toThrow("Object validation failed");
        });

        it("assertType() throws on a mismatch and is silent on a match", () => {
            const schema = object({ a: number() });

            expect(() => schema.assertType({})).toThrow("Object validation failed");
            expect(() => schema.assertType({ a: 1 })).not.toThrow();
        });
    });

    describe("object({}) is an \"is some object\" check", () => {
        it("accepts any plain object", () => {
            expect(object({}).validate({})).toBe(true);
            expect(object({}).validate({ anything: 1 })).toBe(true);
        });

        it("accepts an array", () => {
            // Sharp edge: arrays are typeof "object" and object() does not exclude them.
            expect(object({}).validate([])).toBe(true);
            expect(object({}).validate([1, 2, 3])).toBe(true);
        });

        it("accepts exotic objects such as Date, RegExp and boxed primitives", () => {
            expect(object({}).validate(new Date(0))).toBe(true);
            expect(object({}).validate(/re/)).toBe(true);
            expect(object({}).validate(new Number(1))).toBe(true);
            expect(object({}).validate(new String("ab"))).toBe(true);
        });
    });

    describe("arrays satisfy an object() schema whose keys they happen to have", () => {
        it("accepts an array for a schema requiring a numeric length", () => {
            expect(object({ length: number() }).validate([1, 2, 3])).toBe(true);
        });

        it("accepts an array for a schema keyed by index", () => {
            // The index keys of an array are real own properties, so `"0" in ["a"]` holds.
            const schema = object({ 0: string(), 1: string() });

            expect(schema.validate(["a", "b"])).toBe(true);
            expect(schema.validate(["a", 2])).toBe(false);
            expect(schema.validate(["a"])).toBe(false);
        });
    });

    describe("inherited properties satisfy the check, because `in` walks the prototype chain", () => {
        it("accepts an object whose property lives on its prototype", () => {
            // object() uses `key in value`, not Object.hasOwn, so inherited data counts.
            const inherited = Object.create({ a: 1 }) as object;

            expect(object({ a: number() }).validate(inherited)).toBe(true);
            expect(Object.getOwnPropertyNames(inherited)).toHaveLength(0);
        });

        it("rejects an object whose inherited property has the wrong type", () => {
            const inherited = Object.create({ a: "1" }) as object;

            expect(object({ a: number() }).validate(inherited)).toBe(false);
        });

        it("accepts a class instance whose properties are prototype getters only", () => {
            class PrototypeGetters {
                get x(): number {
                    return 1;
                }

                get y(): number {
                    return 2;
                }
            }

            const instance = new PrototypeGetters();

            // The instance has no own properties at all - both values come from accessors
            // defined on the prototype - and object() still accepts it.
            expect(Object.getOwnPropertyNames(instance)).toHaveLength(0);
            expect(object({ x: number(), y: number() }).validate(instance)).toBe(true);
        });

        it("accepts a plain {} for a schema requiring Object.prototype members", () => {
            // Sharp edge: every object inherits "toString" and "constructor" from
            // Object.prototype, so a schema asking for them is satisfied by {}.
            expect(object({ toString: instanceOf(Function) }).validate({})).toBe(true);
            expect(object({ constructor: instanceOf(Function) }).validate({})).toBe(true);
        });

        it("rejects {} when an inherited Object.prototype member has the wrong type", () => {
            // {}.toString exists (inherited) but is a function, not a string.
            expect(object({ toString: string() }).validate({})).toBe(false);
            // Shadowing it with a string own property makes the very same schema pass.
            expect(object({ toString: string() }).validate({ toString: "shadowed" })).toBe(true);
        });

        it("accepts new String(\"ab\") for object({ length: number() })", () => {
            // A boxed string is typeof "object" and carries a numeric own "length",
            // while the primitive string it wraps is rejected.
            expect(object({ length: number() }).validate(new String("ab"))).toBe(true);
            expect(object({ length: number() }).validate("ab")).toBe(false);
        });
    });

    describe("objects created with Object.create(null)", () => {
        it("accepts a prototype-less object that carries the required own properties", () => {
            const bare = Object.create(null) as Record<string, unknown>;
            bare["a"] = 1;

            expect(object({ a: number() }).validate(bare)).toBe(true);
        });

        it("accepts an empty prototype-less object for object({})", () => {
            expect(object({}).validate(Object.create(null))).toBe(true);
        });

        it("rejects a prototype-less object for a schema requiring Object.prototype members", () => {
            // The mirror image of the {} case above: with no prototype there is nothing
            // to inherit, so "toString" is simply absent.
            expect(object({ toString: instanceOf(Function) }).validate(Object.create(null))).toBe(false);
        });
    });

    describe("symbol-keyed properties are never validated", () => {
        // BUG, and the same class of unsoundness as the sparse-array one: object()
        // walks its schema with `for (const key in schema)`, which never enumerates
        // symbol keys, so every symbol-keyed sub-schema is skipped entirely. The
        // compile-time half of the library accepts such a schema happily, so a
        // caller ends up with a value statically typed `Tagged` whose symbol
        // property may be absent - or hold anything at all - at runtime.
        const id: unique symbol = Symbol("id");

        interface Tagged {
            [id]: number;
            name: string;
        }

        // No casts anywhere: the annotation really does accept this schema.
        const tagged: Schema<Tagged> = object({ [id]: number(), name: string() });

        it("accepts a value that is missing the symbol-keyed property entirely", () => {
            expect(tagged.validate({ name: "ada" })).toBe(true);
        });

        it("accepts a value whose symbol-keyed property has the wrong type", () => {
            // The sub-schema is never consulted in either direction.
            expect(tagged.validate({ name: "ada", [id]: "not a number" })).toBe(true);
            expect(tagged.validate({ name: "ada", [id]: null })).toBe(true);
        });

        it("still validates the string-keyed properties of the same schema", () => {
            expect(tagged.validate({ name: 1, [id]: 1 })).toBe(false);
            expect(tagged.validate({ [id]: 1 })).toBe(false);
        });

        it("as() hands back a value typed Tagged whose symbol property is missing", () => {
            const value = tagged.as({ name: "ada" });

            expect(value.name).toBe("ada");
            expect(value[id]).toBeUndefined();
            expect(id in value).toBe(false);
        });

        it("makes a schema with only symbol keys accept any non-null object", () => {
            const schema = object({ [id]: number() });

            expect(schema.validate({})).toBe(true);
            expect(schema.validate([])).toBe(true);
            // Only the typeof/null guard is left to do any work at all.
            expect(schema.validate(null)).toBe(false);
            expect(schema.validate("ab")).toBe(false);
        });

        it("skips well-known symbol keys too", () => {
            // Not limited to `unique symbol` declarations: Symbol.iterator is a key
            // that plenty of real types use, and it is just as invisible to for-in.
            const schema = object({ [Symbol.iterator]: instanceOf(Function) });

            expect(schema.validate({})).toBe(true);
            expect(schema.validate([])).toBe(true);
        });
    });

    describe("optional properties are not expressible", () => {
        it("rejects a missing key even when the property schema is of(undefined)", () => {
            // There is no optional-property support: the `key in value` check runs before
            // the property schema, so a TypeScript type like `{ a?: string }` cannot be
            // modelled. of(undefined) only matches a key that is PRESENT.
            expect(object({ a: of(undefined) }).validate({})).toBe(false);
        });

        it("accepts a present key whose value is undefined", () => {
            expect(object({ a: of(undefined) }).validate({ a: undefined })).toBe(true);
        });

        it("rejects a present key whose value is not undefined", () => {
            expect(object({ a: of(undefined) }).validate({ a: 1 })).toBe(false);
        });

        it("requires the key to be present for a union(string(), of(undefined)) property", () => {
            // The closest you can get to `{ a?: string }` is `{ a: string | undefined }`,
            // which still demands the key.
            const schema = object({ a: union(string(), of(undefined)) });

            expect(schema.validate({ a: "x" })).toBe(true);
            expect(schema.validate({ a: undefined })).toBe(true);
            expect(schema.validate({})).toBe(false);
            expect(schema.validate({ a: 1 })).toBe(false);
        });

        it("accepts an inherited undefined for a union(string(), of(undefined)) property", () => {
            // Because `in` walks the prototype chain, inheriting the key is enough -
            // the property does not have to be an own property set to undefined.
            const schema = object({ a: union(string(), of(undefined)) });

            expect(schema.validate(Object.create({ a: undefined }) as object)).toBe(true);
        });
    });

    describe("composition", () => {
        it("validates three levels of nested object() schemas", () => {
            interface Level3 {
                value: string;
            }

            interface Level2 {
                level3: Level3;
            }

            interface Level1 {
                level2: Level2;
            }

            const schema: Schema<Level1> = object({
                level2: object({
                    level3: object({ value: string() }),
                }),
            });

            expect(schema.validate({ level2: { level3: { value: "deep" } } })).toBe(true);
            expect(schema.validate({ level2: { level3: { value: 1 } } })).toBe(false);
            expect(schema.validate({ level2: { level3: {} } })).toBe(false);
            expect(schema.validate({ level2: {} })).toBe(false);
            expect(schema.validate({ level2: null })).toBe(false);
        });

        it("ignores extra keys at every level of nesting", () => {
            const schema = object({ a: object({ b: object({ c: number() }) }) });

            expect(schema.validate({ a: { b: { c: 1, x: 1 }, x: 1 }, x: 1 })).toBe(true);
        });

        it("reports the outermost message when a deeply nested property fails", () => {
            // Errors say what failed, not where: the mismatch is two levels down,
            // inside an array element, and the message is still only the outer
            // object's. No path, no index, no `cause` chain.
            const postSchema = object({ comments: array(object({ body: string() })) });

            expect(() => postSchema.as({ comments: [{ body: 1 }] })).toThrow(/^Object validation failed$/);
            expect(() => postSchema.as({ comments: [{ body: 1 }] })).not.toThrow(/Expected string/);
            expect(() => postSchema.as({ comments: [{ body: 1 }] })).not.toThrow(/Array validation failed/);
        });

        it("validates an array() property", () => {
            const schema = object({ tags: array(string()) });

            expect(schema.validate({ tags: [] })).toBe(true);
            expect(schema.validate({ tags: ["a", "b"] })).toBe(true);
            expect(schema.validate({ tags: ["a", 1] })).toBe(false);
            expect(schema.validate({ tags: "a" })).toBe(false);
            expect(schema.validate({})).toBe(false);
        });

        it("validates an array() of object() schemas", () => {
            const schema = object({ points: array(object({ x: number(), y: number() })) });

            expect(schema.validate({ points: [{ x: 1, y: 2 }] })).toBe(true);
            expect(schema.validate({ points: [{ x: 1 }] })).toBe(false);
        });

        it("validates a union() property", () => {
            const schema = object({ id: union(string(), number()) });

            expect(schema.validate({ id: "a" })).toBe(true);
            expect(schema.validate({ id: 1 })).toBe(true);
            expect(schema.validate({ id: true })).toBe(false);
            expect(schema.validate({})).toBe(false);
        });

        it("validates a union() of two object() schemas", () => {
            const schema = union(
                object({ kind: of("a" as const), a: number() }),
                object({ kind: of("b" as const), b: string() }),
            );

            expect(schema.validate({ kind: "a", a: 1 })).toBe(true);
            expect(schema.validate({ kind: "b", b: "x" })).toBe(true);
            expect(schema.validate({ kind: "a", b: "x" })).toBe(false);
            // Sharp edge: because extra keys are ignored, a value carrying BOTH shapes
            // satisfies either branch, so such a union cannot discriminate.
            expect(schema.validate({ kind: "a", a: 1, b: "x" })).toBe(true);
        });

        it("reuses one shared child schema in two parent schemas", () => {
            const addressSchema = object({ city: string(), zip: string() });
            const personSchema = object({ name: string(), address: addressSchema });
            const companySchema = object({ vat: string(), address: addressSchema });

            const address = { city: "Amsterdam", zip: "1011" };

            expect(personSchema.validate({ name: "ada", address })).toBe(true);
            expect(companySchema.validate({ vat: "NL1", address })).toBe(true);
            expect(personSchema.validate({ name: "ada", address: { city: "Amsterdam" } })).toBe(false);
            expect(companySchema.validate({ vat: "NL1", address: { city: 1, zip: "1011" } })).toBe(false);
            // Embedding the shared schema twice does not mutate it.
            expect(addressSchema.validate(address)).toBe(true);
        });

        it("keeps two uses of the same nested schema independent", () => {
            const inner = object({ n: number() });
            const outer = object({ first: inner, second: inner });

            expect(outer.validate({ first: { n: 1 }, second: { n: 2 } })).toBe(true);
            expect(outer.validate({ first: { n: 1 }, second: { n: "2" } })).toBe(false);
        });
    });
});
