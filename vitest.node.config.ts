import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "src"),
            "@cubism": path.resolve(__dirname, "cubism/src"),
        },
    },
    test: {
        environment: "node",
        include: ["**/*.node.test.ts"],
        setupFiles: ["./test/setup.ts"],
    },
});
