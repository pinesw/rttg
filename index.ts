/**
 * Defines a schema for validating and asserting types in TypeScript.
 * At compile time, it provides type safety, and at runtime, it ensures that values conform to the expected types.
 */
export interface Schema<T> {
    /**
     * Validates if the given value conforms to the schema.
     */
    validate(value: unknown): value is T;

    /**
     * Asserts that the given value conforms to the schema.
     * Throws an error if the value does not match the schema.
     */
    assertType(value: unknown): asserts value is T;

    /**
     * Return the given value as the type defined by the schema.
     * Throws an error if the value does not match the schema.
     * Useful for type casting with runtime validation.
     */
    as(value: unknown): T;

    /**
     * A hack to make the schema type parameter `T` invariant.
     * Ignore this property; its only purpose is to influence TypeScript's type inference.
     */
    invarianceHack?: (arg: T) => void;
}

type IntersectArrayElements<T extends unknown[]> = T extends [infer F, ...infer R]
    ? F & IntersectArrayElements<R>
    : unknown;

interface CreateOptions<T> {
    validationFn: (value: unknown) => value is T;

    /**
     * The message carried by the error that `assertType` and `as` throw.
     * Pass a function to build it lazily.
     */
    errorMessage: string | (() => string);
}

/**
 * Renders a value for an error message.
 */
function describeValue(value: unknown): string {
    try {
        return String(value);
    } catch {
        return Object.prototype.toString.call(value);
    }
}

function fromOptions<T>(options: CreateOptions<T>): Schema<T> {
    // Captured here rather than reached through `this`, so that `assertType` and `as` keep working once they are detached from the schema.
    const validate = options.validationFn;

    const fail = (): never => {
        const { errorMessage } = options;
        throw new Error(typeof errorMessage === "function" ? errorMessage() : errorMessage);
    };

    return {
        validate,
        assertType(value): asserts value is T {
            if (!validate(value)) {
                fail();
            }
        },
        as(value: unknown): T {
            if (!validate(value)) {
                fail();
            }
            return value as T;
        },
    };
}

/**
 * Creates a schema that validates if a value is exactly equal to the specified value.
 */
export function of<T>(value: T): Schema<T> {
    return fromOptions({
        validationFn: (v): v is T => v === value,
        // Built lazily: a value that cannot be stringified must not take the of() call itself down with it.
        errorMessage: () => `Expected ${describeValue(value)}`,
    });
}

/**
 * Creates a schema that validates if a value is an instance of the specified class or constructor function.
 */
export function instanceOf<T>(constructor: new (...args: any[]) => T): Schema<T> {
    return fromOptions({
        validationFn: (value): value is T => value instanceof constructor,
        errorMessage: `Expected instance of ${constructor.name}`,
    });
}

/**
 * Creates a schema that validates if a value is a number.
 */
export function number() {
    return fromOptions({
        validationFn(value): value is number {
            return typeof value === "number";
        },
        errorMessage: "Expected number",
    });
}

/**
 * Creates a schema that validates if a value is a string.
 */
export function string() {
    return fromOptions({
        validationFn(value): value is string {
            return typeof value === "string";
        },
        errorMessage: "Expected string",
    });
}

/**
 * Creates a schema that validates if a value is a boolean.
 */
export function boolean() {
    return fromOptions({
        validationFn(value): value is boolean {
            return typeof value === "boolean";
        },
        errorMessage: "Expected boolean",
    });
}

/**
 * Creates a schema that validates if a value is an object matching the keys and schemas defined in the input.
 * Extra keys in the object that are not defined in the schema are ignored.
 */
export function object<T extends {}>(schema: { [K in keyof T]: Schema<T[K]> }) {
    return fromOptions({
        validationFn(value): value is T {
            if (typeof value !== "object" || value === null) {
                return false;
            }
            const record = value as Record<PropertyKey, unknown>;
            // Reflect.ownKeys rather than for-in: for-in never enumerates symbol keys, so every symbol-keyed sub-schema would be skipped silently.
            for (const key of Reflect.ownKeys(schema) as (keyof T)[]) {
                // An own-property check rather than `in`, which walks the prototype chain: inherited data must not satisfy a schema.
                if (!Object.prototype.hasOwnProperty.call(value, key) || !schema[key].validate(record[key])) {
                    return false;
                }
            }
            return true;
        },
        errorMessage: "Object validation failed",
    });
}

/**
 * Creates a schema that validates if a value is an array where each element conforms to the specified schema.
 */
export function array<T>(schema: Schema<T>) {
    return fromOptions({
        validationFn(value): value is T[] {
            if (!Array.isArray(value)) {
                return false;
            }
            // An index loop rather than every(), which skips the holes of a sparse array and would let `new Array(3)` pass as number[].
            // Reading a hole yields undefined, so a hole is validated as such.
            for (let index = 0; index < value.length; index++) {
                if (!schema.validate(value[index])) {
                    return false;
                }
            }
            return true;
        },
        errorMessage: "Array validation failed",
    });
}

/**
 * Creates a schema that validates if a value is a tuple where each element conforms to the corresponding schema.
 */
export function tuple<T extends unknown[]>(...schemas: { [K in keyof T]: Schema<T[K]> }) {
    return fromOptions({
        validationFn(value): value is T {
            if (!Array.isArray(value)) {
                return false;
            }
            if (value.length !== schemas.length) {
                return false;
            }
            // An index loop, for the same reason as array(): every() would skip the holes of a sparse array and pass the tuple vacuously.
            for (let index = 0; index < value.length; index++) {
                if (!schemas[index]?.validate(value[index])) {
                    return false;
                }
            }
            return true;
        },
        errorMessage: "Tuple validation failed",
    });
}

/**
 * Creates a schema that validates if a value conforms to at least one of the provided schemas.
 */
export function union<T extends unknown[]>(...schemas: { [K in keyof T]: Schema<T[K]> }) {
    return fromOptions({
        validationFn(value): value is T[number] {
            return schemas.some((schema) => schema.validate(value));
        },
        errorMessage: "Union validation failed",
    });
}

/**
 * Creates a schema that validates if a value conforms to all of the provided schemas.
 */
export function intersection<T extends unknown[]>(...schemas: { [K in keyof T]: Schema<T[K]> }) {
    return fromOptions({
        validationFn(value): value is IntersectArrayElements<T> {
            return schemas.every((schema) => schema.validate(value));
        },
        errorMessage: "Intersection validation failed",
    });
}

/**
 * Asserts that a value conforms to the specified schema.
 * Throws an error if the value does not match the schema. 
 */
export function assertType<T>(value: unknown, schema: Schema<T>): asserts value is T {
    if (!schema.validate(value)) {
        throw new Error("Type assertion failed");
    }
}
