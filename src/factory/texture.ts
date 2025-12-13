import { Assets, Texture } from "pixi.js";

let configuredCrossOrigin: string | undefined;

export function createTexture(
    url: string,
    options: { crossOrigin?: string } = {},
): Promise<Texture> {
    // PixiJS v8 uses the Assets system for loading.
    // Note: crossOrigin is a global preference in Pixi v8; we set it only when explicitly provided.
    if (options.crossOrigin !== undefined && options.crossOrigin !== configuredCrossOrigin) {
        Assets.setPreferences({ crossOrigin: options.crossOrigin } as any);
        configuredCrossOrigin = options.crossOrigin;
    }

    return Assets.load(url);
}
