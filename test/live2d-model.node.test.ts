import { describe, expect, it, vi } from "vitest";
import { Live2DModel } from "../src/Live2DModel";
import { Live2DFactory } from "../src/factory/Live2DFactory";
import type { InternalModel } from "../src/cubism-common";

describe("Live2DModel lifecycle helpers", () => {
    it("invokes onLoad for the async factory", async () => {
        const onLoad = vi.fn();
        const setupSpy = vi.spyOn(Live2DFactory, "setupLive2DModel").mockResolvedValue();

        await expect(
            Live2DModel.from("https://example.com/model3.json", {
                onLoad,
                autoUpdate: false,
                autoHitTest: false,
                autoFocus: false,
            }),
        ).resolves.toBeInstanceOf(Live2DModel);

        expect(onLoad).toHaveBeenCalledOnce();

        setupSpy.mockRestore();
    });

    it("invokes onError for the async factory and rethrows", async () => {
        const error = new Error("boom");
        const onError = vi.fn();
        const setupSpy = vi.spyOn(Live2DFactory, "setupLive2DModel").mockRejectedValue(error);

        await expect(
            Live2DModel.from("https://example.com/model3.json", {
                onError,
                autoUpdate: false,
                autoHitTest: false,
                autoFocus: false,
            }),
        ).rejects.toThrow(error);

        expect(onError).toHaveBeenCalledOnce();
        expect(onError).toHaveBeenCalledWith(error);

        setupSpy.mockRestore();
    });

    it("invokes onError once for the synchronous factory", async () => {
        const error = new Error("boom");
        const onError = vi.fn();
        const setupSpy = vi.spyOn(Live2DFactory, "setupLive2DModel").mockRejectedValue(error);

        Live2DModel.fromSync("https://example.com/model3.json", {
            onError,
            autoUpdate: false,
            autoHitTest: false,
            autoFocus: false,
        });

        await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce());
        expect(onError).toHaveBeenCalledWith(error);

        setupSpy.mockRestore();
    });

    it("destroys a partial model once and preserves the setup error", async () => {
        const error = new Error("resource load failed");
        const model = new Live2DModel({
            autoUpdate: false,
            autoHitTest: false,
            autoFocus: false,
        });
        const destroySpy = vi.spyOn(model, "destroy");
        const originalMiddlewares = Live2DFactory.live2DModelMiddlewares;

        Live2DFactory.live2DModelMiddlewares = [
            async () => {
                throw error;
            },
        ];

        try {
            await expect(
                Live2DFactory.setupLive2DModel(model, "https://example.com/model3.json"),
            ).rejects.toBe(error);
            expect(destroySpy).toHaveBeenCalledOnce();
            expect(model.destroyed).toBe(true);
        } finally {
            Live2DFactory.live2DModelMiddlewares = originalMiddlewares;
        }
    });

    it("can be destroyed before the internal model exists", () => {
        const setupSpy = vi
            .spyOn(Live2DFactory, "setupLive2DModel")
            .mockReturnValue(new Promise(() => {}));

        const model = Live2DModel.fromSync("https://example.com/model3.json", {
            autoUpdate: false,
            autoHitTest: false,
            autoFocus: false,
        });

        expect(() => model.destroy()).not.toThrow();

        setupSpy.mockRestore();
    });

    it("refreshes bounds cached before load once the internal model loads", () => {
        const model = new Live2DModel({
            autoUpdate: false,
            autoHitTest: false,
            autoFocus: false,
        });
        const inside = { x: 50, y: 25 };

        // querying bounds before load caches the empty bounds
        expect(model.containsPoint(inside)).toBe(false);

        const internalModel = {
            settings: { name: "fake" },
            width: 100,
            height: 50,
            destroy() {},
        } as unknown as InternalModel;
        model.internalModel = internalModel;
        model.emit("modelLoaded", internalModel);

        const { minX, minY, maxX, maxY } = model.bounds;
        expect({ minX, minY, maxX, maxY }).toEqual({ minX: 0, minY: 0, maxX: 100, maxY: 50 });
        expect(model.containsPoint(inside)).toBe(true);
        expect(model.containsPoint({ x: 150, y: 25 })).toBe(false);

        model.destroy();
    });
});
