import type { MotionManagerOptions } from "@/cubism-common";
import { ExpressionManager } from "@/cubism-common/ExpressionManager";
import type { Cubism5ModelSettings } from "@/cubism5/Cubism5ModelSettings";
import { CubismExpressionMotion } from "@cubism/motion/cubismexpressionmotion";
import { CubismMotionQueueManager } from "@cubism/motion/cubismmotionqueuemanager";
import { toCubismJsonBuffer } from "./serialization";
import type { Cubism5ExpressionDefinition } from "./types";

export class Cubism5ExpressionManager extends ExpressionManager<any, Cubism5ExpressionDefinition> {
    readonly queueManager: any = new CubismMotionQueueManager();

    readonly definitions: Cubism5ExpressionDefinition[];

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
        return this.queueManager.startMotion(motion, false, performance.now());
    }

    protected stopAllExpressions(): void {
        this.queueManager.stopAllMotions();
    }

    protected updateParameters(model: object, now: DOMHighResTimeStamp): boolean {
        return this.queueManager.doUpdateMotion(model, now);
    }
}
