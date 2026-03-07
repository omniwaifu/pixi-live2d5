import { describe, expect, it, vi } from "vitest";
import { ModelSettings } from "../src/cubism-common/ModelSettings";
import { Live2DFactory } from "../src/factory/Live2DFactory";
import { Live2DLoader } from "../src/factory/Live2DLoader";
import { createInternalModel } from "../src/factory/model-middlewares";

class FakeModelSettings extends ModelSettings {
    moc = "fake.moc3";
    textures = ["texture.png"];
}

describe("createInternalModel middleware", () => {
    it("forwards checkMocConsistency to the runtime", async () => {
        const settings = new FakeModelSettings({ url: "https://example.com/models/model3.json" });
        const modelData = new ArrayBuffer(8);
        const internalModel = { tag: "internal-model" } as any;

        const loadSpy = vi.spyOn(Live2DLoader, "load").mockResolvedValue(modelData);
        const createCoreModel = vi.fn().mockReturnValue({ kind: "core-model" });
        const runtime = {
            version: 5,
            ready: vi.fn(),
            test: vi.fn(),
            isValidMoc: vi.fn().mockReturnValue(true),
            createModelSettings: vi.fn(),
            createCoreModel,
            createInternalModel: vi.fn().mockReturnValue(internalModel),
            createPose: vi.fn(),
            createPhysics: vi.fn(),
        };
        const findRuntimeSpy = vi
            .spyOn(Live2DFactory, "findRuntime")
            .mockReturnValue(runtime as any);

        const context = {
            settings,
            options: { checkMocConsistency: true },
            live2dModel: {} as any,
        } as any;

        await createInternalModel(context, async () => {});

        expect(loadSpy).toHaveBeenCalledOnce();
        expect(createCoreModel).toHaveBeenCalledWith(modelData, { checkMocConsistency: true });
        expect(context.internalModel).toBe(internalModel);

        loadSpy.mockRestore();
        findRuntimeSpy.mockRestore();
    });
});
