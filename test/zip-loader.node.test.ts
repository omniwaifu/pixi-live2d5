import { describe, expect, it, vi } from "vitest";
import { Live2DLoader } from "../src/factory/Live2DLoader";
import { ZipLoader } from "../src/factory/ZipLoader";

describe("ZipLoader", () => {
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
});
