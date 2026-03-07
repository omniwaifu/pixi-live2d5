import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..");
const packageJsonPath = path.resolve(repoRoot, "package.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
    exports: Record<string, { import?: string; require?: string; types?: string }>;
    types: string;
};

describe("package surface", () => {
    it("only exposes the supported entrypoints", () => {
        expect(Object.keys(packageJson.exports).sort()).toEqual([".", "./cubism5", "./extra"]);
    });

    it("ships declaration files for all public entrypoints", () => {
        expect(existsSync(path.resolve(repoRoot, packageJson.types))).toBe(true);

        Object.values(packageJson.exports).forEach((entry) => {
            if (entry.types) {
                expect(existsSync(path.resolve(repoRoot, entry.types))).toBe(true);
            }
        });
    });

    it("ships JavaScript bundles for all public entrypoints", () => {
        Object.values(packageJson.exports).forEach((entry) => {
            if (entry.import) {
                expect(existsSync(path.resolve(repoRoot, entry.import))).toBe(true);
            }

            if (entry.require) {
                expect(existsSync(path.resolve(repoRoot, entry.require))).toBe(true);
            }
        });
    });
});
