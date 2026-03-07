import { config } from "@/config";
import type { MotionManagerOptions } from "@/cubism-common/MotionManager";
import { MotionManager } from "@/cubism-common/MotionManager";
import { Cubism5ExpressionManager } from "@/cubism5/Cubism5ExpressionManager";
import type { Cubism5ModelSettings } from "@/cubism5/Cubism5ModelSettings";
import { CubismMotion } from "@cubism/motion/cubismmotion";
import { CubismMotionJson } from "@cubism/motion/cubismmotionjson";
import { CubismMotionQueueManager } from "@cubism/motion/cubismmotionqueuemanager";
import { csmVector } from "@cubism/type/csmvector";
import { toCubismJsonBuffer } from "./serialization";
import type { Cubism5MotionDefinition } from "./types";
import type { Mutable } from "../types/helpers";

export class Cubism5MotionManager extends MotionManager<any, Cubism5MotionDefinition> {
    readonly definitions: Partial<Record<string, Cubism5MotionDefinition[]>>;

    readonly groups = { idle: "Idle" } as const;

    readonly motionDataType = "text";

    readonly queueManager: any = new CubismMotionQueueManager();

    declare readonly settings: Cubism5ModelSettings;

    expressionManager?: Cubism5ExpressionManager;

    eyeBlinkIds: any[];
    lipSyncIds: any[];

    constructor(settings: Cubism5ModelSettings, options?: MotionManagerOptions) {
        super(settings, options);

        this.definitions = settings.motions ?? {};
        this.eyeBlinkIds = settings.getEyeBlinkParameters() || [];
        this.lipSyncIds = settings.getLipSyncParameters() || [];

        this.init(options);
    }

    protected init(options?: MotionManagerOptions) {
        super.init(options);

        if (this.settings.expressions) {
            this.expressionManager = new Cubism5ExpressionManager(this.settings, options);
        }

        this.queueManager.setEventCallback((caller, eventValue, customData) => {
            this.emit("motion:" + eventValue);
        });
    }

    isFinished(): boolean {
        return this.queueManager.isFinished();
    }

    protected _startMotion(motion: any, onFinish?: (motion: any) => void): number {
        motion.setFinishedMotionHandler(onFinish as ((motion: unknown) => void) | undefined);

        this.queueManager.stopAllMotions();

        return this.queueManager.startMotion(motion, false, performance.now());
    }

    protected _stopAllMotions(): void {
        this.queueManager.stopAllMotions();
    }

    createMotion(data: object | string, group: string, definition: Cubism5MotionDefinition): any {
        const { buffer: arrayBuffer, byteLength } = toCubismJsonBuffer(data);
        const motion = CubismMotion.create(arrayBuffer, byteLength);
        const json = new CubismMotionJson(arrayBuffer, byteLength);

        const defaultFadingDuration =
            (group === this.groups.idle
                ? config.idleMotionFadingDuration
                : config.motionFadingDuration) / 1000;

        // fading duration priorities: model.json > motion.json > config (default)

        // overwrite the fading duration only when it's not defined in the motion JSON
        if (json.getMotionFadeInTime() === undefined) {
            motion.setFadeInTime(
                definition.FadeInTime! > 0 ? definition.FadeInTime! : defaultFadingDuration,
            );
        }

        if (json.getMotionFadeOutTime() === undefined) {
            motion.setFadeOutTime(
                definition.FadeOutTime! > 0 ? definition.FadeOutTime! : defaultFadingDuration,
            );
        }

        // Initialize with empty vectors to prevent null reference errors
        // The motion JSON already contains all necessary parameter information
        const emptyEyeBlinkVector = new csmVector<any>();
        const emptyLipSyncVector = new csmVector<any>();
        motion.setEffectIds(emptyEyeBlinkVector, emptyLipSyncVector);

        return motion;
    }

    getMotionFile(definition: Cubism5MotionDefinition): string {
        return definition.File;
    }

    protected getMotionName(definition: Cubism5MotionDefinition): string {
        return definition.File;
    }

    protected getSoundFile(definition: Cubism5MotionDefinition): string | undefined {
        return definition.Sound;
    }

    protected updateParameters(model: object, now: DOMHighResTimeStamp): boolean {
        return this.queueManager.doUpdateMotion(model, now);
    }

    destroy() {
        super.destroy();

        this.queueManager.release();
        (this as Partial<Mutable<this>>).queueManager = undefined;
    }
}
