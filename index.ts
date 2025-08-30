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
    errorMessage: string;
}

function fromOptions<T>(options: CreateOptions<T>): Schema<T> {
    return {
        validate: options.validationFn,
        assertType(value): asserts value is T {
            if (!this.validate(value)) {
                throw new Error(options.errorMessage);
            }
        },
        as(value: unknown): T {
            if (!this.validate(value)) {
                throw new Error(options.errorMessage);
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
        errorMessage: `Expected ${value}`,
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
            for (const key in schema) {
                if (!(key in value) || !schema[key].validate((value as Record<string, unknown>)[key])) {
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
            return value.every((item) => schema.validate(item));
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
            return value.every((item, index) => schemas[index]?.validate(item));
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
