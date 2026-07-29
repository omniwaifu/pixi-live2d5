import "./load-cores";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Application, Point, Sprite, Texture, Ticker } from "pixi.js";
import * as PIXI from "pixi.js";
import { CubismWebGLOffscreenManager } from "@cubism/rendering/cubismoffscreenmanager";
import {
    CUBISM5_SHADER_FILES,
    releaseCubism5Context,
    retainCubism5Context,
} from "../src/cubism5/Cubism5ShaderLoader";

const SHADER_PATH = "/cubism5/shaders/";
const MODEL_URL = "/test/assets/Mao/Mao.model3.json";
const WEBGL2_ERROR =
    "Cubism SDK for Web R5 requires WebGL 2; the active Pixi renderer is using WebGL 1.";

describe("Cubism 5 browser smoke", () => {
    let app: Application;
    let config: typeof import("../src/config").config;
    let Live2DModel: typeof import("../src").Live2DModel;
    let HitAreaFrames: typeof import("../src/extra").HitAreaFrames;

    beforeEach(async () => {
        document.body.innerHTML = "";
        (window as any).PIXI = PIXI;

        ({ config } = await import("../src/config"));
        ({ Live2DModel } = await import("../src"));
        ({ HitAreaFrames } = await import("../src/extra"));

        config.sound = false;
        config.cubism5ShaderPath = SHADER_PATH;
        Live2DModel.registerTicker(Ticker);

        app = await createApplication(960, 720, 2);
        document.body.appendChild(app.canvas);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        app?.destroy(true);
        document.body.innerHTML = "";
    });

    it("loads every R5 shader and renders Mao pixels through the public path", async () => {
        expect((app.renderer as any).context.webGLVersion).toBe(2);

        app.render();
        const backgroundPixels = readFramebuffer(app);
        const model = await createMaoModel();
        const shaderResponses: { file: string; status: number }[] = [];
        const nativeFetch = globalThis.fetch.bind(globalThis);

        vi.spyOn(globalThis, "fetch").mockImplementation(async (...args) => {
            const response = await nativeFetch(...args);
            const url = new URL(getFetchURL(args[0]), location.href);

            if (url.pathname.startsWith(SHADER_PATH)) {
                shaderResponses.push({
                    file: url.pathname.slice(SHADER_PATH.length),
                    status: response.status,
                });
            }

            return response;
        });

        const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

        app.stage.addChild(model);
        await startAndWaitForShaders(model);
        app.render();

        const renderedPixels = readFramebuffer(app);
        const requestedFiles = [...new Set(shaderResponses.map(({ file }) => file))].sort();

        expect(requestedFiles).toEqual([...CUBISM5_SHADER_FILES].sort());
        expect(shaderResponses.length).toBeGreaterThanOrEqual(CUBISM5_SHADER_FILES.length);
        expect(shaderResponses.every(({ status }) => status === 200)).toBe(true);
        expect(model.internalModel.shaderState).toBe("ready");
        expect(changedPixelCount(backgroundPixels, renderedPixels)).toBeGreaterThan(1_000);

        const shaderDiagnostics = [
            ...logSpy.mock.calls,
            ...warnSpy.mock.calls,
            ...errorSpy.mock.calls,
        ]
            .flat()
            .map(String)
            .join("\n");

        expect(shaderDiagnostics).not.toMatch(
            /Shader program is not initialized|shader compile|Failed to load shaders|Error loading .* shader/i,
        );

        expect(Object.keys(model.internalModel.hitAreas)).toEqual(["Head", "Body"]);
        expect(await model.expression()).toBe(true);
        expect(await model.motion("TapBody", 0)).toBe(true);

        model.focus(model.x + model.width, model.y + model.height * 0.4, true);
        expect(model.internalModel.focusController.targetX).toBeGreaterThan(0);
    });

    it("surfaces shader HTTP failures with the failing URL and status", async () => {
        const nativeFetch = globalThis.fetch.bind(globalThis);
        const failedFile = CUBISM5_SHADER_FILES[0];

        vi.spyOn(globalThis, "fetch").mockImplementation(async (...args) => {
            const url = new URL(getFetchURL(args[0]), location.href);

            if (url.pathname === SHADER_PATH + failedFile) {
                return new Response("missing", { status: 404, statusText: "Not Found" });
            }

            return nativeFetch(...args);
        });

        const model = await createMaoModel();
        app.stage.addChild(model);
        app.render();

        await expect(model.internalModel.shaderReady).rejects.toThrow(
            new RegExp(`${failedFile}.*HTTP 404`),
        );
        expect(model.internalModel.shaderState).toBe("error");
        expect(() => app.render()).toThrow(new RegExp(`${failedFile}.*HTTP 404`));
    });

    it("surfaces R5 shader compilation failures instead of accepting a blank model", async () => {
        const nativeFetch = globalThis.fetch.bind(globalThis);
        const failedFile = "vertshadersrc.vert";

        vi.spyOn(console, "error").mockImplementation(() => {});
        vi.spyOn(globalThis, "fetch").mockImplementation(async (...args) => {
            const url = new URL(getFetchURL(args[0]), location.href);

            if (url.pathname === SHADER_PATH + failedFile) {
                return new Response("this is not valid GLSL", { status: 200 });
            }

            return nativeFetch(...args);
        });

        const model = await createMaoModel();
        app.stage.addChild(model);
        app.render();

        await expect(model.internalModel.shaderReady).rejects.toThrow(/shader compilation/i);
        expect(model.internalModel.shaderState).toBe("error");
        expect(() => app.render()).toThrow(/shader compilation/i);
    });

    it("rolls back a synchronous setup error and retries after configuration is fixed", async () => {
        const model = await createMaoModel();
        app.stage.addChild(model);
        config.cubism5ShaderPath = "";

        expect(() => app.render()).toThrow(/cubism5ShaderPath must be a non-empty/i);
        expect(model.internalModel.shaderState).toBe("error");
        expect(model.internalModel.renderer).toBeUndefined();

        config.cubism5ShaderPath = SHADER_PATH;
        expect(() => app.render()).not.toThrow();
        await expect(model.internalModel.shaderReady).resolves.toBeUndefined();
        expect(model.internalModel.shaderState).toBe("ready");
    });

    it("reuses compiled shaders for a later model when shader assets are offline", async () => {
        const first = await createMaoModel();
        app.stage.addChild(first);
        await startAndWaitForShaders(first);

        const nativeFetch = globalThis.fetch.bind(globalThis);
        let shaderFetches = 0;

        vi.spyOn(globalThis, "fetch").mockImplementation(async (...args) => {
            const url = new URL(getFetchURL(args[0]), location.href);

            if (url.pathname.startsWith(SHADER_PATH)) {
                shaderFetches++;
                throw new Error("shader server is offline");
            }

            return nativeFetch(...args);
        });

        const second = await createMaoModel();
        second.x = 340;
        app.stage.addChild(second);
        app.render();

        await expect(second.internalModel.shaderReady).resolves.toBeUndefined();
        expect(second.internalModel.shaderState).toBe("ready");
        expect(first.internalModel.shaderState).toBe("ready");
        expect(shaderFetches).toBe(0);
    });

    it("recreates shared offscreen targets after one same-context model is released", () => {
        const gl = (app.renderer as any).gl as WebGL2RenderingContext;
        const manager = CubismWebGLOffscreenManager.getInstance();

        retainCubism5Context(gl);
        retainCubism5Context(gl);

        try {
            const original = manager.getOffscreenRenderTargetContainers(gl, 16, 16, null!);
            const originalTexture = original.getColorBuffer();
            const originalFramebuffer = original.getRenderTexture();

            expect(gl.isTexture(originalTexture)).toBe(true);
            expect(gl.isFramebuffer(originalFramebuffer)).toBe(true);

            releaseCubism5Context(gl);

            expect(gl.isTexture(originalTexture)).toBe(false);
            expect(gl.isFramebuffer(originalFramebuffer)).toBe(false);
            expect(manager.getContainerSize(gl)).toBe(0);

            const replacement = manager.getOffscreenRenderTargetContainers(gl, 16, 16, null!);

            expect(replacement.getColorBuffer()).not.toBe(originalTexture);
            expect(replacement.getRenderTexture()).not.toBe(originalFramebuffer);
            expect(gl.isTexture(replacement.getColorBuffer())).toBe(true);
            expect(gl.isFramebuffer(replacement.getRenderTexture())).toBe(true);
            expect(gl.getError()).toBe(gl.NO_ERROR);
        } finally {
            releaseCubism5Context(gl);
        }
    });

    it("restores Pixi's FBO during the first shader-gated render", async () => {
        const before = marker(0xff0000, 10, 10);
        const after = marker(0x00ff00, 452, 10);
        const model = await createMaoModel();
        const renderTarget = PIXI.RenderTexture.create({ width: 512, height: 320, dynamic: true });

        app.stage.addChild(before, model, after);

        // The first-ever render constructs R5's renderer but cannot draw until async shaders load.
        app.renderer.render({ container: app.stage, target: renderTarget, clear: true });
        const firstFrame = app.renderer.extract.pixels(renderTarget);

        expect(readExtractedPixel(firstFrame, 30, 30)).toEqual([255, 0, 0, 255]);
        expect(readExtractedPixel(firstFrame, 472, 30)).toEqual([0, 255, 0, 255]);

        await expect(model.internalModel.shaderReady).resolves.toBeUndefined();

        model.visible = false;
        app.renderer.render({ container: app.stage, target: renderTarget, clear: true });
        const withoutModel = app.renderer.extract.pixels(renderTarget);
        model.visible = true;
        app.renderer.render({ container: app.stage, target: renderTarget, clear: true });
        const withModel = app.renderer.extract.pixels(renderTarget);

        expect(changedPixelCount(withoutModel.pixels, withModel.pixels)).toBeGreaterThan(1_000);
        renderTarget.destroy(true);
    });

    it("preserves Pixi state through an FBO, resize, and real context restoration", async () => {
        const before = marker(0xff0000, 10, 10);
        const after = marker(0x00ff00, 900, 10);
        const model = await createMaoModel();

        app.stage.addChild(before, model, after);
        await startAndWaitForShaders(model);
        app.render();

        expect(readCanvasPixel(app, 30, 30)).toEqual([255, 0, 0, 255]);
        expect(readCanvasPixel(app, 920, 30)).toEqual([0, 255, 0, 255]);

        const renderTarget = PIXI.RenderTexture.create({ width: 512, height: 320, dynamic: true });
        after.x = 452;

        model.visible = false;
        app.renderer.render({ container: app.stage, target: renderTarget, clear: true });
        const targetWithoutModel = app.renderer.extract.pixels(renderTarget);

        model.visible = true;
        app.renderer.render({ container: app.stage, target: renderTarget, clear: true });

        const targetPixels = app.renderer.extract.pixels(renderTarget);
        expect(readExtractedPixel(targetPixels, 30, 30)).toEqual([255, 0, 0, 255]);
        expect(readExtractedPixel(targetPixels, 472, 30)).toEqual([0, 255, 0, 255]);
        expect(changedPixelCount(targetWithoutModel.pixels, targetPixels.pixels)).toBeGreaterThan(
            1_000,
        );
        expect(model.internalModel.viewport).toEqual([0, 0, 512, 320]);
        renderTarget.destroy(true);

        app.renderer.resize(640, 360);
        after.x = 580;
        app.render();

        expect(model.internalModel.viewport).toEqual([0, 0, 640, 360]);
        expect(readCanvasPixel(app, 30, 30)).toEqual([255, 0, 0, 255]);
        expect(readCanvasPixel(app, 600, 30)).toEqual([0, 255, 0, 255]);

        const second = await createMaoModel();
        second.x = 340;
        app.stage.addChild(second);
        app.render();
        await expect(second.internalModel.shaderReady).resolves.toBeUndefined();

        const gl = (app.renderer as any).gl as WebGL2RenderingContext;
        const loseContext = gl.getExtension("WEBGL_lose_context");
        const originalShaderReady = model.internalModel.shaderReady;
        const originalSecondShaderReady = second.internalModel.shaderReady;
        const nativeFetch = globalThis.fetch.bind(globalThis);
        let restoredShaderRequests = 0;

        vi.spyOn(globalThis, "fetch").mockImplementation(async (...args) => {
            const url = new URL(getFetchURL(args[0]), location.href);
            if (url.pathname.startsWith(SHADER_PATH)) restoredShaderRequests++;

            return nativeFetch(...args);
        });

        expect(loseContext).toBeTruthy();

        const contextLost = eventOnce(app.canvas, "webglcontextlost", (event) =>
            event.preventDefault(),
        );
        const contextRestored = eventOnce(app.canvas, "webglcontextrestored");

        loseContext!.loseContext();
        await contextLost;
        setTimeout(() => loseContext!.restoreContext(), 0);
        await contextRestored;

        expect((app.renderer as any).gl).toBe(gl);

        app.render();
        expect(model.internalModel.shaderReady).not.toBe(originalShaderReady);
        expect(second.internalModel.shaderReady).not.toBe(originalSecondShaderReady);
        await expect(
            Promise.all([model.internalModel.shaderReady, second.internalModel.shaderReady]),
        ).resolves.toEqual([undefined, undefined]);
        expect(restoredShaderRequests).toBe(CUBISM5_SHADER_FILES.length * 2);
        app.render();

        expect(model.internalModel.shaderState).toBe("ready");
        expect(second.internalModel.shaderState).toBe("ready");
        expect(readCanvasPixel(app, 30, 30)).toEqual([255, 0, 0, 255]);
        expect(readCanvasPixel(app, 600, 30)).toEqual([0, 255, 0, 255]);

        model.visible = false;
        app.render();
        const restoredWithoutModel = readFramebuffer(app);
        model.visible = true;
        app.render();
        const restoredWithModel = readFramebuffer(app);

        expect(changedPixelCount(restoredWithoutModel, restoredWithModel)).toBeGreaterThan(1_000);
    }, 15_000);

    it("rejects a Pixi WebGL 1 renderer with a clear R5 requirement", async () => {
        app.destroy(true);
        app = await createApplication(320, 240, 1);
        document.body.appendChild(app.canvas);

        expect((app.renderer as any).context.webGLVersion).toBe(1);

        const model = await createMaoModel();
        app.stage.addChild(model);

        expect(() => model.render({} as any)).toThrow(/requires a Pixi WebGL 2 renderer/);
        expect(() => app.render()).toThrow(WEBGL2_ERROR);
    });

    it("creates hit area frames without Pixi warnings and exposes the expected hit areas", async () => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        const model = await createMaoModel();

        app.stage.addChild(model);

        const frames = new HitAreaFrames();
        model.addChild(frames);

        await startAndWaitForShaders(model);
        app.render();

        const headWorld = model.toGlobal(
            new Point(model.internalModel.width * 0.5, model.internalModel.height * 0.18),
        );
        const bodyWorld = model.toGlobal(
            new Point(model.internalModel.width * 0.5, model.internalModel.height * 0.55),
        );

        expect(model.hitTest(headWorld.x, headWorld.y)).toContain("Head");
        expect(model.hitTest(bodyWorld.x, bodyWorld.y)).toContain("Body");
        expect(frames.texts.length).toBe(Object.keys(model.internalModel.hitAreas).length);
        expect(warnSpy).not.toHaveBeenCalled();
    });

    async function createMaoModel(): Promise<any> {
        const model = await Live2DModel.from(MODEL_URL, { autoHitTest: false });

        model.scale.set(0.12);
        model.position.set(120, 60);

        return model;
    }

    async function startAndWaitForShaders(model: any): Promise<void> {
        app.render();
        expect(model.internalModel.shaderReady).toBeDefined();
        await model.internalModel.shaderReady;
    }
});

async function createApplication(
    width: number,
    height: number,
    preferWebGLVersion: 1 | 2,
): Promise<Application> {
    const application = new Application();

    await application.init({
        width,
        height,
        autoStart: false,
        preference: "webgl",
        preferWebGLVersion,
        backgroundColor: 0x102030,
    });

    return application;
}

function marker(tint: number, x: number, y: number): Sprite {
    const sprite = new Sprite(Texture.WHITE);

    sprite.tint = tint;
    sprite.position.set(x, y);
    sprite.width = 40;
    sprite.height = 40;

    return sprite;
}

function readFramebuffer(application: Application): Uint8Array {
    const gl = (application.renderer as any).gl as WebGL2RenderingContext;
    const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);

    gl.finish();
    gl.readPixels(
        0,
        0,
        gl.drawingBufferWidth,
        gl.drawingBufferHeight,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        pixels,
    );

    return pixels;
}

function changedPixelCount(before: ArrayLike<number>, after: ArrayLike<number>): number {
    let count = 0;

    for (let index = 0; index < Math.min(before.length, after.length); index += 4) {
        if (
            before[index] !== after[index] ||
            before[index + 1] !== after[index + 1] ||
            before[index + 2] !== after[index + 2] ||
            before[index + 3] !== after[index + 3]
        ) {
            count++;
        }
    }

    return count;
}

function readCanvasPixel(
    application: Application,
    x: number,
    y: number,
): [number, number, number, number] {
    const gl = (application.renderer as any).gl as WebGL2RenderingContext;
    const pixel = new Uint8Array(4);

    gl.finish();
    gl.readPixels(x, gl.drawingBufferHeight - y - 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);

    return [pixel[0]!, pixel[1]!, pixel[2]!, pixel[3]!];
}

function readExtractedPixel(
    output: { pixels: Uint8ClampedArray; width: number; height: number },
    x: number,
    y: number,
): [number, number, number, number] {
    const index = (y * output.width + x) * 4;

    return [
        output.pixels[index]!,
        output.pixels[index + 1]!,
        output.pixels[index + 2]!,
        output.pixels[index + 3]!,
    ];
}

function getFetchURL(input: RequestInfo | URL): string {
    if (typeof input === "string") {
        return input;
    }

    return input instanceof URL ? input.href : input.url;
}

function eventOnce(
    target: HTMLCanvasElement,
    type: string,
    beforeResolve?: (event: Event) => void,
): Promise<Event> {
    return new Promise((resolve) => {
        target.addEventListener(
            type,
            (event) => {
                beforeResolve?.(event);
                resolve(event);
            },
            { once: true },
        );
    });
}
