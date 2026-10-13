import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const source = fileURLToPath(new URL("./index.ts", import.meta.url));

export default defineConfig({
    resolve: {
        alias: {
            // Tests import from the package name, exactly like a consumer would.
            // The alias pins that to `index.ts`, so a stale compiled `index.js`
            // left over from `npm run build` can never be picked up instead.
            "@pinesw/rttg": source,
        },
    },
    test: {
        include: ["test/**/*.test.ts"],
        typecheck: {
            // The type-level assertions in *.test-d.ts are run by `tsc`, not by
            // the runtime. They are the only way to test what this library is
            // really about: the compile-time errors.
            enabled: true,
            tsconfig: "./tsconfig.test.json",
            include: ["test/**/*.test-d.ts"],
        },
    },
});
