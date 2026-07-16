/// <reference types="vitest" />

import { existsSync, readFileSync } from "fs";
import path from "path";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vite";
import packageJson from "./package.json";

const cubismSubmodule = path.resolve(__dirname, "cubism");
const cubismCore = path.resolve(__dirname, "core/live2dcubismcore.js");

if (!existsSync(cubismSubmodule) || !existsSync(path.resolve(cubismSubmodule, "package.json"))) {
    throw new Error(
        "Cubism submodule not found. Please run `git submodule update --init` to download them. If you have trouble downloading the submodule, please check out DEVELOPMENT.md for possible solutions.",
    );
}

export default defineConfig(({ command, mode }) => {
    const isDev = command === "serve";
    const isTest = mode === "test";

    if ((isDev || isTest) && !existsSync(cubismCore)) {
        throw new Error("Cubism Core not found. Please run `bun run setup` to download it.");
    }

    return {
        define: {
            __DEV__: isDev,
            __VERSION__: JSON.stringify(packageJson.version),

            // test env
            __HEADLESS__: process.env.CI === "true",
        },
        resolve: {
            alias: {
                "@": path.resolve(__dirname, "src"),
                "@cubism": path.resolve(__dirname, "cubism/src"),
            },
        },
        server: {
            open: !isTest && "/playground/index.html",
        },
        build: {
            target: "es6",
            lib: {
                entry: "",
                name: "PIXI.live2d",
            },
            rollupOptions: {
                external(id, parentId, isResolved) {
                    return id === "pixi.js" || id.startsWith("@pixi/");
                },
                output: {
                    extend: true,
                    globals(id: string) {
                        if (id === "pixi.js") {
                            return "PIXI";
                        }

                        if (id.startsWith("@pixi/")) {
                            const packageJsonPath = path.resolve(
                                __dirname,
                                `./node_modules/${id}/package.json`,
                            );
                            const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
                            return packageJson.namespace || "PIXI";
                        }
                    },
                },
            },
            minify: false,
        },
        plugins: [
            isTest && {
                name: "load-cubism-core",
                enforce: "post" as const,
                transform(code, id) {
                    if (id.includes("test/load-cores.ts")) {
                        code = code.replace(
                            '"__CUBISM_CORE_SOURCE__"',
                            JSON.stringify(readFileSync(cubismCore, "utf-8")),
                        );

                        return { code };
                    }
                },
            },
        ],
        test: {
            include: ["**/*.browser.test.ts", "**/*.browser.test.js"],
            browser: {
                enabled: true,
                headless: true,
                provider: playwright(),
                instances: [{ browser: "chromium" }],
            },
            setupFiles: ["./test/setup.ts"],
        },
    };
});
