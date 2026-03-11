import { spawnSync } from "node:child_process";

main();

function run(command, args) {
    const result = spawnSync(command, args, {
        stdio: "inherit",
        shell: process.platform === "win32",
    });

    if (result.status !== 0) {
        throw new Error(`Command failed: ${command} ${args.join(" ")}`);
    }
}

function main() {
    run("mkdocs", ["build", "-f", "docs/mkdocs.yml"]);
    run("typedoc", [
        "src/index.ts",
        "--readme",
        "docs/docs/api_index.md",
        "--tsconfig",
        "tsconfig.docs.json",
        "--includeVersion",
        "--excludePrivate",
        "--excludeExternals",
        "--excludeReferences",
        "--excludeNotDocumented",
        "--out",
        "site/api",
    ]);
}
