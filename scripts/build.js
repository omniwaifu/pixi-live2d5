import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { build } from "vite";
import { existsSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));

const entries = [
    { entry: "src/csm5.ts", name: "cubism5" },
    { entry: "src/index.ts", name: "index" },
    { entry: "src/extra.ts", name: "extra" },
];

const profiles = entries
    .filter(({ entry }) => existsSync(resolve(__dirname, "..", entry)))
    .flatMap(({ entry, name }) =>
        [false, true].map((minify) => ({
            build: {
                emptyOutDir: false,
                minify: minify && "terser",
                lib: {
                    formats: minify ? ["umd"] : ["es", "cjs", "umd"],
                    entry: resolve(__dirname, "..", entry),
                    fileName: (format) =>
                        format === "cjs"
                            ? `${name}.cjs`
                            : `${name}${format === "umd" ? (minify ? ".min" : "") : "." + format}.js`,
                },
            },
        })),
    );

async function main() {
    for (const profile of profiles) {
        console.log("\n" + `Building profile: ${profile.build.lib.fileName("umd")}`);

        await build(profile);
    }
}

main();
