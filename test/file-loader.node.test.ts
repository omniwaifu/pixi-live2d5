import { afterEach, describe, expect, it, vi } from "vitest";
import { Live2DModel } from "../src/Live2DModel";
import { FileLoader, type ExtendedFileList } from "../src/factory/FileLoader";
import { resolveObjectURL } from "node:buffer";
import { Cubism5ModelSettings } from "../src/cubism5/Cubism5ModelSettings";

describe("FileLoader cleanup", () => {
    afterEach(() => {
        vi.restoreAllMocks();
        for (const key of Object.keys(FileLoader.filesMap)) {
            delete FileLoader.filesMap[key];
        }
    });

    it("releases the settings URL when validation fails", async () => {
        const settingsURL = "blob:settings-validation";
        const settings = createSettings(settingsURL, [], () => {
            throw new Error("invalid upload");
        });
        const files = withSettings([uploadedFile("model3.json")], settings);
        const revokeSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

        await expect(FileLoader.factory(createContext(files), async () => {})).rejects.toThrow(
            "invalid upload",
        );

        expect(revokeSpy).toHaveBeenCalledOnce();
        expect(revokeSpy).toHaveBeenCalledWith(settingsURL);
        expect(FileLoader.filesMap[settingsURL]).toBeUndefined();
    });

    it("releases object URLs created before an upload error", async () => {
        const resourceURL = "blob:resource-a";
        const settings = createSettings("blob:settings-upload", ["a.bin", "b.bin"]);
        const files = [uploadedFile("a.bin"), uploadedFile("b.bin")];
        vi.spyOn(URL, "createObjectURL")
            .mockReturnValueOnce(resourceURL)
            .mockImplementationOnce(() => {
                throw new Error("URL allocation failed");
            });
        const revokeSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

        await expect(FileLoader.upload(files, settings)).rejects.toThrow("URL allocation failed");

        expect(revokeSpy).toHaveBeenCalledOnce();
        expect(revokeSpy).toHaveBeenCalledWith(resourceURL);
        expect(FileLoader.filesMap[settings._objectURL!]).toBeUndefined();
    });

    it("rolls back uploaded URLs when a downstream middleware fails", async () => {
        const settingsURL = "blob:settings-downstream";
        const resourceURL = "blob:resource-downstream";
        const settings = createSettings(settingsURL, ["texture.png"]);
        const files = withSettings([uploadedFile("texture.png")], settings);
        const model = createModel();
        vi.spyOn(URL, "createObjectURL").mockReturnValue(resourceURL);
        const revokeSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
        const error = new Error("model creation failed");

        await expect(
            FileLoader.factory(createContext(files, model), async () => {
                throw error;
            }),
        ).rejects.toBe(error);

        expect(revokeSpy.mock.calls.map(([url]) => url)).toEqual([settingsURL, resourceURL]);
        expect(FileLoader.filesMap[settingsURL]).toBeUndefined();

        model.destroy();
        expect(revokeSpy).toHaveBeenCalledTimes(2);
    });

    it("retains uploaded URLs until model destruction and cleans them once", async () => {
        const settingsURL = "blob:settings-success";
        const resourceURL = "blob:resource-success";
        const settings = createSettings(settingsURL, ["texture.png"]);
        const files = withSettings([uploadedFile("texture.png")], settings);
        const model = createModel();
        vi.spyOn(URL, "createObjectURL").mockReturnValue(resourceURL);
        const revokeSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

        await FileLoader.factory(createContext(files, model), async () => {});

        expect(FileLoader.filesMap[settingsURL]).toEqual({ "texture.png": resourceURL });
        expect(revokeSpy).not.toHaveBeenCalled();

        model.destroy();

        expect(revokeSpy.mock.calls.map(([url]) => url)).toEqual([settingsURL, resourceURL]);
        expect(FileLoader.filesMap[settingsURL]).toBeUndefined();
    });
});

describe("FileLoader path matching", () => {
    const modelDir = "model dir";
    const textures = ["tex[1].png", "100%.png", "a b.png"];

    afterEach(() => {
        vi.restoreAllMocks();
        for (const key of Object.keys(FileLoader.filesMap)) {
            delete FileLoader.filesMap[key];
        }
    });

    it("resolves essential files whose names need URL escaping to their own contents", async () => {
        const settings = createModelSettings(textures);
        const files = withSettings(
            [
                uploadedFile(`${modelDir}/m.moc3`, "moc"),
                ...textures.map((name) => uploadedFile(`${modelDir}/${name}`, `texture:${name}`)),
                uploadedFile(`${modelDir}/unused.png`, "unused"),
            ],
            settings,
        );
        const model = createModel();
        const resolvedContents: Record<string, string> = {};

        await FileLoader.factory(createContext(files, model), async () => {
            for (const file of ["m.moc3", ...textures]) {
                resolvedContents[file] = await readObjectURL(settings.resolveURL(file));
            }
        });

        expect(resolvedContents).toEqual({
            "m.moc3": "moc",
            "tex[1].png": "texture:tex[1].png",
            "100%.png": "texture:100%.png",
            "a b.png": "texture:a b.png",
        });
        expect(Object.keys(FileLoader.filesMap[settings._objectURL!]!).sort()).toEqual(
            ["m.moc3", ...textures].sort(),
        );

        model.destroy();
    });

    it("still rejects and releases URLs when an escaped essential file is missing", async () => {
        const settings = createModelSettings(textures);
        const files = withSettings(
            [
                uploadedFile(`${modelDir}/m.moc3`, "moc"),
                uploadedFile(`${modelDir}/tex[1].png`, "texture"),
                uploadedFile(`${modelDir}/a b.png`, "texture"),
            ],
            settings,
        );
        const revokeSpy = vi.spyOn(URL, "revokeObjectURL");

        await expect(FileLoader.factory(createContext(files), async () => {})).rejects.toThrow(
            `File "100%.png" is defined in settings, but doesn't exist in given files`,
        );

        expect(revokeSpy).toHaveBeenCalledWith(settings._objectURL);
        expect(FileLoader.filesMap[settings._objectURL!]).toBeUndefined();
    });

    function createModelSettings(textureFiles: string[]): Cubism5ModelSettings {
        const settings = new Cubism5ModelSettings({
            url: `${modelDir}/m.model3.json`,
            FileReferences: { Moc: "m.moc3", Textures: textureFiles },
        });

        settings._objectURL = URL.createObjectURL(new Blob(["{}"]));

        return settings;
    }

    async function readObjectURL(url: string): Promise<string> {
        const blob = resolveObjectURL(url);

        if (!blob) throw new Error("Object URL is not alive: " + url);

        return blob.text();
    }
});

function uploadedFile(path: string, contents = "data"): File {
    const file = new File([contents], path);
    Object.defineProperty(file, "webkitRelativePath", { value: path });
    return file;
}

function withSettings(files: File[], settings: any): ExtendedFileList {
    const extended = files as ExtendedFileList;
    extended.settings = settings;
    return extended;
}

function createSettings(
    objectURL: string,
    definedFiles: string[],
    validateFiles: (files: string[]) => void = () => {},
): any {
    return {
        url: "model3.json",
        _objectURL: objectURL,
        validateFiles,
        getDefinedFiles: () => definedFiles,
    };
}

function createModel(): Live2DModel {
    return new Live2DModel({
        autoUpdate: false,
        autoHitTest: false,
        autoFocus: false,
    });
}

function createContext(source: ExtendedFileList, live2dModel = createModel()): any {
    return { source, live2dModel, options: {} };
}
