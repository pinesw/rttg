import { describe, expect, it } from "vitest";
import { boolean, instanceOf, number, of, string, type Schema } from "@pinesw/rttg";

class Animal {
    constructor(public readonly name: string) {}
}

class Dog extends Animal {
    bark(): string {
        return "woof";
    }
}

class Robot {
    constructor(public readonly name: string) {}
}

describe("number()", () => {
    it("accepts integers and floats, positive and negative", () => {
        expect(number().validate(0)).toBe(true);
        expect(number().validate(1)).toBe(true);
        expect(number().validate(-3.5)).toBe(true);
        expect(number().validate(1e300)).toBe(true);
    });

    it("accepts NaN and the infinities, because they are typeof number", () => {
        // Matches TypeScript's `number`, which also covers NaN and Infinity.
        // It does NOT mean "a usable, finite number".
        expect(number().validate(NaN)).toBe(true);
        expect(number().validate(Number.NaN)).toBe(true);
        expect(number().validate(Infinity)).toBe(true);
        expect(number().validate(-Infinity)).toBe(true);
    });

    it("accepts both zeroes", () => {
        expect(number().validate(0)).toBe(true);
        expect(number().validate(-0)).toBe(true);
    });

    it("rejects numeric strings - there is no coercion anywhere", () => {
        expect(number().validate("1")).toBe(false);
        expect(number().validate("0")).toBe(false);
        expect(number().validate("")).toBe(false);
        expect(number().validate("1e3")).toBe(false);
        expect(number().validate(" 1 ")).toBe(false);
        expect(number().validate("NaN")).toBe(false);
    });

    it("rejects null and undefined", () => {
        expect(number().validate(null)).toBe(false);
        expect(number().validate(undefined)).toBe(false);
    });

    it("rejects booleans", () => {
        expect(number().validate(true)).toBe(false);
        expect(number().validate(false)).toBe(false);
    });

    it("rejects bigints, which have their own typeof", () => {
        expect(number().validate(1n)).toBe(false);
        expect(number().validate(BigInt(0))).toBe(false);
    });

    it("rejects symbols", () => {
        expect(number().validate(Symbol("1"))).toBe(false);
        expect(number().validate(Symbol.iterator)).toBe(false);
    });

    it("rejects the boxed Number wrapper object", () => {
        // `new Number(1)` is typeof "object", so the typeof-based guard rejects
        // it even though it unboxes to 1.
        expect(number().validate(new Number(1))).toBe(false);
        expect(number().validate(Object(1))).toBe(false);
    });

    it("rejects arrays and plain objects, including ones that look numeric", () => {
        expect(number().validate([])).toBe(false);
        expect(number().validate([1])).toBe(false);
        expect(number().validate({})).toBe(false);
        expect(number().validate({ valueOf: () => 1 })).toBe(false);
    });

    it("rejects functions and dates", () => {
        expect(number().validate(() => 1)).toBe(false);
        expect(number().validate(new Date(0))).toBe(false);
    });

    it("as() returns the number and throws Expected number otherwise", () => {
        expect(number().as(42)).toBe(42);
        expect(number().as(NaN)).toBeNaN();
        expect(() => number().as("42")).toThrow("Expected number");
    });

    it("assertType() throws Expected number for non-numbers", () => {
        const schema: Schema<number> = number();
        expect(() => schema.assertType("42")).toThrow("Expected number");
        expect(() => schema.assertType(42)).not.toThrow();
    });
});

describe("string()", () => {
    it("accepts strings, including the empty string", () => {
        expect(string().validate("")).toBe(true);
        expect(string().validate("abc")).toBe(true);
        expect(string().validate(String(1))).toBe(true);
        expect(string().validate("a".repeat(1000))).toBe(true);
    });

    it("rejects numbers - no coercion", () => {
        expect(string().validate(1)).toBe(false);
        expect(string().validate(0)).toBe(false);
        expect(string().validate(NaN)).toBe(false);
    });

    it("rejects null and undefined", () => {
        expect(string().validate(null)).toBe(false);
        expect(string().validate(undefined)).toBe(false);
    });

    it("rejects booleans", () => {
        expect(string().validate(true)).toBe(false);
        expect(string().validate(false)).toBe(false);
    });

    it("rejects the boxed String wrapper object", () => {
        // `new String("a")` is typeof "object", so it fails despite behaving
        // like a string almost everywhere else.
        expect(string().validate(new String("a"))).toBe(false);
        expect(string().validate(Object("a"))).toBe(false);
    });

    it("rejects arrays and plain objects, including string-ish ones", () => {
        expect(string().validate([])).toBe(false);
        expect(string().validate(["a"])).toBe(false);
        expect(string().validate({})).toBe(false);
        expect(string().validate({ toString: () => "a" })).toBe(false);
    });

    it("rejects symbols and bigints", () => {
        expect(string().validate(Symbol("a"))).toBe(false);
        expect(string().validate(1n)).toBe(false);
    });

    it("as() returns the string and throws Expected string otherwise", () => {
        expect(string().as("ok")).toBe("ok");
        expect(() => string().as(1)).toThrow("Expected string");
    });

    it("assertType() throws Expected string for non-strings", () => {
        const schema: Schema<string> = string();
        expect(() => schema.assertType(new String("a"))).toThrow("Expected string");
        expect(() => schema.assertType("a")).not.toThrow();
    });
});

describe("boolean()", () => {
    it("accepts true and false", () => {
        expect(boolean().validate(true)).toBe(true);
        expect(boolean().validate(false)).toBe(true);
    });

    it("rejects truthy and falsy non-booleans", () => {
        expect(boolean().validate(1)).toBe(false);
        expect(boolean().validate(0)).toBe(false);
        expect(boolean().validate("")).toBe(false);
        expect(boolean().validate("true")).toBe(false);
        expect(boolean().validate("false")).toBe(false);
    });

    it("rejects null and undefined", () => {
        expect(boolean().validate(null)).toBe(false);
        expect(boolean().validate(undefined)).toBe(false);
    });

    it("rejects the boxed Boolean wrapper object", () => {
        // Both wrappers are typeof "object"; note that `new Boolean(false)` is
        // itself truthy, which is exactly the trap this guard avoids.
        expect(boolean().validate(new Boolean(true))).toBe(false);
        expect(boolean().validate(new Boolean(false))).toBe(false);
    });

    it("rejects arrays and plain objects", () => {
        expect(boolean().validate([])).toBe(false);
        expect(boolean().validate([true])).toBe(false);
        expect(boolean().validate({})).toBe(false);
        expect(boolean().validate({ valueOf: () => true })).toBe(false);
    });

    it("rejects symbols and bigints", () => {
        expect(boolean().validate(Symbol("true"))).toBe(false);
        expect(boolean().validate(1n)).toBe(false);
        expect(boolean().validate(0n)).toBe(false);
    });

    it("as() returns the boolean and throws Expected boolean otherwise", () => {
        expect(boolean().as(false)).toBe(false);
        expect(() => boolean().as("true")).toThrow("Expected boolean");
    });

    it("assertType() throws Expected boolean for non-booleans", () => {
        const schema: Schema<boolean> = boolean();
        expect(() => schema.assertType(1)).toThrow("Expected boolean");
        expect(() => schema.assertType(true)).not.toThrow();
    });
});

describe("of()", () => {
    it("matches string literals exactly", () => {
        expect(of("a").validate("a")).toBe(true);
        expect(of("a").validate("b")).toBe(false);
        expect(of("a").validate("A")).toBe(false);
        expect(of("").validate("")).toBe(true);
    });

    it("matches number literals exactly, without coercion", () => {
        expect(of(1).validate(1)).toBe(true);
        expect(of(1).validate(2)).toBe(false);
        expect(of(1).validate("1")).toBe(false);
        expect(of(1).validate(true)).toBe(false);
    });

    it("matches boolean literals exactly, without coercion", () => {
        expect(of(true).validate(true)).toBe(true);
        expect(of(true).validate(false)).toBe(false);
        expect(of(true).validate(1)).toBe(false);
        expect(of(false).validate(0)).toBe(false);
        expect(of(false).validate("")).toBe(false);
    });

    it("distinguishes null from undefined and from other falsy values", () => {
        expect(of(null).validate(null)).toBe(true);
        expect(of(null).validate(undefined)).toBe(false);
        expect(of(null).validate(0)).toBe(false);
        expect(of(null).validate("")).toBe(false);
        expect(of(undefined).validate(undefined)).toBe(true);
        expect(of(undefined).validate(null)).toBe(false);
    });

    it("compares objects by reference, not by shape", () => {
        const reference = { a: 1, b: "two" };
        expect(of(reference).validate(reference)).toBe(true);
        expect(of(reference).validate({ a: 1, b: "two" })).toBe(false);
        expect(of(reference).validate({ ...reference })).toBe(false);
    });

    it("compares arrays and functions by reference too", () => {
        const items = [1, 2, 3];
        const fn = () => 1;
        expect(of(items).validate(items)).toBe(true);
        expect(of(items).validate([1, 2, 3])).toBe(false);
        expect(of(items).validate(items.slice())).toBe(false);
        expect(of(fn).validate(fn)).toBe(true);
        expect(of(fn).validate(() => 1)).toBe(false);
    });

    it("never matches NaN, because it uses === and NaN !== NaN", () => {
        // Quirk: `of(NaN)` is a schema that nothing at all can satisfy.
        expect(of(NaN).validate(NaN)).toBe(false);
        expect(of(NaN).validate(Number.NaN)).toBe(false);
        expect(of(NaN).validate(0 / 0)).toBe(false);
    });

    it("treats 0 and -0 as equal, because === does (unlike Object.is)", () => {
        expect(of(0).validate(-0)).toBe(true);
        expect(of(-0).validate(0)).toBe(true);
        expect(Object.is(0, -0)).toBe(false);
    });

    it("throws at schema-construction time for symbols", () => {
        // BUG: `of` builds its error message eagerly with string interpolation
        // (`Expected ${value}`), and a symbol cannot be implicitly stringified.
        // The schema therefore can never be created, even though === would work
        // perfectly well on symbols at validation time.
        expect(() => of(Symbol("x"))).toThrow();
        expect(() => of(Symbol("x"))).toThrow(TypeError);
        expect(() => of(Symbol.iterator)).toThrow(/Cannot convert a Symbol value to a string/);
    });

    it("throws at schema-construction time for any value it cannot stringify", () => {
        // The symbol case above is only the most familiar instance of this bug.
        // The real trigger is `Expected ${value}` being evaluated eagerly, so ANY
        // value whose string conversion throws takes the of() call down with it -
        // including a prototype-less object, which is an ordinary thing to hold in
        // a map, and anything with a throwing toString.
        const bare = Object.create(null) as object;

        expect(() => of(bare)).toThrow(TypeError);
        expect(() => of(bare)).toThrow(/Cannot convert object to primitive value/);
        expect(() =>
            of({
                toString(): string {
                    throw new Error("boom");
                },
            }),
        ).toThrow("boom");
    });

    it("builds the schema fine for values that stringify without throwing", () => {
        // The dividing line is stringification, not the kind of value: an object
        // WITH a prototype is fine, and so is a bigint, which cannot be implicitly
        // added to a string but can be interpolated into a template literal.
        expect(() => of(Object.create({}) as object)).not.toThrow();
        expect(() => of(1n)).not.toThrow();
        expect(() => of(1n).as(2n)).toThrow("Expected 1");
        expect(of(1n).validate(1n)).toBe(true);
    });

    it("as() throws a message built from the expected value", () => {
        expect(() => of(1).as(2)).toThrow("Expected 1");
        expect(() => of("a").as("b")).toThrow("Expected a");
        expect(() => of(null).as(1)).toThrow("Expected null");
        expect(() => of(undefined).as(null)).toThrow("Expected undefined");
    });

    it("as() produces a useless message for object literals", () => {
        // Consequence of the same eager interpolation: objects stringify to
        // "[object Object]", so the error says nothing about what was expected.
        expect(() => of({ a: 1 }).as({ a: 1 })).toThrow("Expected [object Object]");
    });

    it("as() returns the very same reference it was given", () => {
        const reference = { a: 1 };
        expect(of(reference).as(reference)).toBe(reference);
    });

    it("assertType() throws for a non-matching value and passes for the exact one", () => {
        const schema: Schema<"a"> = of("a");
        expect(() => schema.assertType("b")).toThrow("Expected a");
        expect(() => schema.assertType("a")).not.toThrow();
    });
});

describe("instanceOf()", () => {
    it("accepts instances of a user-defined class", () => {
        expect(instanceOf(Animal).validate(new Animal("ann"))).toBe(true);
        expect(instanceOf(Dog).validate(new Dog("rex"))).toBe(true);
    });

    it("accepts a subclass instance for a parent-class schema", () => {
        expect(instanceOf(Animal).validate(new Dog("rex"))).toBe(true);
    });

    it("rejects a parent instance for a subclass schema", () => {
        expect(instanceOf(Dog).validate(new Animal("ann"))).toBe(false);
    });

    it("rejects an instance of an unrelated class with the same shape", () => {
        // `instanceof` walks the prototype chain, so structural similarity is
        // irrelevant here - unlike object().
        expect(instanceOf(Animal).validate(new Robot("r2"))).toBe(false);
        expect(instanceOf(Robot).validate(new Animal("ann"))).toBe(false);
    });

    it("rejects a plain object that duck-types the class", () => {
        expect(instanceOf(Animal).validate({ name: "ann" })).toBe(false);
        expect(instanceOf(Dog).validate({ name: "rex", bark: () => "woof" })).toBe(false);
    });

    it("rejects null and undefined", () => {
        expect(instanceOf(Animal).validate(null)).toBe(false);
        expect(instanceOf(Animal).validate(undefined)).toBe(false);
        expect(instanceOf(Date).validate(null)).toBe(false);
        expect(instanceOf(Date).validate(undefined)).toBe(false);
    });

    it("accepts built-in instances for their own constructor", () => {
        expect(instanceOf(Date).validate(new Date(0))).toBe(true);
        expect(instanceOf(Error).validate(new Error("boom"))).toBe(true);
        expect(instanceOf(RegExp).validate(/a/)).toBe(true);
        expect(instanceOf(RegExp).validate(new RegExp("a"))).toBe(true);
        expect(instanceOf(Map).validate(new Map())).toBe(true);
        expect(instanceOf(Set).validate(new Set())).toBe(true);
        expect(instanceOf(Array).validate([])).toBe(true);
        expect(instanceOf(Array).validate([1, 2])).toBe(true);
    });

    it("rejects instances of a different built-in constructor", () => {
        expect(instanceOf(Map).validate(new Set())).toBe(false);
        expect(instanceOf(Set).validate(new Map())).toBe(false);
        expect(instanceOf(Date).validate(/a/)).toBe(false);
        expect(instanceOf(RegExp).validate(new Date(0))).toBe(false);
        expect(instanceOf(Array).validate({ length: 0 })).toBe(false);
        expect(instanceOf(Array).validate("ab")).toBe(false);
    });

    it("accepts built-in subclass instances, e.g. TypeError for Error", () => {
        expect(instanceOf(Error).validate(new TypeError("nope"))).toBe(true);
        expect(instanceOf(TypeError).validate(new Error("nope"))).toBe(false);
    });

    it("accepts anything object-ish for instanceOf(Object) but no primitives", () => {
        expect(instanceOf(Object).validate({})).toBe(true);
        expect(instanceOf(Object).validate([])).toBe(true);
        expect(instanceOf(Object).validate(new Dog("rex"))).toBe(true);
        expect(instanceOf(Object).validate(null)).toBe(false);
        expect(instanceOf(Object).validate(1)).toBe(false);
        expect(instanceOf(Object).validate("a")).toBe(false);
    });

    it("rejects primitives for their wrapper constructor but accepts boxed objects", () => {
        // The mirror image of number()/string(): `instanceof` only ever sees
        // the boxed object, never the primitive.
        expect(instanceOf(Number).validate(1)).toBe(false);
        expect(instanceOf(Number).validate(new Number(1))).toBe(true);
        expect(instanceOf(String).validate("a")).toBe(false);
        expect(instanceOf(String).validate(new String("a"))).toBe(true);
    });

    it("as() error message includes the constructor name", () => {
        expect(() => instanceOf(Dog).as({})).toThrow("Expected instance of Dog");
        expect(() => instanceOf(Animal).as(new Robot("r2"))).toThrow("Expected instance of Animal");
        expect(() => instanceOf(Date).as("2020-01-01")).toThrow("Expected instance of Date");
    });

    it("assertType() error message includes the constructor name", () => {
        const schema: Schema<Dog> = instanceOf(Dog);
        expect(() => schema.assertType(new Animal("ann"))).toThrow("Expected instance of Dog");
        expect(() => schema.assertType(new Dog("rex"))).not.toThrow();
    });

    it("as() returns the very same instance it was given", () => {
        const date = new Date(0);
        expect(instanceOf(Date).as(date)).toBe(date);
    });
});
