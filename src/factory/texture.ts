import { Assets, type Texture } from "pixi.js";

let textureLoadQueue = Promise.resolve();

export function createTexture(
    url: string,
    options: { crossOrigin?: string } = {},
): Promise<Texture> {
    const loadTexture = async () => {
        const parsersWithCrossOrigin = ((Assets.loader as any)?.parsers ?? []).filter(
            (parser: any) => parser?.config && "crossOrigin" in parser.config,
        );
        const previousCrossOrigins = parsersWithCrossOrigin.map((parser: any) => ({
            parser,
            crossOrigin: parser.config.crossOrigin,
        }));

        if (options.crossOrigin !== undefined) {
            Assets.setPreferences({ crossOrigin: options.crossOrigin } as any);
        }

        try {
            // Force the texture parser: extensionless URLs (e.g. Blob URLs) can't be inferred.
            return await Assets.load<Texture>({ src: url, parser: "texture" });
        } finally {
            previousCrossOrigins.forEach(({ parser, crossOrigin }) => {
                parser.config.crossOrigin = crossOrigin;
            });
        }
    };

    // PixiJS v8 exposes crossOrigin as a global parser preference. Queue texture loads so
    // per-model overrides do not leak into unrelated asset loads in the host app.
    const queuedLoad = textureLoadQueue.then(loadTexture, loadTexture);

    textureLoadQueue = queuedLoad.then(
        () => undefined,
        () => undefined,
    );

    return queuedLoad;
}
