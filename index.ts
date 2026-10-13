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
     * A hack to make the schema type parameter `T` bivariant.
     * Ignore this property; its only purpose is to influence TypeScript's type inference.
     */
    bivarianceHack?: (arg: T) => void;
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
 * Brands a schema as optional. Not exported: the brand is observable through `OptionalSchema`,
 * and nothing outside this module needs to name it.
 */
const OPTIONAL: unique symbol = Symbol("rttg.optional");

/**
 * A schema that `object()` treats as an optional property: its key may be absent from the value.
 * Everywhere else it behaves as the `Schema<T | undefined>` that it is.
 */
export interface OptionalSchema<T> extends Schema<T | undefined> {
    readonly [OPTIONAL]: true;
}

/** The argument of `object()`: a record of schemas, keyed by string, number or symbol. */
type SchemaRecord = Record<PropertyKey, Schema<any>>;

/** The keys of a schema record that `optional()` produced. */
type OptionalKeys<S> = { [K in keyof S]-?: S[K] extends OptionalSchema<any> ? K : never }[keyof S];

/** The keys of a schema record that it did not. */
type RequiredKeys<S> = { [K in keyof S]-?: S[K] extends OptionalSchema<any> ? never : K }[keyof S];

/** The object type a record of schemas describes, with the `optional()` keys carrying a `?`. */
type ObjectType<S> = {
    [K in RequiredKeys<S>]: S[K] extends Schema<infer U> ? U : never;
} & {
    [K in OptionalKeys<S>]?: S[K] extends OptionalSchema<infer U> ? U : never;
};

/**
 * Collapses the required and optional halves of `ObjectType` into a single object type.
 * The trailing `& {}` is load-bearing: without it, a mismatch against a `Schema<T>` annotation is
 * reported in terms of the unresolved alias rather than the object type the user wrote.
 */
type Flatten<T> = { [K in keyof T]: T[K] } & {};

/** Whether `optional()` produced this schema. */
function isOptional(schema: Schema<any>): boolean {
    return (schema as { [OPTIONAL]?: unknown })[OPTIONAL] === true;
}

/**
 * Creates a schema that marks a property as optional inside `object()`, so that its key may be
 * absent from the validated value. On its own it validates the wrapped schema or `undefined`.
 */
export function optional<T>(schema: Schema<T>): OptionalSchema<T> {
    return {
        ...fromOptions({
            validationFn: (value): value is T | undefined => value === undefined || schema.validate(value),
            errorMessage: "Optional validation failed",
        }),
        [OPTIONAL]: true,
    };
}

/**
 * A schema that `optional()` did not produce.
 * The brand is declared absent rather than simply left out, so that an `OptionalSchema` fails to
 * match: that is what makes a schema containing `optional()` fall through to the second overload
 * of `object()` below.
 */
type RequiredSchema<T> = Schema<T> & { readonly [OPTIONAL]?: undefined };

/**
 * Creates a schema that validates if a value is an object matching the keys and schemas defined in the input.
 * A key whose schema comes from `optional()` may be absent; every other key must be present.
 * Extra keys in the object that are not defined in the schema are ignored.
 */
// Overload 1, every key required. `T` is the validated type itself, so a `Schema<T>` annotation
// still supplies a contextual type to each sub-schema and a bare `of("circle")` keeps its literal type.
export function object<T extends {}>(schema: { [K in keyof T]: RequiredSchema<T[K]> }): Schema<T>;
// Overload 2, reached as soon as one key uses `optional()`. The result is read off the argument,
// which is the only way it can carry a `?` modifier - at the cost of the contextual type above.
export function object<S extends SchemaRecord>(schema: S): Schema<Flatten<ObjectType<S>>>;
export function object(schema: SchemaRecord): Schema<any> {
    return fromOptions({
        validationFn(value): value is unknown {
            if (typeof value !== "object" || value === null) {
                return false;
            }
            const record = value as Record<PropertyKey, unknown>;
            // Reflect.ownKeys rather than for-in: for-in never enumerates symbol keys, so every symbol-keyed sub-schema would be skipped silently.
            for (const key of Reflect.ownKeys(schema)) {
                const propertySchema = schema[key];
                // An own-property check rather than `in`, which walks the prototype chain: inherited data must not satisfy a schema.
                if (!Object.prototype.hasOwnProperty.call(value, key)) {
                    // Only optional() lets a key be absent. An inherited key counts as absent, and is left unvalidated.
                    if (isOptional(propertySchema)) {
                        continue;
                    }
                    return false;
                }
                if (!propertySchema.validate(record[key])) {
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
