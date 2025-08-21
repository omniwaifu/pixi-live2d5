import type { MotionManagerOptions } from "@/cubism-common";
import { ExpressionManager } from "@/cubism-common/ExpressionManager";
import type { Cubism5ModelSettings } from "@/cubism5/Cubism5ModelSettings";
import type { CubismSpec } from "@cubism/CubismSpec";
import type { CubismModel } from "@cubism/model/cubismmodel";
import { CubismExpressionMotion } from "@cubism/motion/cubismexpressionmotion";
import { CubismMotionQueueManager } from "@cubism/motion/cubismmotionqueuemanager";

export class Cubism5ExpressionManager extends ExpressionManager<
    CubismExpressionMotion,
    CubismSpec.Expression
> {
    readonly queueManager = new CubismMotionQueueManager();

    readonly definitions: CubismSpec.Expression[];

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

    getExpressionFile(definition: CubismSpec.Expression): string {
        return definition.File;
    }

    createExpression(data: object | string, definition: CubismSpec.Expression | undefined) {
        // Handle text data for Cubism 5 - convert to ArrayBuffer
        if (typeof data === "string") {
            const buffer = new TextEncoder().encode(data);
            return CubismExpressionMotion.create(buffer.buffer, buffer.byteLength);
        }
        
        // Handle object data (fallback for other cases)
        const jsonString = JSON.stringify(data);
        const buffer = new TextEncoder().encode(jsonString);
        return CubismExpressionMotion.create(buffer.buffer, buffer.byteLength);
    }

    protected _setExpression(motion: CubismExpressionMotion): number {
        return this.queueManager.startMotion(motion, false, performance.now());
    }

    protected stopAllExpressions(): void {
        this.queueManager.stopAllMotions();
    }

    protected updateParameters(model: CubismModel, now: DOMHighResTimeStamp): boolean {
        return this.queueManager.doUpdateMotion(model, now);
    }
}
