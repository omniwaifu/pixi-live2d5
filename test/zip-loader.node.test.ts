import { afterEach, describe, expect, it, vi } from "vitest";
import { Live2DLoader } from "../src/factory/Live2DLoader";
import { ZipLoader } from "../src/factory/ZipLoader";

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
});
