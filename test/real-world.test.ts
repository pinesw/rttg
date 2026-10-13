import { describe, expect, it } from "vitest";
import { array, assertType, number, object, of, string, union, type Schema } from "@pinesw/rttg";

/**
 * Integration-style tests: the library used the way a consumer uses it.
 *
 * Every schema below is annotated `Schema<SomeInterface>`, which is the whole
 * point of the library - the annotation makes the compiler reject a schema that
 * has drifted from the interface (wrong property type, missing property, or a
 * superfluous property via `bivarianceHack`). The runtime assertions then prove
 * the same schema actually guards the values it claims to.
 */

// ---------------------------------------------------------------------------
// 1. The library author's own motivating example: a traffic-message schedule.
// ---------------------------------------------------------------------------

interface DayStartStopTime {
    startTime: string;
    stopTime: string;
}

interface Schedule {
    months: number[] | null;
    daysOfWeek: number[] | null;
    daysOccurrencesInMonth: number[] | null;
    dayStartStopTime: DayStartStopTime[] | null;
}

interface Comment {
    language: string;
    value: string;
}

const dayStartStopTimeSchema: Schema<DayStartStopTime> = object({
    startTime: string(),
    stopTime: string(),
});

// `number[] | null` occurs three times in `Schedule`, so build it once and hand
// the same schema object to every field that needs it.
const nullableNumbersSchema: Schema<number[] | null> = union(array(number()), of(null));

const scheduleSchema: Schema<Schedule> = object({
    months: nullableNumbersSchema,
    daysOfWeek: nullableNumbersSchema,
    daysOccurrencesInMonth: nullableNumbersSchema,
    dayStartStopTime: union(array(dayStartStopTimeSchema), of(null)),
});

const commentSchema: Schema<Comment> = object({
    language: string(),
    value: string(),
});

const fullSchedule: Schedule = {
    months: [1, 2, 12],
    daysOfWeek: [1, 2, 3, 4, 5],
    daysOccurrencesInMonth: [1, -1],
    dayStartStopTime: [
        { startTime: "07:00", stopTime: "09:30" },
        { startTime: "16:00", stopTime: "18:30" },
    ],
};

const emptySchedule: Schedule = {
    months: null,
    daysOfWeek: null,
    daysOccurrencesInMonth: null,
    dayStartStopTime: null,
};

describe("the motivating example: Schedule", () => {
    it("validates a fully populated Schedule", () => {
        expect(scheduleSchema.validate(fullSchedule)).toBe(true);
    });

    it("validates a Schedule whose every field is null", () => {
        expect(scheduleSchema.validate(emptySchedule)).toBe(true);
    });

    it("rejects a Schedule whose nullable number array holds strings", () => {
        const drifted = { ...fullSchedule, months: ["1", "2"] };

        // Neither union member matches: it is not `null`, and not `number[]`.
        expect(scheduleSchema.validate(drifted)).toBe(false);
    });

    it("rejects a Schedule with a missing field", () => {
        const { daysOfWeek, ...missingDaysOfWeek } = fullSchedule;

        expect(daysOfWeek).not.toBeNull();
        expect(scheduleSchema.validate(missingDaysOfWeek)).toBe(false);
    });

    it("rejects a Schedule whose nested DayStartStopTime has a wrong scalar type", () => {
        const drifted = {
            ...fullSchedule,
            dayStartStopTime: [{ startTime: 700, stopTime: "09:30" }],
        };

        expect(scheduleSchema.validate(drifted)).toBe(false);
    });

    it("rejects undefined where the field is declared as nullable", () => {
        // `of(null)` compares with `===`, so `undefined` is not an acceptable
        // stand-in for `null`. Having the key present is not enough.
        const drifted = { ...fullSchedule, months: undefined };

        expect(scheduleSchema.validate(drifted)).toBe(false);
    });

    it("validates a Comment and rejects one with a wrong scalar type", () => {
        expect(commentSchema.validate({ language: "en", value: "Roadworks" })).toBe(true);
        expect(commentSchema.validate({ language: "en", value: 42 })).toBe(false);
    });

    it("reports only a generic message - errors carry no path to the bad field", () => {
        const drifted = { ...fullSchedule, months: ["1"] };

        // Worth knowing before reaching for this library in a user-facing
        // validator: the thrown message never says *which* field failed.
        expect(() => scheduleSchema.as(drifted)).toThrow("Object validation failed");
    });
});

// ---------------------------------------------------------------------------
// 2. The JSON.parse boundary - the library's main use case.
// ---------------------------------------------------------------------------

describe("the JSON.parse boundary", () => {
    // Note: `JSON.parse` can never hand you a sparse array or an object with a
    // non-trivial prototype, which is why the library's sparse-array and
    // inherited-property oddities (documented in the array/object test files)
    // rarely bite at this boundary - the place most consumers validate.

    it("narrows a parsed payload so a typed property can be read", () => {
        const payload: unknown = JSON.parse('{"language":"en","value":"Closed for roadworks"}');

        let language = "none";
        if (commentSchema.validate(payload)) {
            // Inside the if-block `payload` is a `Comment` for the compiler too.
            language = payload.language;
        }

        expect(language).toBe("en");
    });

    it("narrows a parsed Schedule down to its nested elements", () => {
        const payload: unknown = JSON.parse(
            '{"months":[1,2,12],"daysOfWeek":null,"daysOccurrencesInMonth":null,' +
                '"dayStartStopTime":[{"startTime":"07:00","stopTime":"09:30"}]}',
        );

        let firstStart = "none";
        if (scheduleSchema.validate(payload)) {
            firstStart = payload.dayStartStopTime?.[0]?.startTime ?? "none";
        }

        expect(firstStart).toBe("07:00");
    });

    it("rejects a malformed payload that parses but does not match", () => {
        // Valid JSON, wrong shape: `months` arrived as strings from the wire.
        const payload: unknown = JSON.parse(
            '{"months":["1"],"daysOfWeek":null,"daysOccurrencesInMonth":null,"dayStartStopTime":null}',
        );

        expect(scheduleSchema.validate(payload)).toBe(false);
    });

    it("rejects a payload that is missing a field entirely", () => {
        const payload: unknown = JSON.parse('{"language":"en"}');

        expect(commentSchema.validate(payload)).toBe(false);
    });

    it("throws through as() when the parsed payload is a bare scalar", () => {
        const payload: unknown = JSON.parse("12");

        expect(() => commentSchema.as(payload)).toThrow("Object validation failed");
    });
});

// ---------------------------------------------------------------------------
// 3. A discriminated-union API response.
// ---------------------------------------------------------------------------

interface OkResponse {
    status: "ok";
    data: Comment[];
}

interface ErrorResponse {
    status: "error";
    message: string;
}

const okResponseSchema: Schema<OkResponse> = object({
    status: of("ok"),
    data: array(commentSchema),
});

const errorResponseSchema: Schema<ErrorResponse> = object({
    status: of("error"),
    message: string(),
});

const apiResponseSchema: Schema<OkResponse | ErrorResponse> = union(
    okResponseSchema,
    errorResponseSchema,
);

describe("a discriminated-union API response", () => {
    it("validates the success variant", () => {
        const payload: unknown = {
            status: "ok",
            data: [{ language: "en", value: "Roadworks" }],
        };

        expect(apiResponseSchema.validate(payload)).toBe(true);
    });

    it("validates the error variant", () => {
        const payload: unknown = { status: "error", message: "upstream timeout" };

        expect(apiResponseSchema.validate(payload)).toBe(true);
    });

    it("rejects a response with an unknown discriminant", () => {
        const payload: unknown = { status: "pending", message: "still working" };

        expect(apiResponseSchema.validate(payload)).toBe(false);
    });

    it("rejects a success-shaped response whose data elements are malformed", () => {
        const payload: unknown = { status: "ok", data: [{ language: "en" }] };

        expect(apiResponseSchema.validate(payload)).toBe(false);
    });

    it("rejects a response that mixes the two variants", () => {
        // `status: "ok"` but carrying `message` instead of `data`: the ok schema
        // misses `data`, and the error schema misses `status === "error"`.
        const payload: unknown = { status: "ok", message: "upstream timeout" };

        expect(apiResponseSchema.validate(payload)).toBe(false);
    });

    it("lets the compiler narrow on the discriminant after validate()", () => {
        const payload: unknown = { status: "error", message: "upstream timeout" };

        let detail = "none";
        if (apiResponseSchema.validate(payload)) {
            detail = payload.status === "ok" ? `${payload.data.length} comments` : payload.message;
        }

        expect(detail).toBe("upstream timeout");
    });
});

// ---------------------------------------------------------------------------
// 4. All three entry points, on the same payload.
// ---------------------------------------------------------------------------

describe("the three entry points all narrow for the compiler", () => {
    it("narrows with validate() inside an if", () => {
        const payload: unknown = { language: "nl", value: "Werkzaamheden" };

        let value = "none";
        if (commentSchema.validate(payload)) {
            value = payload.value;
        }

        expect(value).toBe("Werkzaamheden");
    });

    it("narrows with the assertType() method", () => {
        const payload: unknown = { language: "de", value: "Vollsperrung" };

        commentSchema.assertType(payload);

        // From here on `payload` is a `Comment`, with no if-block needed.
        expect(payload.value).toBe("Vollsperrung");
    });

    it("throws from the assertType() method on a mismatch", () => {
        expect(() => {
            const payload: unknown = { language: "de" };
            commentSchema.assertType(payload);
        }).toThrow("Object validation failed");
    });

    it("narrows with as(), handing back the very same reference", () => {
        const payload: unknown = { language: "fr", value: "Route barree" };

        const comment = commentSchema.as(payload);

        expect(comment.language).toBe("fr");
        // `as()` validates and casts; it never copies.
        expect(comment).toBe(payload);
    });

    it("narrows with the standalone assertType() helper", () => {
        const payload: unknown = JSON.parse('{"language":"it","value":"Strada chiusa"}');

        assertType(payload, commentSchema);

        expect(payload.value).toBe("Strada chiusa");
    });

    it("throws a generic message from the standalone assertType() helper", () => {
        // The standalone helper ignores the schema's own error message and
        // always throws "Type assertion failed".
        expect(() => {
            const payload: unknown = { language: "it" };
            assertType(payload, commentSchema);
        }).toThrow("Type assertion failed");
    });

    it("requires the methods to be called on the schema, not destructured", () => {
        // A real papercut: `assertType` and `as` call `this.validate`, so
        // pulling them off the schema object breaks them at runtime.
        const { assertType: detached } = commentSchema;

        expect(() => detached({ language: "en", value: "Roadworks" })).toThrow(TypeError);
    });
});

// ---------------------------------------------------------------------------
// 5. One schema reused across a deep structure.
// ---------------------------------------------------------------------------

interface MessageEntry {
    schedule: Schedule;
    comment: Comment;
    cause: string | null;
}

interface TrafficMessage {
    id: string;
    entries: MessageEntry[];
}

const messageEntrySchema: Schema<MessageEntry> = object({
    schedule: scheduleSchema,
    comment: commentSchema,
    cause: union(string(), of(null)),
});

const trafficMessageSchema: Schema<TrafficMessage> = object({
    id: string(),
    entries: array(messageEntrySchema),
});

const nestedPayload = {
    id: "TTI-4711",
    entries: [
        {
            schedule: fullSchedule,
            comment: { language: "en", value: "Roadworks until April" },
            cause: "roadworks",
        },
        {
            schedule: emptySchedule,
            comment: { language: "nl", value: "Werkzaamheden tot april" },
            cause: null,
        },
    ],
};

describe("a schema reused across a deep structure", () => {
    it("validates a realistic nested payload", () => {
        expect(trafficMessageSchema.validate(nestedPayload)).toBe(true);
    });

    it("narrows all the way down to a leaf property", () => {
        const payload: unknown = JSON.parse(JSON.stringify(nestedPayload));

        let leaf = "none";
        if (trafficMessageSchema.validate(payload)) {
            leaf = payload.entries[1]?.comment.value ?? "none";
        }

        expect(leaf).toBe("Werkzaamheden tot april");
    });

    it("rejects a payload broken deep inside a nested array element", () => {
        const broken = {
            ...nestedPayload,
            entries: [
                nestedPayload.entries[0],
                {
                    ...nestedPayload.entries[1],
                    schedule: { ...emptySchedule, daysOfWeek: [1, "7"] },
                },
            ],
        };

        expect(trafficMessageSchema.validate(broken)).toBe(false);
    });

    it("rejects a payload whose deeply nested union member is wrong", () => {
        const broken = {
            ...nestedPayload,
            entries: [{ ...nestedPayload.entries[0], cause: 42 }],
        };

        expect(trafficMessageSchema.validate(broken)).toBe(false);
    });

    it("ignores extra properties anywhere in the structure", () => {
        // `object()` only checks the keys it was given, at every level.
        const extra = {
            ...nestedPayload,
            revision: 3,
            entries: [{ ...nestedPayload.entries[0], probability: 0.9 }],
        };

        expect(trafficMessageSchema.validate(extra)).toBe(true);
    });
});
