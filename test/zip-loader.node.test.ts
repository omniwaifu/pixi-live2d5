import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveObjectURL } from "node:buffer";
import { Live2DModel } from "../src/Live2DModel";
import { FileLoader, type ExtendedFileList } from "../src/factory/FileLoader";
import { Live2DLoader } from "../src/factory/Live2DLoader";
import { ZipLoader } from "../src/factory/ZipLoader";
import type { Live2DFactoryContext } from "../src/factory/Live2DFactory";
import { Cubism5ModelSettings } from "../src/cubism5/Cubism5ModelSettings";

describe("ZipLoader", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("assigns a unique synthetic object URL for each zip-backed model", async () => {
        const settingsA = { url: "A.model3.json" } as any;
        const settingsB = { url: "B.model3.json" } as any;

        const loadSpy = vi.spyOn(Live2DLoader, "load").mockResolvedValue(new Blob(["zip"]));
        const zipReaderSpy = vi.spyOn(ZipLoader, "zipReader").mockResolvedValue({});
        const createSettingsSpy = vi
            .spyOn(ZipLoader, "createSettings")
            .mockResolvedValueOnce(settingsA)
            .mockResolvedValueOnce(settingsB);
        const unzipSpy = vi.spyOn(ZipLoader, "unzip").mockResolvedValue([]);
        const releaseReaderSpy = vi.spyOn(ZipLoader, "releaseReader").mockImplementation(() => {});

        await ZipLoader.factory(
            { source: "https://example.com/a.zip", live2dModel: {} as any, options: {} as any },
            async () => {},
        );
        await ZipLoader.factory(
            { source: "https://example.com/b.zip", live2dModel: {} as any, options: {} as any },
            async () => {},
        );

        expect(settingsA._objectURL).not.toBe(settingsB._objectURL);

        loadSpy.mockRestore();
        zipReaderSpy.mockRestore();
        createSettingsSpy.mockRestore();
        unzipSpy.mockRestore();
        releaseReaderSpy.mockRestore();
    });

    it("releases a local archive URL and reader immediately after extraction", async () => {
        const file = new File(["zip"], "model.zip");
        const sourceURL = "blob:local-zip";
        const settings = { url: "model.model3.json" } as any;
        const files = [file] as File[] & { settings?: any };
        files.settings = settings;
        const reader = {};
        vi.spyOn(URL, "createObjectURL").mockReturnValue(sourceURL);
        const revokeSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
        vi.spyOn(ZipLoader, "zipReader").mockResolvedValue(reader);
        vi.spyOn(ZipLoader, "unzip").mockResolvedValue([]);
        const releaseSpy = vi.spyOn(ZipLoader, "releaseReader").mockImplementation(() => {});

        await ZipLoader.factory(
            { source: files, live2dModel: {} as any, options: {} as any },
            async () => {},
        );

        expect(releaseSpy).toHaveBeenCalledOnce();
        expect(releaseSpy).toHaveBeenCalledWith(reader);
        expect(revokeSpy).toHaveBeenCalledOnce();
        expect(revokeSpy).toHaveBeenCalledWith(sourceURL);
    });

    it("releases local archive resources while preserving an extraction error", async () => {
        const file = new File(["zip"], "model.zip");
        const sourceURL = "blob:failed-local-zip";
        const settings = { url: "model.model3.json" } as any;
        const files = [file] as File[] & { settings?: any };
        files.settings = settings;
        const reader = {};
        const error = new Error("unzip failed");
        vi.spyOn(URL, "createObjectURL").mockReturnValue(sourceURL);
        const revokeSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
        vi.spyOn(ZipLoader, "zipReader").mockResolvedValue(reader);
        vi.spyOn(ZipLoader, "unzip").mockRejectedValue(error);
        const releaseSpy = vi.spyOn(ZipLoader, "releaseReader").mockImplementation(() => {});

        await expect(
            ZipLoader.factory(
                { source: files, live2dModel: {} as any, options: {} as any },
                async () => {},
            ),
        ).rejects.toBe(error);

        expect(releaseSpy).toHaveBeenCalledWith(reader);
        expect(revokeSpy).toHaveBeenCalledWith(sourceURL);
    });

    it("preserves an extraction error if reader cleanup also fails", async () => {
        const file = new File(["zip"], "model.zip");
        const settings = { url: "model.model3.json" } as any;
        const files = [file] as File[] & { settings?: any };
        files.settings = settings;
        const extractionError = new Error("unzip failed");
        vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:failed-local-zip");
        vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
        vi.spyOn(ZipLoader, "zipReader").mockResolvedValue({});
        vi.spyOn(ZipLoader, "unzip").mockRejectedValue(extractionError);
        vi.spyOn(ZipLoader, "releaseReader").mockImplementation(() => {
            throw new Error("reader cleanup failed");
        });
        vi.spyOn(console, "warn").mockImplementation(() => {});

        await expect(
            ZipLoader.factory(
                { source: files, live2dModel: {} as any, options: {} as any },
                async () => {},
            ),
        ).rejects.toBe(extractionError);
    });

    it("does not revoke a remote archive URL", async () => {
        vi.spyOn(Live2DLoader, "load").mockResolvedValue(new Blob(["zip"]));
        vi.spyOn(ZipLoader, "zipReader").mockResolvedValue({});
        vi.spyOn(ZipLoader, "createSettings").mockResolvedValue({
            url: "model.model3.json",
        } as any);
        vi.spyOn(ZipLoader, "unzip").mockResolvedValue([]);
        vi.spyOn(ZipLoader, "releaseReader").mockImplementation(() => {});
        const revokeSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

        await ZipLoader.factory(
            {
                source: "https://example.com/model.zip",
                live2dModel: {} as any,
                options: {} as any,
            },
            async () => {},
        );

        expect(revokeSpy).not.toHaveBeenCalled();
    });

    it("extracts only defined entries by raw archive names and resolves them to their contents", async () => {
        const textures = ["tex[1].png", "100%.png", "a b.png"];
        const entries = [
            "model dir/m.model3.json",
            "model dir/m.moc3",
            ...textures.map((name) => `model dir/${name}`),
            "model dir/unused.png",
        ];
        const settings = new Cubism5ModelSettings({
            url: "model dir/m.model3.json",
            FileReferences: { Moc: "m.moc3", Textures: textures },
        });
        const reader = {};
        vi.spyOn(ZipLoader, "getFilePaths").mockResolvedValue(entries);
        vi.spyOn(ZipLoader, "getFiles").mockImplementation(async (_reader, paths) => {
            for (const path of paths) {
                if (!entries.includes(path)) throw new Error("No such entry: " + path);
            }
            return paths.map((path) => new File([`contents of ${path}`], path.split("/").pop()!));
        });

        const files = await ZipLoader.unzip(reader, settings);
        const extracted = await Promise.all(
            files.map(async (file) => [file.webkitRelativePath, await file.text()]),
        );

        expect(Object.fromEntries(extracted)).toEqual({
            "model dir/m.moc3": "contents of model dir/m.moc3",
            "model dir/tex[1].png": "contents of model dir/tex[1].png",
            "model dir/100%.png": "contents of model dir/100%.png",
            "model dir/a b.png": "contents of model dir/a b.png",
        });

        // hand the extracted files to FileLoader and read back what settings resolve to
        settings._objectURL = URL.createObjectURL(new Blob(["{}"]));
        (files as ExtendedFileList).settings = settings;
        const model = new Live2DModel({ autoUpdate: false, autoHitTest: false, autoFocus: false });
        const resolved: Record<string, string> = {};

        try {
            await FileLoader.factory(
                { source: files, live2dModel: model, options: {} } satisfies Live2DFactoryContext,
                async () => {
                    for (const file of ["m.moc3", ...textures]) {
                        const blob = resolveObjectURL(settings.resolveURL(file));
                        if (!blob) throw new Error("Object URL is not alive for " + file);
                        resolved[file] = await blob.text();
                    }
                },
            );
        } finally {
            model.destroy();
        }

        expect(resolved).toEqual({
            "m.moc3": "contents of model dir/m.moc3",
            "tex[1].png": "contents of model dir/tex[1].png",
            "100%.png": "contents of model dir/100%.png",
            "a b.png": "contents of model dir/a b.png",
        });
    });
});
