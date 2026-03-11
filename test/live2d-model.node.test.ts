import { describe, expect, it, vi } from "vitest";
import { Live2DModel } from "../src/Live2DModel";
import { Live2DFactory } from "../src/factory/Live2DFactory";

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
});
