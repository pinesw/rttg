import { describe, expect, it } from "vitest";
import {
    array,
    boolean,
    intersection,
    number,
    object,
    of,
    type Schema,
    string,
    tuple,
    union,
} from "@pinesw/rttg";

/**
 * Wraps a schema so a test can observe whether union()/intersection() actually
 * called it. Used only to pin down the short-circuiting of some()/every().
 */
function recording<T>(inner: Schema<T>, log: string[], name: string): Schema<T> {
    const validate = (value: unknown): value is T => {
        log.push(name);
        return inner.validate(value);
    };
    return {
        validate,
        assertType(value): asserts value is T {
            if (!this.validate(value)) {
                throw new Error("Recording validation failed");
            }
        },
        as(value: unknown): T {
            if (!this.validate(value)) {
                throw new Error("Recording validation failed");
            }
            return value as T;
        },
    };
}

describe("union()", () => {
    it("accepts either member of a two-member union", () => {
        const stringOrNumber = union(string(), number());

        expect(stringOrNumber.validate("hello")).toBe(true);
        expect(stringOrNumber.validate("")).toBe(true);
        expect(stringOrNumber.validate(42)).toBe(true);
        expect(stringOrNumber.validate(0)).toBe(true);
    });

    it("rejects a value that matches no member", () => {
        const stringOrNumber = union(string(), number());

        expect(stringOrNumber.validate(true)).toBe(false);
        expect(stringOrNumber.validate(null)).toBe(false);
        expect(stringOrNumber.validate(undefined)).toBe(false);
        expect(stringOrNumber.validate({})).toBe(false);
        expect(stringOrNumber.validate([])).toBe(false);
        // Boxed primitives are not typeof "string"/"number", so they fail too.
        expect(stringOrNumber.validate(new Number(1))).toBe(false);
    });

    it("accepts every member of a many-member union", () => {
        const many = union(string(), number(), boolean(), of(null), array(number()));

        expect(many.validate("x")).toBe(true);
        expect(many.validate(-1)).toBe(true);
        expect(many.validate(false)).toBe(true);
        expect(many.validate(null)).toBe(true);
        expect(many.validate([1, 2, 3])).toBe(true);

        expect(many.validate(undefined)).toBe(false);
        expect(many.validate({ a: 1 })).toBe(false);
        expect(many.validate(["1"])).toBe(false);
    });

    it("models the nullable pattern union(array(number()), of(null))", () => {
        const numbersOrNull = union(array(number()), of(null));

        expect(numbersOrNull.validate([1, 2, 3])).toBe(true);
        expect(numbersOrNull.validate([])).toBe(true);
        expect(numbersOrNull.validate(null)).toBe(true);
        // of() compares with ===, so a nullable schema never accepts undefined.
        expect(numbersOrNull.validate(undefined)).toBe(false);
        expect(numbersOrNull.validate(["1"])).toBe(false);
        expect(numbersOrNull.validate("not an array")).toBe(false);
    });

    it("models an enum as a union of literal schemas", () => {
        const letter = union(of("a"), of("b"), of("c"));

        expect(letter.validate("a")).toBe(true);
        expect(letter.validate("b")).toBe(true);
        expect(letter.validate("c")).toBe(true);

        expect(letter.validate("d")).toBe(false);
        expect(letter.validate("A")).toBe(false);
        expect(letter.validate("")).toBe(false);
        expect(letter.validate(["a"])).toBe(false);
    });

    it("matches regardless of member order", () => {
        const forwards = union(of(1), of(2), of(3));
        const backwards = union(of(3), of(2), of(1));

        // The value matching the FIRST member of each union.
        expect(forwards.validate(1)).toBe(true);
        expect(backwards.validate(3)).toBe(true);
        // The value matching the LAST member of each union.
        expect(forwards.validate(3)).toBe(true);
        expect(backwards.validate(1)).toBe(true);
        // ...and the middle one, in both orders.
        expect(forwards.validate(2)).toBe(true);
        expect(backwards.validate(2)).toBe(true);
    });

    it("stops asking members once one matches, because some() short-circuits", () => {
        const log: string[] = [];
        const lazy = union(
            recording(string(), log, "string"),
            recording(number(), log, "number"),
        );

        expect(lazy.validate("hit the first member")).toBe(true);
        expect(log).toEqual(["string"]);

        log.length = 0;
        expect(lazy.validate(1)).toBe(true);
        expect(log).toEqual(["string", "number"]);

        log.length = 0;
        expect(lazy.validate(true)).toBe(false);
        expect(log).toEqual(["string", "number"]);
    });

    it("flattens nested unions at runtime", () => {
        const nested = union(union(of(1), of(2)), union(of(3), of(4)));

        expect(nested.validate(1)).toBe(true);
        expect(nested.validate(2)).toBe(true);
        expect(nested.validate(3)).toBe(true);
        expect(nested.validate(4)).toBe(true);
        expect(nested.validate(5)).toBe(false);

        // A union nested inside a larger union keeps working alongside leaves.
        const deeper = union(union(string(), union(of(null), boolean())), number());
        expect(deeper.validate("x")).toBe(true);
        expect(deeper.validate(null)).toBe(true);
        expect(deeper.validate(true)).toBe(true);
        expect(deeper.validate(7)).toBe(true);
        expect(deeper.validate(undefined)).toBe(false);
    });

    it("validates nothing when constructed with no members", () => {
        const nothing = union();

        // Array.prototype.some() over an empty list is always false, so an
        // empty union rejects every value - there is no member to match.
        expect(nothing.validate(undefined)).toBe(false);
        expect(nothing.validate(null)).toBe(false);
        expect(nothing.validate(0)).toBe(false);
        expect(nothing.validate("")).toBe(false);
        expect(nothing.validate({})).toBe(false);
        expect(() => nothing.as(1)).toThrow("Union validation failed");
    });

    it("reports 'Union validation failed' from as() and assertType()", () => {
        const stringOrNumber = union(string(), number());

        expect(() => stringOrNumber.as(true)).toThrow("Union validation failed");
        expect(() => stringOrNumber.assertType(true)).toThrow("Union validation failed");
        // The failing members own messages are swallowed; only the union's
        // generic message survives, which makes a deep failure hard to locate.
        expect(() => stringOrNumber.as(true)).not.toThrow("Expected string");
        expect(() => stringOrNumber.as(true)).not.toThrow("Expected number");
    });

    it("returns the very same reference from as() when a member matches", () => {
        const payload = { values: [1, 2] };
        const schema = union(object({ values: array(number()) }), of(null));

        expect(schema.as(payload)).toBe(payload);
        expect(schema.as(null)).toBe(null);
    });
});

describe("union() of object() schemas as a discriminated union", () => {
    const circle = object({ kind: of("circle"), radius: number() });
    const square = object({ kind: of("square"), size: number() });
    const shape = union(circle, square);

    it("accepts a value that matches one variant and not the other", () => {
        expect(circle.validate({ kind: "circle", radius: 2 })).toBe(true);
        expect(square.validate({ kind: "circle", radius: 2 })).toBe(false);
        expect(shape.validate({ kind: "circle", radius: 2 })).toBe(true);

        expect(square.validate({ kind: "square", size: 3 })).toBe(true);
        expect(circle.validate({ kind: "square", size: 3 })).toBe(false);
        expect(shape.validate({ kind: "square", size: 3 })).toBe(true);
    });

    it("rejects a value that matches neither variant", () => {
        // Unknown discriminant.
        expect(shape.validate({ kind: "triangle", base: 1, height: 2 })).toBe(false);
        // Known discriminant, wrong payload type.
        expect(shape.validate({ kind: "circle", radius: "2" })).toBe(false);
        // Payload of one variant, discriminant of the other.
        expect(shape.validate({ kind: "square", radius: 2 })).toBe(false);
        // No discriminant at all.
        expect(shape.validate({ radius: 2 })).toBe(false);
        expect(shape.validate(null)).toBe(false);
    });

    it("matches the variant its discriminant names even with superfluous keys", () => {
        // object() only inspects the keys it declares, so the stray "size" does
        // not stop the circle variant from matching. A superfluous key is a
        // COMPILE-time error on an annotated schema, never a runtime one.
        expect(shape.validate({ kind: "circle", radius: 2, size: "nonsense" })).toBe(true);
    });
});

describe("intersection()", () => {
    const named = object({ name: string() });
    const aged = object({ age: number() });
    const person = intersection(named, aged);

    it("requires both sets of keys to be present and valid", () => {
        expect(person.validate({ name: "ada", age: 36 })).toBe(true);
    });

    it("rejects a value that satisfies only one side", () => {
        expect(named.validate({ name: "ada" })).toBe(true);
        expect(person.validate({ name: "ada" })).toBe(false);

        expect(aged.validate({ age: 36 })).toBe(true);
        expect(person.validate({ age: 36 })).toBe(false);

        expect(person.validate({})).toBe(false);
    });

    it("rejects a value with a wrongly typed key from either side", () => {
        expect(person.validate({ name: "ada", age: "36" })).toBe(false);
        expect(person.validate({ name: 1, age: 36 })).toBe(false);
        expect(person.validate({ name: undefined, age: 36 })).toBe(false);
    });

    it("accepts a value carrying the union of both key sets, plus extras", () => {
        expect(person.validate({ name: "ada", age: 36, city: "london" })).toBe(true);

        const three = intersection(named, aged, object({ city: string() }));
        expect(three.validate({ name: "ada", age: 36, city: "london" })).toBe(true);
        // One missing key from any side is enough to fail.
        expect(three.validate({ name: "ada", age: 36 })).toBe(false);
        expect(three.validate({ name: "ada", city: "london" })).toBe(false);
        expect(three.validate({ age: 36, city: "london" })).toBe(false);
    });

    it("exposes the keys of both sides through as(), without copying", () => {
        const value = { name: "ada", age: 36 };
        const merged = person.as(value);

        expect(merged.name).toBe("ada");
        expect(merged.age).toBe(36);
        // as() hands back the identical object reference.
        expect(merged).toBe(value);
    });

    it("narrows a shared key to the stricter of the two sides", () => {
        const loose = object({ id: union(string(), number()) });
        const strict = object({ id: number() });
        const both = intersection(loose, strict);

        expect(loose.validate({ id: "1" })).toBe(true);
        expect(both.validate({ id: 1 })).toBe(true);
        expect(both.validate({ id: "1" })).toBe(false);
    });

    it("is left unchanged by intersecting with an always-true schema", () => {
        const anything = intersection();
        const stillAString = intersection(string(), anything);

        expect(stillAString.validate("ok")).toBe(true);
        expect(stillAString.validate("")).toBe(true);
        expect(stillAString.validate(1)).toBe(false);
        expect(stillAString.validate(null)).toBe(false);
    });

    it("can describe a schema nothing satisfies", () => {
        // string & number is never, so the runtime check always fails.
        const impossible = intersection(string(), number());

        expect(impossible.validate("1")).toBe(false);
        expect(impossible.validate(1)).toBe(false);
        expect(impossible.validate(null)).toBe(false);
    });

    it("stops at the first failing member, because every() short-circuits", () => {
        const log: string[] = [];
        const strict = intersection(
            recording(named, log, "named"),
            recording(aged, log, "aged"),
        );

        expect(strict.validate({ age: 36 })).toBe(false);
        expect(log).toEqual(["named"]);

        log.length = 0;
        expect(strict.validate({ name: "ada" })).toBe(false);
        expect(log).toEqual(["named", "aged"]);

        log.length = 0;
        expect(strict.validate({ name: "ada", age: 36 })).toBe(true);
        expect(log).toEqual(["named", "aged"]);
    });

    it("validates everything when constructed with no members", () => {
        const anything = intersection();

        // Array.prototype.every() over an empty list is always true, so an
        // empty intersection accepts every value. Its inferred type parameter
        // is unknown (IntersectArrayElements bottoms out at unknown), so the
        // result of as() is only assignable to unknown.
        expect(anything.validate(undefined)).toBe(true);
        expect(anything.validate(null)).toBe(true);
        expect(anything.validate(0)).toBe(true);
        expect(anything.validate("")).toBe(true);
        expect(anything.validate({})).toBe(true);
        expect(anything.validate(Symbol("x"))).toBe(true);

        const out: unknown = anything.as(42);
        expect(out).toBe(42);
        expect(() => anything.assertType(undefined)).not.toThrow();
    });

    it("reports 'Intersection validation failed' from as() and assertType()", () => {
        expect(() => person.as({ name: "ada" })).toThrow("Intersection validation failed");
        expect(() => person.assertType({ name: "ada" })).toThrow(
            "Intersection validation failed",
        );
        // The failing side's own "Object validation failed" is not surfaced.
        expect(() => person.as({ name: "ada" })).not.toThrow("Object validation failed");
    });
});

describe("union() and intersection() composed with the other combinators", () => {
    it("validates a union of intersections", () => {
        const circle = intersection(object({ kind: of("circle") }), object({ radius: number() }));
        const label = intersection(object({ kind: of("label") }), object({ text: string() }));
        const node = union(circle, label);

        expect(node.validate({ kind: "circle", radius: 1 })).toBe(true);
        expect(node.validate({ kind: "label", text: "hi" })).toBe(true);
        // Each side of an intersection still needs its whole key set.
        expect(node.validate({ kind: "circle", text: "hi" })).toBe(false);
        expect(node.validate({ kind: "label", radius: 1 })).toBe(false);
        expect(node.validate({ radius: 1, text: "hi" })).toBe(false);
        // A value satisfying one intersection fully is accepted even when it
        // also carries the other side's payload key.
        expect(node.validate({ kind: "circle", radius: 1, text: "hi" })).toBe(true);
    });

    it("validates an array of a union", () => {
        const mixed = array(union(number(), string()));

        expect(mixed.validate([1, "two", 3])).toBe(true);
        expect(mixed.validate([])).toBe(true);
        expect(mixed.validate([1, true])).toBe(false);
        expect(mixed.validate([1, null])).toBe(false);
        expect(mixed.validate("ab")).toBe(false);
        // A HOLE is skipped by Array.prototype.every(), so a sparse array
        // passes vacuously even though no element matches the union. This is a
        // genuine bug in the library, recorded here as current behaviour.
        expect(mixed.validate(new Array(3))).toBe(true);
        // A present undefined, by contrast, is a real element and is checked.
        expect(mixed.validate([undefined])).toBe(false);
    });

    it("validates an object whose property is a union of objects", () => {
        const envelope = object({
            id: number(),
            payload: union(object({ ok: boolean() }), object({ error: string() })),
        });

        expect(envelope.validate({ id: 1, payload: { ok: true } })).toBe(true);
        expect(envelope.validate({ id: 1, payload: { error: "boom" } })).toBe(true);
        expect(envelope.validate({ id: 1, payload: { ok: false, error: "boom" } })).toBe(true);

        expect(envelope.validate({ id: 1, payload: {} })).toBe(false);
        expect(envelope.validate({ id: 1, payload: { ok: "yes" } })).toBe(false);
        expect(envelope.validate({ id: 1, payload: null })).toBe(false);
        // object() has no notion of an optional property: the key must exist.
        expect(envelope.validate({ id: 1 })).toBe(false);
        expect(envelope.validate({ id: "1", payload: { ok: true } })).toBe(false);
    });

    it("validates a tuple whose slots are unions", () => {
        const pair = tuple(union(string(), number()), union(of(true), of(null)));

        expect(pair.validate(["a", true])).toBe(true);
        expect(pair.validate([1, null])).toBe(true);
        expect(pair.validate([1, false])).toBe(false);
        expect(pair.validate(["a"])).toBe(false);
        expect(pair.validate(["a", true, 1])).toBe(false);
    });

    it("makes a union accept everything once an empty intersection joins it", () => {
        const everything = union(of("a"), intersection());

        expect(everything.validate("a")).toBe(true);
        expect(everything.validate(undefined)).toBe(true);
        expect(everything.validate({ anything: true })).toBe(true);
        // Nothing can ever make this union's as() throw.
        expect(() => everything.as(Symbol("x"))).not.toThrow();
    });

    it("validates a deeply nested nullable structure", () => {
        const tree = object({
            children: union(array(object({ name: string() })), of(null)),
        });

        expect(tree.validate({ children: null })).toBe(true);
        expect(tree.validate({ children: [] })).toBe(true);
        expect(tree.validate({ children: [{ name: "a" }, { name: "b" }] })).toBe(true);
        expect(tree.validate({ children: [{ name: 1 }] })).toBe(false);
        expect(tree.validate({ children: [{}] })).toBe(false);
        expect(tree.validate({ children: undefined })).toBe(false);
        expect(tree.validate({})).toBe(false);
    });
});
