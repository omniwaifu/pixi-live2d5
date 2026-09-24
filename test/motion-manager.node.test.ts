import { config } from "@/config";
import { MotionPreloadStrategy } from "@/cubism-common/MotionManager";
import { MotionPriority } from "@/cubism-common/MotionState";
import { SoundManager } from "@/cubism-common/SoundManager";
import { Cubism5ModelSettings } from "@/cubism5/Cubism5ModelSettings";
import { Cubism5MotionManager } from "@/cubism5/Cubism5MotionManager";
import type { Cubism5Group, Cubism5ModelJSON, Cubism5Motions } from "@/cubism5/types";
import { CubismFramework } from "@cubism/live2dcubismframework";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type ParameterId = { getString(): string };

class TestModel {
    private readonly values = new Map<string, number>();

    constructor(parameters: Record<string, number>) {
        for (const [id, value] of Object.entries(parameters)) {
            this.values.set(id, value);
        }
    }

    get(id: string): number {
        return this.values.get(id) ?? 0;
    }

    getParameterValueById(id: ParameterId): number {
        return this.get(id.getString());
    }

    setParameterValueById(id: ParameterId, value: number, weight = 1): void {
        const key = id.getString();

        this.values.set(key, this.get(key) * (1 - weight) + value * weight);
    }
}

class FakeAudio extends EventTarget {
    readonly HAVE_ENOUGH_DATA = 4;
    readyState = 4;
    volume = 1;
    preload = "";
    paused = true;
    src: string;

    constructor(src: string) {
        super();
        this.src = src;
    }

    play(): Promise<void> {
        this.paused = false;

        return Promise.resolve();
    }

    pause(): void {
        this.paused = true;
    }

    removeAttribute(name: string): void {
        if (name === "src") {
            this.src = "";
        }
    }
}

interface MotionMeta {
    FadeInTime?: number;
    FadeOutTime?: number;
}

function motionJson(meta: MotionMeta = {}, curves: object[] = []): object {
    const segments = curves.length;

    return {
        Version: 3,
        Meta: {
            Duration: 1,
            Fps: 30,
            Loop: false,
            AreBeziersRestricted: true,
            CurveCount: curves.length,
            TotalSegmentCount: segments,
            TotalPointCount: segments * 2,
            UserDataCount: 0,
            TotalUserDataSize: 0,
            ...meta,
        },
        Curves: curves,
    };
}

const managers: Cubism5MotionManager[] = [];

function createMotionManager(
    motions: Cubism5Motions,
    groups?: Cubism5Group[],
    load: (group: string, index: number) => object | Promise<object> = () => motionJson(),
): Cubism5MotionManager {
    const settings = new Cubism5ModelSettings({
        url: "https://example.com/model/model3.json",
        FileReferences: {
            Moc: "model.moc3",
            Textures: ["texture.png"],
            Motions: motions,
        },
        Groups: groups,
    } satisfies Cubism5ModelJSON);
    const manager = new Cubism5MotionManager(settings, {
        motionPreload: MotionPreloadStrategy.NONE,
    });

    // _loadMotion is the loader seam that Live2DFactory installs on the prototype.
    Object.assign(manager, {
        _loadMotion: async (group: string, index: number) =>
            manager.createMotion(
                await load(group, index),
                group,
                manager.definitions[group]![index]!,
            ),
    });

    managers.push(manager);

    return manager;
}

const originalConfig = { ...config };

beforeAll(() => {
    if (!CubismFramework.isStarted()) {
        CubismFramework.startUp();
    }
    if (!CubismFramework.isInitialized()) {
        CubismFramework.initialize();
    }
});

beforeEach(() => {
    vi.stubGlobal("Audio", FakeAudio);
});

afterEach(() => {
    for (const manager of managers.splice(0)) {
        if (!manager.destroyed) {
            manager.destroy();
        }
    }

    SoundManager.destroy();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    Object.assign(config, originalConfig);
});

describe("motion requests", () => {
    it("rejects missing motions without blocking the next valid motion", async () => {
        const manager = createMotionManager({
            Idle: [{ File: "idle.motion3.json" }],
            Normal: [{ File: "normal.motion3.json" }],
        });

        expect(await manager.startMotion("Missing", 0, MotionPriority.IDLE)).toBe(false);
        expect(await manager.startMotion("Idle", 4, MotionPriority.IDLE)).toBe(false);
        expect(await manager.startMotion("Idle", 0, MotionPriority.IDLE)).toBe(true);

        expect(await manager.startMotion("Missing", 0, MotionPriority.NORMAL)).toBe(false);
        expect(await manager.startMotion("Normal", 4, MotionPriority.NORMAL)).toBe(false);
        expect(await manager.startMotion("Normal", 0, MotionPriority.NORMAL)).toBe(true);
        expect(manager.state.currentGroup).toBe("Normal");
    });

    it.each([
        {
            name: "an explicit idle request",
            requestIdle: async (manager: Cubism5MotionManager) => {
                expect(await manager.startMotion("Idle", 0, MotionPriority.IDLE)).toBe(false);
            },
        },
        {
            name: "an automatic update",
            requestIdle: async (manager: Cubism5MotionManager) => {
                const idleRequests = vi.spyOn(manager, "startRandomMotion");

                manager.update(new TestModel({}), 1);
                // Let any automatic idle request settle before the pending motion loads.
                await Promise.all(idleRequests.mock.results.map((result) => result.value));
            },
        },
    ])("keeps a pending normal motion and its audio ahead of $name", async ({ requestIdle }) => {
        const normalLoad = Promise.withResolvers<object>();
        const manager = createMotionManager(
            {
                Idle: [{ File: "idle.motion3.json" }],
                Normal: [{ File: "normal.motion3.json", Sound: "normal.wav" }],
            },
            undefined,
            (group) => (group === "Normal" ? normalLoad.promise : motionJson()),
        );

        const normal = manager.startMotion("Normal", 0, MotionPriority.NORMAL);
        const audio = manager.currentAudio as unknown as FakeAudio;

        expect(audio.src).toBe("https://example.com/model/normal.wav");

        await requestIdle(manager);

        expect(manager.state.currentGroup).toBeUndefined();

        normalLoad.resolve(motionJson());

        expect(await normal).toBe(true);
        expect(manager.state.currentGroup).toBe("Normal");
        expect(manager.currentAudio).toBe(audio);
        expect(audio.src).toBe("https://example.com/model/normal.wav");
        expect(audio.paused).toBe(false);
    });
});

describe("motion audio ownership", () => {
    it("ignores late events and rejection cleanup from a superseded motion", async () => {
        const firstLoad = Promise.withResolvers<object>();
        const manager = createMotionManager(
            {
                Normal: [
                    { File: "first.motion3.json", Sound: "first.wav" },
                    { File: "second.motion3.json", Sound: "second.wav" },
                ],
            },
            undefined,
            (_group, index) => (index === 0 ? firstLoad.promise : motionJson()),
        );

        const first = manager.startMotion("Normal", 0, MotionPriority.NORMAL);
        const firstAudio = manager.currentAudio as unknown as FakeAudio;

        expect(await manager.startMotion("Normal", 1, MotionPriority.FORCE)).toBe(true);

        const secondAudio = manager.currentAudio as unknown as FakeAudio;

        expect(secondAudio.src).toBe("https://example.com/model/second.wav");

        firstLoad.resolve(motionJson());

        expect(await first).toBe(false);

        firstAudio.dispatchEvent(new Event("ended"));
        firstAudio.dispatchEvent(new Event("error"));

        expect(manager.state.currentIndex).toBe(1);
        expect(manager.currentAudio).toBe(secondAudio);
        expect(secondAudio.paused).toBe(false);

        manager.stopAllMotions();

        expect(secondAudio.paused).toBe(true);
        expect(secondAudio.src).toBe("");
        expect(manager.currentAudio).toBeUndefined();
    });

    it("does not retain a disposed audio when a silent motion replaces it", async () => {
        const manager = createMotionManager({
            Normal: [
                { File: "voiced.motion3.json", Sound: "voiced.wav" },
                { File: "silent.motion3.json" },
            ],
        });

        expect(await manager.startMotion("Normal", 0, MotionPriority.NORMAL)).toBe(true);

        const voicedAudio = manager.currentAudio as unknown as FakeAudio;

        expect(voicedAudio.paused).toBe(false);
        expect(await manager.startMotion("Normal", 1, MotionPriority.FORCE)).toBe(true);

        expect(voicedAudio.paused).toBe(true);
        expect(voicedAudio.src).toBe("");
        expect(manager.currentAudio).toBeUndefined();
    });
});

describe("motion fade durations", () => {
    const cases: {
        name: string;
        group: "Idle" | "Normal";
        meta?: MotionMeta;
        definition?: MotionMeta;
        expected: [number, number];
    }[] = [
        { name: "normal config default", group: "Normal", expected: [0.5, 0.5] },
        { name: "idle config default", group: "Idle", expected: [2, 2] },
        {
            name: "motion metadata",
            group: "Normal",
            meta: { FadeInTime: 0.25, FadeOutTime: 0.25 },
            expected: [0.25, 0.25],
        },
        {
            name: "settings over metadata",
            group: "Normal",
            meta: { FadeInTime: 0.25, FadeOutTime: 0.25 },
            definition: { FadeInTime: 0.1, FadeOutTime: 0.3 },
            expected: [0.1, 0.3],
        },
        {
            name: "zero settings over metadata",
            group: "Normal",
            meta: { FadeInTime: 0.25, FadeOutTime: 0.25 },
            definition: { FadeInTime: 0, FadeOutTime: 0 },
            expected: [0, 0],
        },
        {
            name: "zero settings over config",
            group: "Idle",
            definition: { FadeInTime: 0, FadeOutTime: 0 },
            expected: [0, 0],
        },
        {
            name: "negative settings defer to metadata",
            group: "Normal",
            meta: { FadeInTime: 0.25, FadeOutTime: 0.25 },
            definition: { FadeInTime: -1, FadeOutTime: -1 },
            expected: [0.25, 0.25],
        },
        {
            name: "negative settings defer to config",
            group: "Idle",
            definition: { FadeInTime: -1, FadeOutTime: -1 },
            expected: [2, 2],
        },
        {
            name: "fade-in and fade-out resolve independently",
            group: "Normal",
            meta: { FadeOutTime: 0.25 },
            definition: { FadeInTime: 0.1 },
            expected: [0.1, 0.25],
        },
    ];

    it.each(cases)("uses $name", ({ group, meta, definition, expected }) => {
        const manager = createMotionManager({
            Idle: [{ File: "idle.motion3.json", ...(group === "Idle" ? definition : {}) }],
            Normal: [{ File: "normal.motion3.json", ...(group === "Normal" ? definition : {}) }],
        });
        const motion = manager.createMotion(
            motionJson(meta),
            group,
            manager.definitions[group]![0]!,
        );

        expect(motion.getFadeInTime()).toBeCloseTo(expected[0]);
        expect(motion.getFadeOutTime()).toBeCloseTo(expected[1]);

        motion.release();
    });

    it("follows the configured default durations", () => {
        config.motionFadingDuration = 800;
        config.idleMotionFadingDuration = 1200;

        const manager = createMotionManager({
            Idle: [{ File: "idle.motion3.json" }],
            Normal: [{ File: "normal.motion3.json" }],
        });
        const normal = manager.createMotion(
            motionJson(),
            "Normal",
            manager.definitions.Normal![0]!,
        );
        const idle = manager.createMotion(motionJson(), "Idle", manager.definitions.Idle![0]!);

        expect(normal.getFadeInTime()).toBeCloseTo(0.8);
        expect(normal.getFadeOutTime()).toBeCloseTo(0.8);
        expect(idle.getFadeInTime()).toBeCloseTo(1.2);
        expect(idle.getFadeOutTime()).toBeCloseTo(1.2);

        normal.release();
        idle.release();
    });
});

describe("motion effect parameters", () => {
    const effectMotion = motionJson({ FadeInTime: 0, FadeOutTime: 0 }, [
        { Target: "Model", Id: "EyeBlink", Segments: [0, 0.25, 0, 1, 0.25] },
        { Target: "Model", Id: "LipSync", Segments: [0, 0.4, 0, 1, 0.4] },
    ]);

    async function playEffectMotion(groups?: Cubism5Group[]): Promise<TestModel> {
        const manager = createMotionManager(
            { Normal: [{ File: "effect.motion3.json", FadeInTime: 0, FadeOutTime: 0 }] },
            groups,
            () => effectMotion,
        );
        const model = new TestModel({ ParamEyeLOpen: 1, ParamMouthOpenY: 0, ParamOther: 0.7 });

        expect(await manager.startMotion("Normal", 0, MotionPriority.NORMAL)).toBe(true);

        manager.update(model, 10);
        manager.update(model, 10.5);

        return model;
    }

    it("applies EyeBlink and LipSync model curves to the grouped parameters", async () => {
        const model = await playEffectMotion([
            { Name: "EyeBlink", Ids: ["ParamEyeLOpen"] },
            { Name: "LipSync", Ids: ["ParamMouthOpenY"] },
        ]);

        expect(model.get("ParamEyeLOpen")).toBeCloseTo(0.25);
        expect(model.get("ParamMouthOpenY")).toBeCloseTo(0.4);
        expect(model.get("ParamOther")).toBeCloseTo(0.7);
    });

    it("leaves parameters unchanged when the effect groups are absent", async () => {
        const model = await playEffectMotion();

        expect(model.get("ParamEyeLOpen")).toBeCloseTo(1);
        expect(model.get("ParamMouthOpenY")).toBeCloseTo(0);
        expect(model.get("ParamOther")).toBeCloseTo(0.7);
    });
});
