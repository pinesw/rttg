import { describe, expect, it } from "vitest";
import { array, boolean, instanceOf, number, object, of, optional, string, union, type Schema } from "@pinesw/rttg";

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

    describe("only own properties count: `in` would walk the prototype chain", () => {
        it("rejects an object whose property lives on its prototype", () => {
            // object() uses Object.prototype.hasOwnProperty.call, not `key in value`,
            // so inherited data does not satisfy a schema.
            const inherited = Object.create({ a: 1 }) as object;

            expect(object({ a: number() }).validate(inherited)).toBe(false);
            expect(Object.getOwnPropertyNames(inherited)).toHaveLength(0);
            // The same data as an own property passes.
            expect(object({ a: number() }).validate({ a: 1 })).toBe(true);
        });

        it("rejects an object whose inherited property has the wrong type", () => {
            const inherited = Object.create({ a: "1" }) as object;

            expect(object({ a: number() }).validate(inherited)).toBe(false);
        });

        it("rejects a class instance whose properties are prototype getters only", () => {
            class PrototypeGetters {
                get x(): number {
                    return 1;
                }

                get y(): number {
                    return 2;
                }
            }

            const instance = new PrototypeGetters();

            // The instance has no own properties at all - both values come from
            // accessors defined on the prototype - so object() rejects it. This is
            // where the own-property rule is a real trade-off: a class exposing its
            // data through prototype accessors no longer validates, and has to be
            // converted to a plain object first.
            expect(Object.getOwnPropertyNames(instance)).toHaveLength(0);
            expect(object({ x: number(), y: number() }).validate(instance)).toBe(false);
        });

        it("accepts a class instance whose properties are set on the instance", () => {
            // The ordinary case, and the one worth protecting: data assigned in the
            // constructor is an own property and validates normally.
            class OwnFields {
                public readonly x = 1;
                public readonly y = 2;
            }

            expect(object({ x: number(), y: number() }).validate(new OwnFields())).toBe(true);
        });

        it("rejects a plain {} for a schema requiring Object.prototype members", () => {
            // Every object inherits "toString" and "constructor" from
            // Object.prototype, but neither is an own property of {}.
            expect(object({ toString: instanceOf(Function) }).validate({})).toBe(false);
            expect(object({ constructor: instanceOf(Function) }).validate({})).toBe(false);
        });

        it("accepts an Object.prototype member shadowed by an own property", () => {
            expect(object({ toString: string() }).validate({})).toBe(false);
            // Shadowing it with a string own property makes the very same schema pass.
            expect(object({ toString: string() }).validate({ toString: "shadowed" })).toBe(true);
        });

        it("accepts new String(\"ab\") for object({ length: number() })", () => {
            // A boxed string is typeof "object" and carries a numeric OWN "length",
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
            // The same answer as the {} case above, for a second reason: with no
            // prototype there is nothing to inherit, so "toString" is simply absent.
            expect(object({ toString: instanceOf(Function) }).validate(Object.create(null))).toBe(false);
        });
    });

    describe("symbol-keyed properties are validated", () => {
        // object() walks its schema with Reflect.ownKeys, not `for (const key in
        // schema)`: for-in never enumerates symbol keys, so symbol-keyed
        // sub-schemas used to be skipped entirely, and a value statically typed
        // `Tagged` could be missing its symbol property - or hold anything at all
        // there - at runtime.
        const id: unique symbol = Symbol("id");

        interface Tagged {
            [id]: number;
            name: string;
        }

        // No casts anywhere: the annotation really does accept this schema.
        const tagged: Schema<Tagged> = object({ [id]: number(), name: string() });

        it("accepts a value that carries the symbol-keyed property", () => {
            expect(tagged.validate({ name: "ada", [id]: 1 })).toBe(true);
        });

        it("rejects a value that is missing the symbol-keyed property entirely", () => {
            expect(tagged.validate({ name: "ada" })).toBe(false);
        });

        it("rejects a value whose symbol-keyed property has the wrong type", () => {
            // The sub-schema is consulted in both directions.
            expect(tagged.validate({ name: "ada", [id]: "not a number" })).toBe(false);
            expect(tagged.validate({ name: "ada", [id]: null })).toBe(false);
        });

        it("still validates the string-keyed properties of the same schema", () => {
            expect(tagged.validate({ name: 1, [id]: 1 })).toBe(false);
            expect(tagged.validate({ [id]: 1 })).toBe(false);
        });

        it("as() hands back a value whose symbol property really is there", () => {
            const value = tagged.as({ name: "ada", [id]: 7 });

            expect(value.name).toBe("ada");
            expect(value[id]).toBe(7);
            expect(id in value).toBe(true);
        });

        it("as() refuses a value that is missing the symbol property", () => {
            expect(() => tagged.as({ name: "ada" })).toThrow(/^Object validation failed$/);
        });

        it("makes a schema with only symbol keys reject objects that lack the key", () => {
            const schema = object({ [id]: number() });

            expect(schema.validate({})).toBe(false);
            expect(schema.validate([])).toBe(false);
            expect(schema.validate(null)).toBe(false);
            expect(schema.validate("ab")).toBe(false);
            expect(schema.validate({ [id]: 1 })).toBe(true);
        });

        it("validates well-known symbol keys too", () => {
            // Not limited to `unique symbol` declarations: Symbol.iterator is a key
            // plenty of real types use, and it was just as invisible to for-in.
            const schema = object({ [Symbol.iterator]: instanceOf(Function) });

            expect(schema.validate({})).toBe(false);
            // An array carries Symbol.iterator on Array.prototype rather than as an
            // own property, so the own-property rule rejects it.
            expect(schema.validate([])).toBe(false);
            expect(schema.validate({ [Symbol.iterator]: (): void => {} })).toBe(true);
        });

        it("requires a symbol key to be an own property, just like a string key", () => {
            expect(object({ [id]: number() }).validate(Object.create({ [id]: 1 }) as object)).toBe(false);
        });

        it("validates a mix of string and symbol keys in one schema", () => {
            const other: unique symbol = Symbol("other");
            const schema = object({ a: number(), [id]: string(), [other]: boolean() });

            expect(schema.validate({ a: 1, [id]: "x", [other]: true })).toBe(true);
            expect(schema.validate({ a: 1, [id]: "x", [other]: "no" })).toBe(false);
            expect(schema.validate({ a: 1, [id]: "x" })).toBe(false);
            expect(schema.validate({ [id]: "x", [other]: true })).toBe(false);
        });
    });

    describe("a property that may be undefined still demands its key", () => {
        it("rejects a missing key even when the property schema is of(undefined)", () => {
            // of(undefined) only matches a key that is PRESENT: the own-property check runs
            // before the property schema is consulted. A key that may be ABSENT is what
            // optional() is for - see "optional() properties" below.
            expect(object({ a: of(undefined) }).validate({})).toBe(false);
        });

        it("accepts a present key whose value is undefined", () => {
            expect(object({ a: of(undefined) }).validate({ a: undefined })).toBe(true);
        });

        it("rejects a present key whose value is not undefined", () => {
            expect(object({ a: of(undefined) }).validate({ a: 1 })).toBe(false);
        });

        it("requires the key to be present for a union(string(), of(undefined)) property", () => {
            // `{ a: string | undefined }` is a REQUIRED property that may hold undefined,
            // which is not the same thing as `{ a?: string }`: it still demands the key.
            // optional(string()) is what models the latter.
            const schema = object({ a: union(string(), of(undefined)) });

            expect(schema.validate({ a: "x" })).toBe(true);
            expect(schema.validate({ a: undefined })).toBe(true);
            expect(schema.validate({})).toBe(false);
            expect(schema.validate({ a: 1 })).toBe(false);
        });

        it("rejects an inherited undefined for a union(string(), of(undefined)) property", () => {
            // The key has to be an OWN property set to undefined; inheriting it is
            // not enough, because object() does not walk the prototype chain.
            const schema = object({ a: union(string(), of(undefined)) });

            expect(schema.validate(Object.create({ a: undefined }) as object)).toBe(false);
            expect(schema.validate({ a: undefined })).toBe(true);
        });
    });

    describe("optional() properties", () => {
        interface Foo {
            foo: string;
            bar?: number;
        }

        // No casts: the annotation really does accept this schema, and only this shape of it.
        const fooSchema: Schema<Foo> = object({
            foo: string(),
            bar: optional(number()),
        });

        it("accepts a value whose optional key is absent", () => {
            // The whole point: an absent key is valid, where every other schema would fail.
            expect(fooSchema.validate({ foo: "x" })).toBe(true);
        });

        it("accepts a value whose optional key is present and valid", () => {
            expect(fooSchema.validate({ foo: "x", bar: 1 })).toBe(true);
        });

        it("rejects a value whose optional key is present with the wrong type", () => {
            // Optional means "may be absent", not "unchecked".
            expect(fooSchema.validate({ foo: "x", bar: "1" })).toBe(false);
            expect(fooSchema.validate({ foo: "x", bar: null })).toBe(false);
        });

        it("accepts a value whose optional key is present and undefined", () => {
            // exactOptionalPropertyTypes is off in this project, so `{ foo: "x", bar: undefined }`
            // IS a legal Foo. optional(number()) is a Schema<number | undefined>, and accepts it.
            expect(fooSchema.validate({ foo: "x", bar: undefined })).toBe(true);
        });

        it("still requires the properties that are not optional", () => {
            expect(fooSchema.validate({ bar: 1 })).toBe(false);
            expect(fooSchema.validate({})).toBe(false);
        });

        it("accepts an empty object when every property is optional", () => {
            const schema = object({ a: optional(string()), b: optional(number()) });

            expect(schema.validate({})).toBe(true);
            expect(schema.validate({ a: "x" })).toBe(true);
            expect(schema.validate({ b: 1 })).toBe(true);
            expect(schema.validate({ a: "x", b: 1 })).toBe(true);
            expect(schema.validate({ a: 1 })).toBe(false);
        });

        it("validates an optional property whose schema is itself an object()", () => {
            const schema = object({ nested: optional(object({ b: string() })) });

            expect(schema.validate({})).toBe(true);
            expect(schema.validate({ nested: undefined })).toBe(true);
            expect(schema.validate({ nested: { b: "x" } })).toBe(true);
            expect(schema.validate({ nested: { b: 1 } })).toBe(false);
            // The inner schema keeps its own rules: `b` is required inside `nested`.
            expect(schema.validate({ nested: {} })).toBe(false);
        });

        it("validates an optional property whose schema is itself an array()", () => {
            const schema = object({ tags: optional(array(number())) });

            expect(schema.validate({})).toBe(true);
            expect(schema.validate({ tags: [] })).toBe(true);
            expect(schema.validate({ tags: [1, 2] })).toBe(true);
            expect(schema.validate({ tags: ["1"] })).toBe(false);
            expect(schema.validate({ tags: null })).toBe(false);
        });

        it("treats an INHERITED key as absent rather than as a match", () => {
            // Deliberate, and the only reading consistent with "own properties only":
            // the prototype is not part of the data, so an inherited key is simply not
            // there. It therefore satisfies the optional property - and, note, its value
            // is never validated, because there is no own value to validate.
            const fromPrototype = Object.create({ bar: 99 }) as object;
            Object.assign(fromPrototype, { foo: "x" });

            expect(Object.prototype.hasOwnProperty.call(fromPrototype, "bar")).toBe(false);
            expect(fooSchema.validate(fromPrototype)).toBe(true);

            // Even an inherited value of the WRONG type passes, for the same reason.
            const badPrototype = Object.create({ bar: "not a number" }) as object;
            Object.assign(badPrototype, { foo: "x" });

            expect(fooSchema.validate(badPrototype)).toBe(true);

            // An OWN key of the wrong type still fails, so the check is not simply skipped.
            expect(fooSchema.validate({ foo: "x", bar: "not a number" })).toBe(false);
        });

        it("validates a symbol-keyed optional property", () => {
            const id: unique symbol = Symbol("id");

            interface MaybeTagged {
                [id]?: number;
                name: string;
            }

            const schema: Schema<MaybeTagged> = object({ [id]: optional(number()), name: string() });

            expect(schema.validate({ name: "ada" })).toBe(true);
            expect(schema.validate({ name: "ada", [id]: 1 })).toBe(true);
            expect(schema.validate({ name: "ada", [id]: undefined })).toBe(true);
            expect(schema.validate({ name: "ada", [id]: "1" })).toBe(false);
            // The string-keyed property of the same schema is unaffected.
            expect(schema.validate({ [id]: 1 })).toBe(false);
        });

        it("works through assertType() and as()", () => {
            const value = fooSchema.as({ foo: "x" });

            expect(value).toEqual({ foo: "x" });
            expect(() => fooSchema.as({ foo: "x", bar: "1" })).toThrow(/^Object validation failed$/);
            expect(() => fooSchema.assertType({ bar: 1 })).toThrow(/^Object validation failed$/);
        });

        it("leaves the extra-keys-are-ignored rule alone", () => {
            expect(fooSchema.validate({ foo: "x", unrelated: true })).toBe(true);
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

describe("optional()", () => {
    // optional() exists for object(), but it is a schema in its own right. Outside object()
    // the brand means nothing and it behaves as the Schema<T | undefined> that it is.
    describe("on its own", () => {
        it("accepts undefined", () => {
            expect(optional(number()).validate(undefined)).toBe(true);
        });

        it("accepts a value matching the wrapped schema", () => {
            expect(optional(number()).validate(1)).toBe(true);
            expect(optional(string()).validate("x")).toBe(true);
        });

        it("rejects a value matching neither", () => {
            expect(optional(number()).validate("1")).toBe(false);
            expect(optional(number()).validate(null)).toBe(false);
            expect(optional(number()).validate({})).toBe(false);
        });

        it("does not accept null, which is not undefined", () => {
            // of() compares with ===, and so does this: null is a different absence.
            expect(optional(of(null)).validate(null)).toBe(true);
            expect(optional(number()).validate(null)).toBe(false);
        });

        it("throws its own message through as() and assertType()", () => {
            expect(optional(number()).as(1)).toBe(1);
            expect(optional(number()).as(undefined)).toBe(undefined);
            expect(() => optional(number()).as("x")).toThrow(/^Optional validation failed$/);
            expect(() => optional(number()).assertType("x")).toThrow(/^Optional validation failed$/);
        });

        it("survives being detached from the schema", () => {
            // fromOptions() closes over the validation function rather than reaching
            // through `this`, and the spread in optional() must not undo that.
            const { validate, as } = optional(number());

            expect(validate(1)).toBe(true);
            expect(validate("x")).toBe(false);
            expect(as(undefined)).toBe(undefined);
        });
    });

    describe("composed with the other factories", () => {
        it("nests inside array()", () => {
            expect(array(optional(number())).validate([1, undefined, 2])).toBe(true);
            expect(array(optional(number())).validate([1, "2"])).toBe(false);
        });

        it("nests inside union()", () => {
            const schema = union(optional(number()), string());

            expect(schema.validate(undefined)).toBe(true);
            expect(schema.validate(1)).toBe(true);
            expect(schema.validate("x")).toBe(true);
            expect(schema.validate(null)).toBe(false);
        });

        it("wraps another optional() without complaint", () => {
            const schema = optional(optional(number()));

            expect(schema.validate(undefined)).toBe(true);
            expect(schema.validate(1)).toBe(true);
            expect(schema.validate("x")).toBe(false);
        });

        it("keeps the brand, so it still marks a property optional after composition", () => {
            // The brand lives on the schema object optional() returns. Wrapping it in
            // another optional() keeps it; passing it through union() does not, and a
            // union()-wrapped optional therefore demands its key again.
            expect(object({ a: optional(optional(number())) }).validate({})).toBe(true);
            expect(object({ a: union(optional(number()), string()) }).validate({})).toBe(false);
        });
    });
});
