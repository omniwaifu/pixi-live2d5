import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "fs";
import { createHash } from "crypto";
import JSZip from "jszip";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const overwriteExisting = true;
const __dirname = dirname(fileURLToPath(import.meta.url));
const coreDir = resolve(__dirname, "../core") + "/";
const shaderDir = resolve(__dirname, "../public/cubism5/shaders") + "/";
const cubismVersion = "5-r.5";
// Locally observed for reproducibility; Live2D does not publish this archive checksum.
const cubismArchiveSha256 = "67064a7fb1812cf502f5c4a03bfe12cc638c75a621bb4acf06bb28763df06ba0";
const shaderFiles = [
    "fragshadersrcalphablend.frag",
    "fragshadersrccolorblend.frag",
    "fragshadersrccopy.frag",
    "fragshadersrcmaskinvertedpremultipliedalpha.frag",
    "fragshadersrcmaskpremultipliedalpha.frag",
    "fragshadersrcpremultipliedalpha.frag",
    "fragshadersrcpremultipliedalphablend.frag",
    "fragshadersrcsetupmask.frag",
    "vertshadersrc.vert",
    "vertshadersrcblend.vert",
    "vertshadersrccopy.vert",
    "vertshadersrcmasked.vert",
    "vertshadersrcsetupmask.vert",
];

const assets = [
    {
        url: `https://cubism.live2d.com/sdk-web/bin/CubismSdkForWeb-${cubismVersion}.zip`,
        sha256: cubismArchiveSha256,
        zipEntries: [
            {
                entryFile: `CubismSdkForWeb-${cubismVersion}/Core/live2dcubismcore.js`,
                outputFile: coreDir + "live2dcubismcore.js",
            },
            {
                entryFile: `CubismSdkForWeb-${cubismVersion}/Core/live2dcubismcore.d.ts`,
                outputFile: coreDir + "live2dcubismcore.d.ts",
            },
            ...shaderFiles.map((file) => ({
                entryFile: `CubismSdkForWeb-${cubismVersion}/Framework/Shaders/WebGL/${file}`,
                outputFile: shaderDir + file,
            })),
        ],
    },
];

async function main() {
    for (const asset of assets) {
        await download(asset);
    }
    console.log("Done");
}

async function download({ url, file, zipEntries, sha256 }) {
    console.log("Downloading", url);

    if (file) {
        if (!overwriteExisting && existsSync(file)) {
            console.log("Skip existing", file);
            return;
        }

        const dir = dirname(file);

        if (!existsSync(dir)) {
            console.log("Create dir ", dir);

            mkdirSync(dir);
        }
    }

    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(
            `Failed to download ${url}: HTTP ${response.status} ${response.statusText}`,
        );
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (!buffer.length) {
        throw new Error("got empty response from " + url);
    }

    if (sha256) {
        const actualSha256 = createHash("sha256").update(buffer).digest("hex");

        if (actualSha256 !== sha256) {
            throw new Error(`SHA-256 mismatch for ${url}: expected ${sha256}, got ${actualSha256}`);
        }
    }

    if (file) {
        writeFileSync(file, buffer);
        console.log("Downloaded to", file);
    } else if (zipEntries) {
        await unzip(zipEntries, buffer);
    }
}

async function unzip(zipEntries, buffer) {
    const zip = await JSZip.loadAsync(buffer);
    const extracted = [];

    for (const { entryFile, outputFile } of zipEntries) {
        if (!overwriteExisting && existsSync(outputFile)) {
            console.log("Skip existing", outputFile);
            continue;
        }

        let zipFile;

        if (typeof entryFile === "string") {
            zipFile = zip.file(entryFile);

            if (!zipFile) {
                throw new Error(`No zip entry found for ${entryFile}`);
            }
        } else {
            const zipFiles = zip.file(entryFile);

            if (zipFiles.length === 0) {
                throw new Error(`No zip entry found for ${entryFile}`);
            }

            if (zipFiles.length > 1) {
                console.error(
                    `Multiple zip entries found for ${entryFile}, only the first one will be used`,
                );
                zipFiles.forEach((f) => console.error(`> ${f.name}`));
            }

            zipFile = zipFiles[0];
        }

        extracted.push({
            outputFile,
            data: await zipFile.async("nodebuffer"),
        });
    }

    // Validate and extract every entry before changing any destination. Stage alongside each
    // output so the final rename stays on the same filesystem, and roll back the whole set if a
    // commit rename fails.
    const token = `${process.pid}-${Date.now()}`;
    const staged = extracted.map(({ outputFile, data }, index) => ({
        outputFile,
        data,
        tempFile: `${outputFile}.tmp-${token}-${index}`,
        backupFile: `${outputFile}.bak-${token}-${index}`,
        hadOriginal: existsSync(outputFile),
        committed: false,
    }));

    try {
        for (const item of staged) {
            mkdirSync(dirname(item.outputFile), { recursive: true });
            writeFileSync(item.tempFile, item.data);
        }

        for (const item of staged) {
            console.log("Extracting ", item.outputFile);
            if (item.hadOriginal) renameSync(item.outputFile, item.backupFile);
            renameSync(item.tempFile, item.outputFile);
            item.committed = true;
        }

        for (const item of staged) {
            if (item.hadOriginal) rmSync(item.backupFile, { force: true });
        }
    } catch (error) {
        for (const item of [...staged].reverse()) {
            if (item.committed) rmSync(item.outputFile, { force: true });
            if (item.hadOriginal && existsSync(item.backupFile)) {
                renameSync(item.backupFile, item.outputFile);
            }
        }

        throw error;
    } finally {
        for (const item of staged) {
            rmSync(item.tempFile, { force: true });
            rmSync(item.backupFile, { force: true });
        }
    }
}

main().then();
