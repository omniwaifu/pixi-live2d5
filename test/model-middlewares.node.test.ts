import { Assets } from "pixi.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Live2DModel } from "../src/Live2DModel";
import { ModelSettings } from "../src/cubism-common/ModelSettings";
import { Live2DFactory, type Live2DRuntime } from "../src/factory/Live2DFactory";
import { Live2DLoader } from "../src/factory/Live2DLoader";

const CANCELED = "Live2DModel was destroyed while loading.";
const SETTINGS_URL = "https://example.test/fake/fake.model3.json";
const MOC = "fake.moc3";
const POSE = "fake.pose3.json";
const PHYSICS = "fake.physics3.json";
const TEXTURE_URL = "https://example.test/fake/texture_00.png";
const LIFECYCLE_EVENTS = ["modelLoaded", "textureLoaded", "ready", "load"];

/** A resource load held open by the test until it calls `resolve`. */
interface PendingLoad {
    /** Settles once the pipeline actually starts loading this resource. */
    requested: Promise<void>;
    markRequested(): void;
    result: Promise<unknown>;
    resolve(value: unknown): void;
}

interface FakeCoreModel {
    released: boolean;
}

class FakeSettings extends ModelSettings {
    moc = MOC;
    textures = ["texture_00.png"];

    constructor(json: { url: string }) {
        super(json);
        this.pose = POSE;
        this.physics = PHYSICS;
    }
}

class FakeInternalModel {
    width = 100;
    height = 50;
    pose?: unknown;
    physics?: unknown;
    destroyed = false;

    constructor(
        readonly coreModel: FakeCoreModel,
        readonly settings: ModelSettings,
    ) {}

    destroy() {
        this.destroyed = true;
        this.coreModel.released = true;
    }
}

class FakeTexture {
    destroyed = false;

    destroy() {
        this.destroyed = true;
    }
}

describe("model setup cancellation", () => {
    const loads = new Map<string, PendingLoad>();
    const coreModels: FakeCoreModel[] = [];
    const internalModels: FakeInternalModel[] = [];
    const optionalFactoryCalls: { kind: string; coreReleased: boolean }[] = [];
    const unhandledRejections: unknown[] = [];
    const onUnhandledRejection = (reason: unknown) => unhandledRejections.push(reason);
    const originalLoaderMiddlewares = Live2DLoader.middlewares;
    let texture: FakeTexture;
    let afterInternalModelCreated: (() => void) | undefined;

    const runtime = {
        version: 99,
        ready: () => Promise.resolve(),
        test: () => true,
        isValidMoc: () => true,
        createModelSettings: (json: { url: string }) => new FakeSettings(json),
        createCoreModel: () => {
            const coreModel = { released: false };
            coreModels.push(coreModel);
            return coreModel;
        },
        createInternalModel: (coreModel: FakeCoreModel, settings: ModelSettings) => {
            const internalModel = new FakeInternalModel(coreModel, settings);
            internalModels.push(internalModel);
            afterInternalModelCreated?.();
            return internalModel;
        },
        createPose: (coreModel: FakeCoreModel) => {
            optionalFactoryCalls.push({ kind: "pose", coreReleased: coreModel.released });
            return { kind: "pose" };
        },
        createPhysics: (coreModel: FakeCoreModel) => {
            optionalFactoryCalls.push({ kind: "physics", coreReleased: coreModel.released });
            return { kind: "physics" };
        },
    } as unknown as Live2DRuntime;

    beforeEach(() => {
        texture = new FakeTexture();
        process.on("unhandledRejection", onUnhandledRejection);
        vi.spyOn(Live2DFactory, "findRuntime").mockReturnValue(runtime);
        vi.spyOn(Assets, "load").mockImplementation(((asset: string | { src: string }) =>
            startLoading(typeof asset === "string" ? asset : asset.src)) as typeof Assets.load);
        vi.spyOn(console, "warn").mockImplementation(() => {});
        Live2DLoader.middlewares = [
            async (context) => {
                context.result = await startLoading(context.url);
            },
        ];
    });

    afterEach(async () => {
        // settle everything so the global texture queue can't block later tests
        for (const load of loads.values()) load.resolve({});
        // one full event-loop turn lets Node report any rejection left unhandled
        await new Promise((resolve) => setImmediate(resolve));

        process.off("unhandledRejection", onUnhandledRejection);
        Live2DLoader.middlewares = originalLoaderMiddlewares;
        vi.restoreAllMocks();
        loads.clear();
        coreModels.length = 0;
        internalModels.length = 0;
        optionalFactoryCalls.length = 0;
        afterInternalModelCreated = undefined;

        expect(unhandledRejections.splice(0)).toEqual([]);
    });

    it("emits model and texture events before ready and load for a normal load", async () => {
        const { model, setup, events } = startSetup();

        pending(MOC).resolve(new ArrayBuffer(8));
        pending(TEXTURE_URL).resolve(texture);
        pending(POSE).resolve({});
        pending(PHYSICS).resolve({});

        await expect(setup).resolves.toBeUndefined();
        expect(events.filter((event) => LIFECYCLE_EVENTS.includes(event))).toEqual(
            LIFECYCLE_EVENTS,
        );
        expect(events.indexOf("poseLoaded")).toBeLessThan(events.indexOf("load"));
        expect(events.indexOf("physicsLoaded")).toBeLessThan(events.indexOf("load"));
        expect(model.internalModel).toBe(internalModels[0]);
        expect(model.textures).toEqual([texture]);
        expect(internalModels[0]!.pose).toEqual({ kind: "pose" });
        expect(internalModels[0]!.physics).toEqual({ kind: "physics" });
        expect(optionalFactoryCalls).toEqual([
            { kind: "pose", coreReleased: false },
            { kind: "physics", coreReleased: false },
        ]);

        model.destroy();
    });

    it("rejects without creating Core resources when destroyed during the moc load", async () => {
        const { model, setup, events } = startSetup();

        await pending(MOC).requested;
        model.destroy();
        pending(MOC).resolve(new ArrayBuffer(8));
        pending(TEXTURE_URL).resolve(texture);

        await expect(setup).rejects.toThrow(CANCELED);
        expect(coreModels).toEqual([]);
        expect(model.internalModel).toBeUndefined();
        expect(model.textures).toEqual([]);
        expect(eventsAfterDestroy(events)).toEqual([]);
        expect(texture.destroyed).toBe(false);
    });

    it("releases an internal model that was never handed to a destroyed model", async () => {
        const { model, setup, events } = startSetup();
        afterInternalModelCreated = () => model.destroy();

        pending(MOC).resolve(new ArrayBuffer(8));
        pending(TEXTURE_URL).resolve(texture);

        await expect(setup).rejects.toThrow(CANCELED);
        expect(model.internalModel).toBeUndefined();
        expect(internalModels[0]!.destroyed).toBe(true);
        expect(coreModels[0]!.released).toBe(true);
        expect(eventsAfterDestroy(events)).toEqual([]);
    });

    it("rejects when destroyed by a modelLoaded listener", async () => {
        const { model, setup, events } = startSetup();
        model.once("modelLoaded", () => model.destroy());

        pending(MOC).resolve(new ArrayBuffer(8));
        pending(TEXTURE_URL).resolve(texture);
        pending(POSE).resolve({});
        pending(PHYSICS).resolve({});

        await expect(setup).rejects.toThrow(CANCELED);
        expect(internalModels[0]!.destroyed).toBe(true);
        expect(model.textures).toEqual([]);
        expect(optionalFactoryCalls).toEqual([]);
        expect(eventsAfterDestroy(events)).toEqual([]);
        expect(texture.destroyed).toBe(false);
    });

    it("rejects without attaching textures when destroyed during the texture load", async () => {
        const { model, setup, events } = startSetup();
        const modelLoaded = Promise.withResolvers<void>();
        model.once("modelLoaded", () => modelLoaded.resolve());

        pending(MOC).resolve(new ArrayBuffer(8));
        await modelLoaded.promise;
        model.destroy();
        pending(TEXTURE_URL).resolve(texture);
        pending(POSE).resolve({});
        pending(PHYSICS).resolve({});

        await expect(setup).rejects.toThrow(CANCELED);
        expect(internalModels[0]!.destroyed).toBe(true);
        expect(model.textures).toEqual([]);
        expect(optionalFactoryCalls).toEqual([]);
        expect(eventsAfterDestroy(events)).toEqual([]);
        expect(texture.destroyed).toBe(false);
    });

    it("rejects when destroyed by a textureLoaded listener", async () => {
        const { model, setup, events } = startSetup();
        model.once("textureLoaded", () => model.destroy());

        pending(MOC).resolve(new ArrayBuffer(8));
        pending(TEXTURE_URL).resolve(texture);
        pending(POSE).resolve({});
        pending(PHYSICS).resolve({});

        await expect(setup).rejects.toThrow(CANCELED);
        expect(internalModels[0]!.destroyed).toBe(true);
        expect(optionalFactoryCalls).toEqual([]);
        expect(eventsAfterDestroy(events)).toEqual([]);
        expect(texture.destroyed).toBe(false);
    });

    it("rejects and skips optional factories when destroyed by a ready listener", async () => {
        const { model, setup, events } = startSetup();
        const destroyedOnReady = Promise.withResolvers<void>();
        model.once("ready", () => {
            model.destroy();
            destroyedOnReady.resolve();
        });

        pending(MOC).resolve(new ArrayBuffer(8));
        pending(TEXTURE_URL).resolve(texture);
        await destroyedOnReady.promise;
        pending(POSE).resolve({});
        pending(PHYSICS).resolve({});

        await expect(setup).rejects.toThrow(CANCELED);
        expect(internalModels[0]!.destroyed).toBe(true);
        expect(internalModels[0]!.pose).toBeUndefined();
        expect(internalModels[0]!.physics).toBeUndefined();
        expect(optionalFactoryCalls).toEqual([]);
        expect(eventsAfterDestroy(events)).toEqual([]);
    });

    function startSetup() {
        const model = new Live2DModel({ autoUpdate: false, autoHitTest: false, autoFocus: false });
        const events: string[] = [];
        const emit = model.emit.bind(model);

        // Container#destroy removes all listeners, so record the emitted stream at the source.
        model.emit = ((event: string, ...args: unknown[]) => {
            events.push(model.destroyed ? `${event} (after destroy)` : event);
            return emit(event, ...args);
        }) as typeof model.emit;

        const setup = Live2DFactory.setupLive2DModel(model, { url: SETTINGS_URL });

        return { model, setup, events };
    }

    function pending(url: string): PendingLoad {
        let load = loads.get(url);

        if (!load) {
            const requested = Promise.withResolvers<void>();
            const result = Promise.withResolvers<unknown>();
            load = {
                requested: requested.promise,
                markRequested: () => requested.resolve(),
                result: result.promise,
                resolve: result.resolve,
            };
            loads.set(url, load);
        }

        return load;
    }

    function startLoading(url: string): Promise<unknown> {
        const load = pending(url);
        load.markRequested();
        return load.result;
    }
});

function eventsAfterDestroy(events: string[]): string[] {
    return events.filter(
        (event) => event.endsWith("(after destroy)") && !event.startsWith("destroyed"),
    );
}
