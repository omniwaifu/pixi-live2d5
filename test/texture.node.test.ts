import { Assets } from "pixi.js";
import { describe, expect, it, vi } from "vitest";
import { createTexture } from "../src/factory/texture";

describe("createTexture", () => {
    it("restores Pixi crossOrigin preferences after each load", async () => {
        const parser = { config: { crossOrigin: "anonymous" } };
        const originalParsers = (Assets.loader as any).parsers;
        const originalLoad = Assets.load;

        (Assets.loader as any).parsers = [parser];
        Assets.load = vi.fn().mockImplementation(async () => {
            expect(parser.config.crossOrigin).toBe("use-credentials");

            return { tag: "texture" };
        }) as any;

        await createTexture("https://example.com/texture.png", {
            crossOrigin: "use-credentials",
        });

        expect(parser.config.crossOrigin).toBe("anonymous");

        (Assets.loader as any).parsers = originalParsers;
        Assets.load = originalLoad;
    });
});
