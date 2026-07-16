import type { MotionManagerOptions } from "@/cubism-common";
import { ExpressionManager } from "@/cubism-common/ExpressionManager";
import type { Cubism5ModelSettings } from "@/cubism5/Cubism5ModelSettings";
import { CubismExpressionMotion } from "@cubism/motion/cubismexpressionmotion";
import { CubismExpressionMotionManager } from "@cubism/motion/cubismexpressionmotionmanager";
import { toCubismJsonBuffer } from "./serialization";
import type { Cubism5ExpressionDefinition } from "./types";

export class Cubism5ExpressionManager extends ExpressionManager<any, Cubism5ExpressionDefinition> {
    readonly queueManager = new CubismExpressionMotionManager();

    readonly definitions: Cubism5ExpressionDefinition[];

    private lastUpdateTimeSeconds?: DOMHighResTimeStamp;

    constructor(settings: Cubism5ModelSettings, options?: MotionManagerOptions) {
        super(settings, options);

        this.definitions = settings.expressions ?? [];

        this.init();
    }

    isFinished(): boolean {
        return this.queueManager.isFinished();
    }

    getExpressionIndex(name: string): number {
        return this.definitions.findIndex((def) => def.Name === name);
    }

    getExpressionFile(definition: Cubism5ExpressionDefinition): string {
        return definition.File;
    }

    createExpression(data: object | string, definition: Cubism5ExpressionDefinition | undefined) {
        const { buffer, byteLength } = toCubismJsonBuffer(data);

        return CubismExpressionMotion.create(buffer, byteLength);
    }

    protected _setExpression(motion: any): number {
        return this.queueManager.startMotion(motion, false);
    }

    protected stopAllExpressions(): void {
        this.queueManager.stopAllMotions();
        this.lastUpdateTimeSeconds = undefined;
    }

    protected updateParameters(model: object, now: DOMHighResTimeStamp): boolean {
        const elapsedSeconds = Math.max(0, now - (this.lastUpdateTimeSeconds ?? now));

        this.lastUpdateTimeSeconds = now;

        return this.queueManager.updateMotion(model as any, elapsedSeconds);
    }

    override destroy(): void {
        this.stopAllExpressions();
        this.queueManager.release();

        super.destroy();
    }
}
