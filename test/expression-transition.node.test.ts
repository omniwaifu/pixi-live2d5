import { Cubism5ExpressionManager } from "@/cubism5/Cubism5ExpressionManager";
import { Cubism5InternalModel } from "@/cubism5/Cubism5InternalModel";
import { Cubism5ModelSettings } from "@/cubism5/Cubism5ModelSettings";
import type { Cubism5ExpressionDefinition, Cubism5ModelJSON } from "@/cubism5/types";
import { CubismFramework } from "@cubism/live2dcubismframework";
import { CubismExpressionMotionManager } from "@cubism/motion/cubismexpressionmotionmanager";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

type ParameterId = { getString(): string };

class TestModel {
    private readonly baseline = new Map<string, number>();
    private readonly values = new Map<string, number>();

    constructor(parameters: Record<string, number>) {
        for (const [id, value] of Object.entries(parameters)) {
            this.baseline.set(id, value);
            this.values.set(id, value);
        }
    }

    loadParameters(): void {
        for (const [id, value] of this.baseline) {
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
        const current = this.get(key);

        this.values.set(key, current * (1 - weight) + value * weight);
    }

    addParameterValueById(id: ParameterId, value: number, weight = 1): void {
        const key = id.getString();

        this.values.set(key, this.get(key) + value * weight);
    }

    multiplyParameterValueById(id: ParameterId, value: number, weight = 1): void {
        const key = id.getString();

        this.values.set(key, this.get(key) * (1 + (value - 1) * weight));
    }
}

interface ExpressionData {
    FadeInTime?: number;
    FadeOutTime?: number;
    Parameters: { Id: string; Value: number; Blend: "Add" | "Multiply" | "Overwrite" }[];
}

const managers: Cubism5ExpressionManager[] = [];

function createManager(expressions: Record<string, ExpressionData>): Cubism5ExpressionManager {
    const definitions: Cubism5ExpressionDefinition[] = Object.keys(expressions).map((name) => ({
        Name: name,
        File: `${name}.exp3.json`,
    }));
    const settings = new Cubism5ModelSettings({
        url: "https://example.com/model/model3.json",
        FileReferences: {
            Moc: "model.moc3",
            Textures: ["texture.png"],
            Expressions: definitions,
        },
    } satisfies Cubism5ModelJSON);
    const manager = new Cubism5ExpressionManager(settings);

    definitions.forEach((definition, index) => {
        manager.expressions[index] = manager.createExpression(
            expressions[definition.Name]!,
            definition,
        );
    });

    managers.push(manager);

    return manager;
}

function updateAt(manager: Cubism5ExpressionManager, model: TestModel, nowSeconds: number): void {
    model.loadParameters();
    manager.update(model, nowSeconds);
}

beforeAll(() => {
    const globalScope = globalThis as any;

    globalScope.Live2DCubismCore ??= {
        Logging: {
            csmSetLogFunction() {},
            csmGetLogFunction() {
                return undefined;
            },
        },
        Memory: {
            initializeAmountOfMemory() {},
        },
        Version: {
            csmGetVersion() {
                return 0;
            },
        },
    };

    if (!CubismFramework.isStarted()) {
        CubismFramework.startUp();
    }
    if (!CubismFramework.isInitialized()) {
        CubismFramework.initialize();
    }
});

afterEach(() => {
    for (const manager of managers.splice(0)) {
        if (!manager.destroyed) {
            manager.destroy();
        }
    }
});

describe("Cubism 5 expression transitions", () => {
    it("uses the SDK expression manager and restores parameters absent from the new expression", async () => {
        const manager = createManager({
            first: {
                FadeInTime: 1,
                FadeOutTime: 10,
                Parameters: [
                    { Id: "Add", Value: 1, Blend: "Add" },
                    { Id: "Multiply", Value: 1.5, Blend: "Multiply" },
                    { Id: "Overwrite", Value: 5, Blend: "Overwrite" },
                ],
            },
            second: {
                FadeInTime: 1,
                FadeOutTime: 1,
                Parameters: [{ Id: "Second", Value: 7, Blend: "Overwrite" }],
            },
        });
        const model = new TestModel({ Add: 2, Multiply: 2, Overwrite: 2, Second: 0 });

        expect(manager.queueManager).toBeInstanceOf(CubismExpressionMotionManager);
        expect(await manager.setExpression("first")).toBe(true);

        updateAt(manager, model, 100);
        expect(model.get("Add")).toBe(2);

        updateAt(manager, model, 101);
        expect(model.get("Add")).toBeCloseTo(3);
        expect(model.get("Multiply")).toBeCloseTo(3);
        expect(model.get("Overwrite")).toBeCloseTo(5);

        expect(await manager.setExpression("second")).toBe(true);
        updateAt(manager, model, 101);
        updateAt(manager, model, 102);

        expect(model.get("Add")).toBeCloseTo(2);
        expect(model.get("Multiply")).toBeCloseTo(2);
        expect(model.get("Overwrite")).toBeCloseTo(2);
        expect(model.get("Second")).toBeCloseTo(7);
    });

    it("handles rapid transitions, reset, and restore without retaining stale parameters", async () => {
        const expression = (id: string): ExpressionData => ({
            FadeInTime: 1,
            FadeOutTime: 10,
            Parameters: [{ Id: id, Value: 1, Blend: "Add" }],
        });
        const manager = createManager({
            first: expression("First"),
            second: expression("Second"),
            third: expression("Third"),
        });
        const model = new TestModel({ First: 0, Second: 0, Third: 0 });

        await manager.setExpression("first");
        updateAt(manager, model, 10);
        updateAt(manager, model, 11);

        await manager.setExpression("second");
        updateAt(manager, model, 11);
        updateAt(manager, model, 11.5);
        await manager.setExpression("third");
        updateAt(manager, model, 11.5);
        updateAt(manager, model, 12.5);

        expect(model.get("First")).toBeCloseTo(0);
        expect(model.get("Second")).toBeCloseTo(0);
        expect(model.get("Third")).toBeCloseTo(1);

        manager.resetExpression();
        updateAt(manager, model, 12.5);
        updateAt(manager, model, 13.5);
        expect(model.get("Third")).toBeCloseTo(0);

        manager.restoreExpression();
        updateAt(manager, model, 13.5);
        updateAt(manager, model, 14.5);
        expect(model.get("Third")).toBeCloseTo(1);
    });

    it("releases the SDK expression manager during destruction", () => {
        const manager = createManager({
            first: {
                Parameters: [{ Id: "First", Value: 1, Blend: "Add" }],
            },
        });
        const release = vi.spyOn(manager.queueManager, "release");

        manager.destroy();

        expect(release).toHaveBeenCalledOnce();
        expect(manager.destroyed).toBe(true);
    });
});

describe("Cubism 5 parameter update order", () => {
    it("saves the motion baseline before applying transient expression effects", () => {
        const calls: string[] = [];
        const coreModel = {
            loadParameters() {
                calls.push("loadParameters");
            },
            saveParameters() {
                calls.push("saveParameters");
            },
            update() {
                calls.push("model.update");
            },
        };
        const model = {
            coreModel,
            focusController: {
                update() {
                    calls.push("focusController.update");
                },
            },
            motionManager: {
                update(receivedModel: unknown, now: number) {
                    expect(receivedModel).toBe(coreModel);
                    expect(now).toBe(2);
                    calls.push("motion.update");
                    return false;
                },
                expressionManager: {
                    update(receivedModel: unknown, now: number) {
                        expect(receivedModel).toBe(coreModel);
                        expect(now).toBe(2);
                        calls.push("expression.update");
                    },
                },
            },
            eyeBlink: {
                updateParameters(receivedModel: unknown, delta: number) {
                    expect(receivedModel).toBe(coreModel);
                    expect(delta).toBe(0.016);
                    calls.push("eyeBlink.update");
                },
            },
            emit(event: string) {
                calls.push(event);
            },
            updateNaturalMovements(delta: number, now: number) {
                expect(delta).toBe(16);
                expect(now).toBe(2000);
                calls.push("naturalMovements.update");
            },
            updateFocus() {
                calls.push("focus.update");
            },
        };

        Cubism5InternalModel.prototype.update.call(model, 16, 2000);

        expect(calls).toEqual([
            "focusController.update",
            "loadParameters",
            "beforeMotionUpdate",
            "motion.update",
            "afterMotionUpdate",
            "saveParameters",
            "eyeBlink.update",
            "expression.update",
            "naturalMovements.update",
            "focus.update",
            "beforeModelUpdate",
            "model.update",
        ]);
    });
});
