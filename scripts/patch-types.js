import { copyFileSync, existsSync, readFileSync, writeFileSync } from "fs";
import { basename, dirname, resolve, sep } from "path";

const declarations = [
    {
        entryFile: resolve("src/common.ts"),
        outputFile: resolve("types/index.d.ts"),
        transform(content) {
            // correct the declaration merging
            return content.replace(
                "export declare interface Live2DMotion",
                "declare interface Live2DMotion",
            );
        },
    },
    {
        entryFile: resolve("src/extra.ts"),
        outputFile: resolve("types/extra.d.ts"),
        transform(content) {
            return content;
        },
    },
];

for (const { entryFile, outputFile, transform } of declarations) {
    console.log("Patching types for", outputFile);

    let output = readFileSync(outputFile, "utf8");
    const references = readFileSync(entryFile, "utf8")
        .split(/\r?\n/)
        .flatMap((line) => {
            const match = line.match(/^\/\/\/ <reference path=["'](.+)["']\s*\/>$/);

            if (!match) {
                return [];
            }

            const referenceTarget = resolve(dirname(entryFile), match[1]);

            // Source-local declarations are compilation inputs, not public declaration
            // dependencies. Only preserve references to external Core declarations.
            if (!referenceTarget.startsWith(`${resolve("core")}${sep}`)) {
                return [];
            }

            if (!existsSync(referenceTarget)) {
                throw new Error(
                    `Missing Core declaration ${referenceTarget}; run \`bun run setup\` first.`,
                );
            }

            // Published declarations must be self-contained, so ship the Core declaration
            // unmodified next to the output instead of referencing the unpublished core/ folder.
            const referenceFile = basename(referenceTarget);

            copyFileSync(referenceTarget, resolve(dirname(outputFile), referenceFile));

            return [`/// <reference path="./${referenceFile}"/>`];
        })
        .filter((reference) => !output.includes(reference));

    if (references.length) {
        output = `${references.join("\n")}\n\n${output}`;
    }

    writeFileSync(outputFile, transform(output));
}
