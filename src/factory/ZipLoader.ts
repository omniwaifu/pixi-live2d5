import type { ModelSettings } from "@/cubism-common";
import type { Live2DFactoryContext } from "@/factory/Live2DFactory";
import type { Live2DFactory } from "@/factory/Live2DFactory";
import { Live2DLoader } from "@/factory/Live2DLoader";
import { logger } from "@/utils";
import { resolveUrl } from "@/utils/url";
import type { Middleware } from "@/utils/middleware";
import type { ExtendedFileList } from "./FileLoader";

type ZipReader = any;

/**
 * Experimental loader to load resources from a zip file.
 *
 * Though named as a "Loader", this class has nothing to do with Live2DLoader,
 * it only contains a middleware for the Live2DFactory.
 */
export class ZipLoader {
    // will be set by Live2DFactory
    private static live2dFactory: typeof Live2DFactory;

    static ZIP_PROTOCOL = "zip://";
    static uid = 0;

    static factory: Middleware<Live2DFactoryContext> = async (context, next) => {
        const source = context.source;

        let sourceURL: string;
        let zipBlob: Blob | undefined;
        let settings: ModelSettings | undefined;
        let localSourceURL = false;

        if (
            typeof source === "string" &&
            (source.endsWith(".zip") || source.startsWith(ZipLoader.ZIP_PROTOCOL))
        ) {
            if (source.startsWith(ZipLoader.ZIP_PROTOCOL)) {
                sourceURL = source.slice(ZipLoader.ZIP_PROTOCOL.length);
            } else {
                sourceURL = source;
            }

            zipBlob = await Live2DLoader.load({
                url: sourceURL,
                type: "blob",
                target: context.live2dModel,
            });
        } else if (
            Array.isArray(source) &&
            source.length === 1 &&
            source[0] instanceof File &&
            source[0].name.endsWith(".zip")
        ) {
            zipBlob = source[0];

            sourceURL = URL.createObjectURL(zipBlob);
            localSourceURL = true;

            settings = (source as ExtendedFileList).settings;
        }

        if (zipBlob) {
            let reader: ZipReader | undefined;
            let primaryError: unknown;
            let primaryFailed = false;
            let cleanupError: unknown;
            let cleanupFailed = false;

            try {
                if (!zipBlob.size) {
                    throw new Error("Empty zip file");
                }

                reader = await ZipLoader.zipReader(zipBlob, sourceURL!);

                if (!settings) {
                    settings = await ZipLoader.createSettings(reader);
                }

                // a fake URL, the only requirement is it should be unique,
                // as FileLoader will use it as the ID of all uploaded files
                settings._objectURL = ZipLoader.ZIP_PROTOCOL + ZipLoader.uid++ + "/" + settings.url;

                const files = await ZipLoader.unzip(reader, settings);

                (files as ExtendedFileList).settings = settings;

                // pass files to the FileLoader
                context.source = files;
            } catch (error) {
                primaryError = error;
                primaryFailed = true;
            } finally {
                try {
                    if (reader) ZipLoader.releaseReader(reader);
                } catch (error) {
                    cleanupError = error;
                    cleanupFailed = true;
                    if (primaryFailed) {
                        logger.warn("ZipLoader", "Failed to release ZIP reader.", error);
                    }
                } finally {
                    if (localSourceURL) URL.revokeObjectURL(sourceURL!);
                }
            }

            if (primaryFailed) throw primaryError;
            if (cleanupFailed) throw cleanupError;
        }

        return next();
    };

    static async unzip(reader: ZipReader, settings: ModelSettings): Promise<File[]> {
        const filePaths = await ZipLoader.getFilePaths(reader);

        const requiredFilePaths: string[] = [];

        // only consume the files defined in settings
        for (const definedFile of settings.getDefinedFiles()) {
            const actualPath = decodeURI(resolveUrl(settings.url, definedFile));

            if (filePaths.includes(actualPath)) {
                requiredFilePaths.push(actualPath);
            }
        }

        const files = await ZipLoader.getFiles(reader, requiredFilePaths);

        for (let i = 0; i < files.length; i++) {
            const path = requiredFilePaths[i]!;
            const file = files[i]!;

            // let's borrow this property...
            Object.defineProperty(file, "webkitRelativePath", {
                value: path,
            });
        }

        return files;
    }

    static async createSettings(reader: ZipReader): Promise<ModelSettings> {
        const filePaths = await ZipLoader.getFilePaths(reader);

        const settingsFilePath = filePaths.find(
            (path) => path.endsWith("model.json") || path.endsWith("model3.json"),
        );

        if (!settingsFilePath) {
            throw new Error("Settings file not found");
        }

        const settingsText = await ZipLoader.readText(reader, settingsFilePath);

        if (!settingsText) {
            throw new Error("Empty settings file: " + settingsFilePath);
        }

        const settingsJSON = JSON.parse(settingsText);

        settingsJSON.url = settingsFilePath;

        const runtime = ZipLoader.live2dFactory.findRuntime(settingsJSON);

        if (!runtime) {
            throw new Error("Unknown settings JSON");
        }

        return runtime.createModelSettings(settingsJSON);
    }

    static async zipReader(data: Blob, url: string): Promise<ZipReader> {
        throw new Error("Not implemented");
    }

    static async getFilePaths(reader: ZipReader): Promise<string[]> {
        throw new Error("Not implemented");
    }

    static async getFiles(reader: ZipReader, paths: string[]): Promise<File[]> {
        throw new Error("Not implemented");
    }

    static async readText(reader: ZipReader, path: string): Promise<string> {
        throw new Error("Not implemented");
    }

    static releaseReader(reader: ZipReader) {
        // this method is optional
    }
}
