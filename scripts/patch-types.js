import { readFileSync, writeFileSync } from "fs";
import { dirname, relative, resolve, sep } from "path";

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

            let referencePath = relative(dirname(outputFile), referenceTarget).split(sep).join("/");

            if (!referencePath.startsWith(".")) {
                referencePath = `./${referencePath}`;
            }

            return [`/// <reference path="${referencePath}"/>`];
        })
        .filter((reference) => !output.includes(reference));

    if (references.length) {
        output = `${references.join("\n")}\n\n${output}`;
    }

    writeFileSync(outputFile, transform(output));
}
