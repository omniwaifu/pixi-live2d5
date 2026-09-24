// Verifies the package as a consumer receives it: packs the checkout, installs the tarball into a
// private temporary project, type-checks every public entrypoint against the published declarations,
// and loads every entrypoint through both `require` and `import` under Node.
import { execFileSync } from "child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join, resolve, sep } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const packageName = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")).name;
const pixiVersion = JSON.parse(
    readFileSync(join(repoRoot, "node_modules/pixi.js/package.json"), "utf8"),
).version;
const tscPath = join(repoRoot, "node_modules/typescript/bin/tsc");
// Cubism Core is a separately licensed prerequisite that consumers load themselves; it is not part of
// the package, so the smoke tests preload the checkout's downloaded copy.
const corePath = join(repoRoot, "core/live2dcubismcore.js");
const installedPackageDir = `${sep}node_modules${sep}${packageName}${sep}`;

// [specifier, export name, whether the export is a Live2DModel class]
const entrypoints = [
    [packageName, "Live2DModel", true],
    [`${packageName}/cubism5`, "Live2DModel", true],
    [`${packageName}/extra`, "HitAreaFrames", false],
];

const consumerSource = `import { Live2DModel } from "${packageName}";
import { Live2DModel as Cubism5Live2DModel } from "${packageName}/cubism5";
import { HitAreaFrames } from "${packageName}/extra";

const from: typeof Live2DModel.from = Cubism5Live2DModel.from;
const frames: HitAreaFrames = new HitAreaFrames();

export { from, frames };
`;

const smokeImports = {
    cjs: `const { readFileSync } = require("node:fs");
const assert = require("node:assert/strict");
const { dirname } = require("node:path");
const vm = require("node:vm");`,
    mjs: `import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const require = createRequire(import.meta.url);`,
};

const smokeLoaders = {
    cjs: { resolve: "require.resolve(specifier)", load: "require(specifier)" },
    mjs: {
        resolve: "fileURLToPath(import.meta.resolve(specifier))",
        load: "await import(specifier)",
    },
};

function smokeSource(kind) {
    const { resolve, load } = smokeLoaders[kind];

    return `${smokeImports[kind]}

const corePath = ${JSON.stringify(corePath)};

// Under Node, Core's Emscripten loader expects the CommonJS module-scope \`require\` and \`__dirname\`,
// so evaluate it inside the standard module wrapper and publish its namespace as a browser script would.
vm.runInThisContext(
    \`(function (require, __dirname) {\${readFileSync(corePath, "utf8")}
globalThis.Live2DCubismCore = Live2DCubismCore;
})\`,
    { filename: corePath },
)(require, dirname(corePath));

// The package targets browsers, where Core is a classic script whose namespace lands on \`window\`, and
// its runtime check reads \`window.Live2DCubismCore\` at import time. Alias \`window\` to the global object
// only after Core has loaded so Core keeps its Node branch; nothing else is faked because importing the
// package must not touch the DOM or WebGL.
globalThis.window = globalThis;

// Core also installs Emscripten process-level error hooks that would mask the real failure, so every
// entrypoint reports its own error and the process exits nonzero.
for (const [specifier, exportName, isModelClass] of ${JSON.stringify(entrypoints)}) {
    try {
        const resolved = ${resolve};

        assert.ok(
            resolved.includes(${JSON.stringify(installedPackageDir)}),
            \`resolved outside the installed package: \${resolved}\`,
        );

        const value = (${load})[exportName];

        assert.equal(typeof value, "function", \`must export class \${exportName}\`);

        if (isModelClass) {
            assert.equal(typeof value.from, "function", \`must export \${exportName}.from\`);
        }

        console.log(\`${kind}: \${specifier} -> \${resolved}\`);
    } catch (error) {
        console.error(\`${kind}: \${specifier} failed:\`, error);
        process.exitCode = 1;
    }
}
`;
}

function exec(command, args, cwd, stdout) {
    return execFileSync(command, args, {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", stdout, "inherit"],
        shell: process.platform === "win32",
    });
}

function main() {
    const tempRoot = mkdtempSync(join(tmpdir(), `${packageName}-package-`));

    try {
        const packDir = join(tempRoot, "pack");
        const consumerDir = join(tempRoot, "consumer");

        mkdirSync(packDir);
        mkdirSync(consumerDir);

        console.log(`Packing ${packageName}`);

        const packReport = JSON.parse(
            exec(
                "npm",
                ["pack", "--ignore-scripts", "--json", "--pack-destination", packDir],
                repoRoot,
                "pipe",
            ),
        );
        // npm 11 reports an array of packages; npm 12 keys the report by package name.
        const [{ filename }] = Array.isArray(packReport) ? packReport : Object.values(packReport);

        writeFileSync(
            join(consumerDir, "package.json"),
            JSON.stringify({ name: "package-consumer", private: true }, null, 4),
        );

        console.log(`Installing ${filename} with pixi.js@${pixiVersion}`);

        exec(
            "npm",
            [
                "install",
                "--ignore-scripts",
                "--no-audit",
                "--no-fund",
                "--package-lock=false",
                join(packDir, filename),
                `pixi.js@${pixiVersion}`,
            ],
            consumerDir,
            "inherit",
        );

        writeFileSync(join(consumerDir, "consumer.ts"), consumerSource);

        const checks = [
            [
                "declarations",
                [
                    tscPath,
                    "--noEmit",
                    "--incremental",
                    "false",
                    "--skipLibCheck",
                    "false",
                    "--moduleResolution",
                    "bundler",
                    "--module",
                    "esnext",
                    "--target",
                    "esnext",
                    "--lib",
                    "esnext,dom",
                    "consumer.ts",
                ],
            ],
        ];

        for (const kind of ["cjs", "mjs"]) {
            writeFileSync(join(consumerDir, `smoke.${kind}`), smokeSource(kind));
            checks.push([`${kind} entrypoints`, [`smoke.${kind}`]]);
        }

        // Run every check so one report shows all broken consumer paths.
        const failures = checks.flatMap(([name, args]) => {
            console.log(`Checking ${name}`);

            try {
                exec(process.execPath, args, consumerDir, "inherit");

                return [];
            } catch {
                return [name];
            }
        });

        if (failures.length) {
            throw new Error(`Package consumer check failed: ${failures.join(", ")}`);
        }

        console.log("Package consumer check passed");
    } finally {
        rmSync(tempRoot, { recursive: true, force: true });
    }
}

main();
