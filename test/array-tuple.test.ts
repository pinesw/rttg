import { describe, expect, it } from "vitest";
import { array, boolean, number, object, string, tuple } from "@pinesw/rttg";

describe("array()", () => {
    describe("empty arrays", () => {
        it("accepts an empty array for a primitive element schema", () => {
            expect(array(number()).validate([])).toBe(true);
            expect(array(string()).validate([])).toBe(true);
            expect(array(boolean()).validate([])).toBe(true);
        });

        it("accepts an empty array for a composite element schema", () => {
            expect(array(object({ a: number() })).validate([])).toBe(true);
            expect(array(array(string())).validate([])).toBe(true);
            expect(array(tuple(string(), number())).validate([])).toBe(true);
        });
    });

    describe("homogeneous arrays", () => {
        it("accepts an array of numbers", () => {
            expect(array(number()).validate([1])).toBe(true);
            expect(array(number()).validate([1, 2, 3])).toBe(true);
            expect(array(number()).validate([-0, 1.5, 1e21])).toBe(true);
        });

        it("accepts an array of strings", () => {
            expect(array(string()).validate(["a", "", "ccc"])).toBe(true);
        });

        it("accepts an array of booleans", () => {
            expect(array(boolean()).validate([true, false, true])).toBe(true);
        });
    });

    describe("one bad element anywhere fails", () => {
        it("rejects a bad element in the first position", () => {
            expect(array(number()).validate(["x", 2, 3])).toBe(false);
        });

        it("rejects a bad element in a middle position", () => {
            expect(array(number()).validate([1, "x", 3])).toBe(false);
        });

        it("rejects a bad element in the last position", () => {
            expect(array(number()).validate([1, 2, "x"])).toBe(false);
        });

        it("rejects a single bad element in a long array", () => {
            const values: unknown[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
            values[7] = null;
            expect(array(number()).validate(values)).toBe(false);
        });

        it("rejects a present undefined element", () => {
            // A real hole is skipped by `every` (see the known-defect block below),
            // but an element that is actually present and undefined is checked.
            expect(array(number()).validate([undefined])).toBe(false);
            expect(array(string()).validate(["a", undefined])).toBe(false);
        });
    });

    describe("non-arrays fail", () => {
        it("rejects a string, even though strings are indexable and have a length", () => {
            expect(array(string()).validate("ab")).toBe(false);
        });

        it("rejects a plain object", () => {
            expect(array(number()).validate({})).toBe(false);
            expect(array(number()).validate({ 0: 1 })).toBe(false);
        });

        it("rejects null and undefined", () => {
            expect(array(number()).validate(null)).toBe(false);
            expect(array(number()).validate(undefined)).toBe(false);
        });

        it("rejects an array-like object", () => {
            // Array.isArray is a real check, not a duck-type on `length`.
            expect(array(string()).validate({ 0: "a", length: 1 })).toBe(false);
        });

        it("rejects other non-array values", () => {
            expect(array(number()).validate(1)).toBe(false);
            expect(array(number()).validate(true)).toBe(false);
            expect(array(number()).validate(new Set([1, 2]))).toBe(false);
        });
    });

    describe("nested arrays", () => {
        it("accepts a well-formed array of arrays", () => {
            const schema = array(array(number()));
            expect(schema.validate([])).toBe(true);
            expect(schema.validate([[]])).toBe(true);
            expect(schema.validate([[1], [2, 3], []])).toBe(true);
        });

        it("rejects a bad element in an inner array", () => {
            const schema = array(array(number()));
            expect(schema.validate([[1], ["x"]])).toBe(false);
        });

        it("rejects a flat array where nested arrays are expected", () => {
            expect(array(array(number())).validate([1, 2])).toBe(false);
        });

        it("accepts three levels of nesting", () => {
            const schema = array(array(array(string())));
            expect(schema.validate([[["a"]], [[]]])).toBe(true);
            expect(schema.validate([[["a"]], [[1]]])).toBe(false);
        });
    });

    describe("arrays of object() schemas", () => {
        const schema = array(object({ id: number(), name: string() }));

        it("accepts an array of conforming objects", () => {
            expect(schema.validate([{ id: 1, name: "a" }, { id: 2, name: "b" }])).toBe(true);
        });

        it("accepts objects carrying superfluous properties, which object() ignores", () => {
            expect(schema.validate([{ id: 1, name: "a", extra: true }])).toBe(true);
        });

        it("rejects an element missing a property", () => {
            expect(schema.validate([{ id: 1, name: "a" }, { id: 2 }])).toBe(false);
        });

        it("rejects an element with a wrong property type", () => {
            expect(schema.validate([{ id: "1", name: "a" }])).toBe(false);
        });
    });
});

describe("tuple()", () => {
    describe("length", () => {
        it("accepts an exact-length match", () => {
            expect(tuple(string(), number()).validate(["a", 1])).toBe(true);
        });

        it("rejects a tuple that is too short", () => {
            expect(tuple(string(), number()).validate(["a"])).toBe(false);
            expect(tuple(string(), number()).validate([])).toBe(false);
        });

        it("rejects a tuple that is too long", () => {
            expect(tuple(string(), number()).validate(["a", 1, true])).toBe(false);
            expect(tuple(string()).validate(["a", "b"])).toBe(false);
        });
    });

    describe("element types", () => {
        it("rejects a wrong type in the first position", () => {
            expect(tuple(string(), number()).validate([1, 1])).toBe(false);
        });

        it("rejects a wrong type in the last position", () => {
            expect(tuple(string(), number()).validate(["a", "b"])).toBe(false);
        });

        it("rejects a wrong type in a middle position", () => {
            expect(tuple(string(), number(), boolean()).validate(["a", "b", true])).toBe(false);
        });

        it("rejects swapped elements of otherwise correct types", () => {
            expect(tuple(string(), number()).validate([1, "a"])).toBe(false);
        });
    });

    describe("heterogeneous tuples", () => {
        const schema = tuple(string(), number(), boolean());

        it("accepts a matching [string, number, boolean]", () => {
            expect(schema.validate(["a", 1, false])).toBe(true);
        });

        it("rejects the same values in a different order", () => {
            expect(schema.validate([1, false, "a"])).toBe(false);
        });
    });

    describe("the empty tuple", () => {
        it("accepts an empty array", () => {
            expect(tuple().validate([])).toBe(true);
        });

        it("rejects a non-empty array", () => {
            expect(tuple().validate([1])).toBe(false);
        });

        it("rejects non-arrays", () => {
            expect(tuple().validate({})).toBe(false);
            expect(tuple().validate(null)).toBe(false);
            expect(tuple().validate(undefined)).toBe(false);
        });
    });

    describe("non-arrays fail", () => {
        it("rejects an array-like object of the right length", () => {
            expect(tuple(string()).validate({ 0: "a", length: 1 })).toBe(false);
        });

        it("rejects a string of the right length", () => {
            expect(tuple(string(), string()).validate("ab")).toBe(false);
        });
    });

    describe("nested tuples", () => {
        const schema = tuple(tuple(string(), string()), number());

        it("accepts a matching nested tuple", () => {
            expect(schema.validate([["a", "b"], 1])).toBe(true);
        });

        it("rejects a bad element inside the inner tuple", () => {
            expect(schema.validate([["a", 1], 1])).toBe(false);
        });

        it("rejects a wrong length in the inner tuple", () => {
            expect(schema.validate([["a", "b", "c"], 1])).toBe(false);
            expect(schema.validate([["a"], 1])).toBe(false);
        });
    });

    describe("tuples containing other schemas", () => {
        it("accepts a tuple holding an object()", () => {
            const schema = tuple(object({ id: number() }), string());
            expect(schema.validate([{ id: 1 }, "a"])).toBe(true);
            expect(schema.validate([{ id: "1" }, "a"])).toBe(false);
            expect(schema.validate([{}, "a"])).toBe(false);
        });

        it("accepts a tuple holding an array()", () => {
            const schema = tuple(array(number()), boolean());
            expect(schema.validate([[1, 2], true])).toBe(true);
            expect(schema.validate([[1, "x"], true])).toBe(false);
        });
    });
});

/**
 * KNOWN DEFECT - recorded here as current behaviour, NOT as endorsed behaviour.
 *
 * Both array() and tuple() check their elements with `value.every(...)`, and
 * Array.prototype.every SKIPS HOLES in sparse arrays. The callback is therefore
 * never invoked for a missing index, `every` returns true vacuously, and the
 * schema reports success. The caller is then handed a value statically typed
 * `number[]` (or `[string, string]`) whose elements are `undefined` at runtime -
 * exactly the unsoundness this library exists to prevent.
 *
 * A fix would walk indices 0..length-1 instead of using `every`. Until then
 * these assertions pin the buggy behaviour, so a fix shows up as a test failure
 * here rather than silently.
 */
describe("KNOWN DEFECT: sparse arrays pass vacuously (every() skips holes)", () => {
    it("array(): new Array(3) passes although it holds no numbers at all", () => {
        expect(array(number()).validate(new Array(3))).toBe(true);
    });

    it("array(): a sparse literal with holes between real elements passes", () => {
        // `[1, , 3]` has length 3 with a hole at index 1; the hole is skipped.
        expect(array(number()).validate([1, , 3])).toBe(true);
    });

    it("array(): deleting an element of an otherwise valid array keeps it valid", () => {
        const values: (number | undefined)[] = [1, 2, 3];
        expect(array(number()).validate(values)).toBe(true);
        delete values[1];
        // The delete turned index 1 into a hole, so validation still passes.
        expect(values.length).toBe(3);
        expect(array(number()).validate(values)).toBe(true);
    });

    it("tuple(): new Array(2) passes a two-string tuple", () => {
        expect(tuple(string(), string()).validate(new Array(2))).toBe(true);
    });

    it("tuple(): a hole inside an otherwise valid tuple keeps it valid", () => {
        const values: (string | undefined)[] = ["a", "b"];
        delete values[0];
        expect(tuple(string(), string()).validate(values)).toBe(true);
    });

    it("as() hands back a value whose static type lies about its contents", () => {
        // Statically `number[]`; at runtime every element is a hole.
        const numbers = array(number()).as(new Array(2));
        expect(numbers.length).toBe(2);
        expect(numbers[0]).toBeUndefined();
        expect(typeof numbers[0]).toBe("undefined");
    });

    describe("contrast: a present undefined is correctly rejected", () => {
        it("array(): [undefined] fails where a hole would pass", () => {
            expect(array(number()).validate([undefined])).toBe(false);
            expect(array(number()).validate(new Array(1))).toBe(true);
        });

        it("array(): Array.from({ length: 3 }) fails because it is dense", () => {
            // Array.from fills the holes with real undefined values.
            expect(array(number()).validate(Array.from({ length: 3 }))).toBe(false);
            expect(array(number()).validate(new Array(3))).toBe(true);
        });

        it("tuple(): [undefined, undefined] fails where new Array(2) passes", () => {
            expect(tuple(string(), string()).validate([undefined, undefined])).toBe(false);
            expect(tuple(string(), string()).validate(new Array(2))).toBe(true);
        });
    });
});

describe("error reporting", () => {
    describe("array()", () => {
        it("as() throws 'Array validation failed'", () => {
            expect(() => array(number()).as(["x"])).toThrow(/^Array validation failed$/);
            expect(() => array(number()).as("nope")).toThrow(/^Array validation failed$/);
        });

        it("assertType() throws 'Array validation failed'", () => {
            const schema = array(number());
            expect(() => schema.assertType([1, "x"])).toThrow(/^Array validation failed$/);
        });

        it("reports the array message, not the element schema's message", () => {
            // The element schema's "Expected number" never surfaces: array() only
            // ever reports its own generic message, with no failing index. The
            // positive assertion is the load-bearing one - on its own,
            // `not.toThrow(/Expected number/)` would also pass against a library
            // that had stopped throwing from as() altogether.
            expect(() => array(number()).as(["x"])).toThrow(/^Array validation failed$/);
            expect(() => array(number()).as(["x"])).not.toThrow(/Expected number/);
        });

        it("as() returns the very same array reference when validation passes", () => {
            const values = [1, 2, 3];
            expect(array(number()).as(values)).toBe(values);
        });
    });

    describe("tuple()", () => {
        it("as() throws 'Tuple validation failed' on a wrong element type", () => {
            expect(() => tuple(string(), number()).as(["a", "b"])).toThrow(/^Tuple validation failed$/);
        });

        it("as() throws 'Tuple validation failed' on a wrong length", () => {
            expect(() => tuple(string(), number()).as(["a"])).toThrow(/^Tuple validation failed$/);
            expect(() => tuple(string(), number()).as(["a", 1, 2])).toThrow(/^Tuple validation failed$/);
        });

        it("assertType() throws 'Tuple validation failed'", () => {
            const schema = tuple(string(), number());
            expect(() => schema.assertType(null)).toThrow(/^Tuple validation failed$/);
        });

        it("as() returns the very same array reference when validation passes", () => {
            const values: [string, number] = ["a", 1];
            expect(tuple(string(), number()).as(values)).toBe(values);
        });
    });
});
