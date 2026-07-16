import type { InternalModelOptions } from "@/cubism-common";
import type { CommonHitArea, CommonLayout } from "@/cubism-common/InternalModel";
import { InternalModel } from "@/cubism-common/InternalModel";
import { config } from "@/config";
import type { Cubism5ModelSettings } from "@/cubism5/Cubism5ModelSettings";
import { Cubism5MotionManager } from "@/cubism5/Cubism5MotionManager";
import { CubismDefaultParameterId } from "@cubism/cubismdefaultparameterid";
import { BreathParameterData, CubismBreath } from "@cubism/effect/cubismbreath";
import { CubismEyeBlink } from "@cubism/effect/cubismeyeblink";
import { CubismFramework } from "@cubism/live2dcubismframework";
import { CubismMatrix44 } from "@cubism/math/cubismmatrix44";
import { CubismRenderer_WebGL } from "@cubism/rendering/cubismrenderer_webgl";
import { Matrix } from "pixi.js";
import type { Mutable } from "../types/helpers";
import {
    Cubism5ShaderLoadCancelledError,
    loadCubism5Shaders,
    normalizeCubism5ShaderPath,
    releaseCubism5Context,
    retainCubism5Context,
} from "./Cubism5ShaderLoader";

const tempMatrix = new CubismMatrix44();

export class Cubism5InternalModel extends InternalModel {
    settings: Cubism5ModelSettings;
    coreModel: any;
    motionManager: Cubism5MotionManager;

    lipSync = true;

    breath = CubismBreath.create();
    eyeBlink?: CubismEyeBlink;

    declare pose?: any;
    declare physics?: any;

    // what's this for?
    userData?: any;

    renderer?: CubismRenderer_WebGL;

    shaderState: "idle" | "loading" | "ready" | "error" = "idle";
    shaderReady?: Promise<void>;
    shaderError?: Error;

    private shaderPath = "";
    private shaderGeneration = 0;
    private gl?: WebGL2RenderingContext;

    // Use actual parameter names from the Mao model instead of CubismDefaultParameterId
    idParamAngleX = "ParamAngleX";
    idParamAngleY = "ParamAngleY";
    idParamAngleZ = "ParamAngleZ";
    idParamEyeBallX = "ParamEyeBallX";
    idParamEyeBallY = "ParamEyeBallY";
    idParamBodyAngleX = "ParamBodyAngleX";
    idParamBreath: any = CubismDefaultParameterId.ParamBreath; // Keep this as fallback

    // Parameter indices are cached up front to avoid repeated lookups during updates.
    eyeballXParamIndex: number;
    eyeballYParamIndex: number;
    angleXParamIndex: number;
    angleYParamIndex: number;
    angleZParamIndex: number;
    bodyAngleXParamIndex: number;
    breathParamIndex: number;

    /**
     * The model's internal scale, defined in the moc3 file.
     */
    readonly pixelsPerUnit: number = 1;

    /**
     * Matrix that scales by {@link pixelsPerUnit}, and moves the origin from top-left to center.
     *
     * FIXME: This shouldn't be named as "centering"...
     */
    protected centeringTransform = new Matrix();

    constructor(coreModel: any, settings: Cubism5ModelSettings, options?: InternalModelOptions) {
        super();

        this.coreModel = coreModel;
        this.settings = settings;
        this.motionManager = new Cubism5MotionManager(settings, options);

        // Convert string parameter names to CubismIdHandle values and cache the indices.
        this.eyeballXParamIndex = this.coreModel.getParameterIndex(
            CubismFramework.getIdManager().getId(this.idParamEyeBallX),
        );
        this.eyeballYParamIndex = this.coreModel.getParameterIndex(
            CubismFramework.getIdManager().getId(this.idParamEyeBallY),
        );
        this.angleXParamIndex = this.coreModel.getParameterIndex(
            CubismFramework.getIdManager().getId(this.idParamAngleX),
        );
        this.angleYParamIndex = this.coreModel.getParameterIndex(
            CubismFramework.getIdManager().getId(this.idParamAngleY),
        );
        this.angleZParamIndex = this.coreModel.getParameterIndex(
            CubismFramework.getIdManager().getId(this.idParamAngleZ),
        );
        this.bodyAngleXParamIndex = this.coreModel.getParameterIndex(
            CubismFramework.getIdManager().getId(this.idParamBodyAngleX),
        );
        this.breathParamIndex = this.coreModel.getParameterIndex(this.idParamBreath);

        this.init();
    }

    protected init() {
        super.init();

        if (this.settings.getEyeBlinkParameters()?.length) {
            this.eyeBlink = CubismEyeBlink.create(this.settings);
        }

        const breathParams: BreathParameterData[] = [];
        breathParams.push(
            new BreathParameterData(
                CubismFramework.getIdManager().getId(this.idParamAngleX),
                0.0,
                15.0,
                6.5345,
                0.5,
            ),
        );
        breathParams.push(
            new BreathParameterData(
                CubismFramework.getIdManager().getId(this.idParamAngleY),
                0.0,
                8.0,
                3.5345,
                0.5,
            ),
        );
        breathParams.push(
            new BreathParameterData(
                CubismFramework.getIdManager().getId(this.idParamAngleZ),
                0.0,
                10.0,
                5.5345,
                0.5,
            ),
        );
        breathParams.push(
            new BreathParameterData(
                CubismFramework.getIdManager().getId(this.idParamBodyAngleX),
                0.0,
                4.0,
                15.5345,
                0.5,
            ),
        );
        breathParams.push(new BreathParameterData(this.idParamBreath, 0.0, 0.5, 3.2345, 0.5));
        this.breath.setParameters(breathParams);
    }

    protected getSize(): [number, number] {
        return [
            this.coreModel.getModel().canvasinfo.CanvasWidth,
            this.coreModel.getModel().canvasinfo.CanvasHeight,
        ];
    }

    protected getLayout(): CommonLayout {
        const layout: CommonLayout = {};

        if (this.settings.layout) {
            // un-capitalize each key to satisfy the common layout format
            // e.g. CenterX -> centerX
            for (const [key, value] of Object.entries(this.settings.layout)) {
                const commonKey = key.charAt(0).toLowerCase() + key.slice(1);

                layout[commonKey as keyof CommonLayout] = value;
            }
        }

        return layout;
    }

    protected setupLayout() {
        super.setupLayout();

        (this as Mutable<this>).pixelsPerUnit = this.coreModel.getModel().canvasinfo.PixelsPerUnit;

        // move the origin from top left to center
        this.centeringTransform
            .scale(this.pixelsPerUnit, this.pixelsPerUnit)
            .translate(this.originalWidth / 2, this.originalHeight / 2);
    }

    updateWebGLContext(
        gl: WebGL2RenderingContext,
        _glContextID: number,
        contextEpoch: object,
    ): void {
        try {
            if (this.gl !== gl) {
                if (this.gl) this.releaseWebGLContext(this.gl);
                retainCubism5Context(gl);
                this.gl = gl;
            }

            this.shaderGeneration++;
            this.shaderState = "loading";
            this.shaderError = undefined;

            this.renderer?.release();

            const width = Math.max(1, Math.floor(this.viewport[2] || gl.drawingBufferWidth));
            const height = Math.max(1, Math.floor(this.viewport[3] || gl.drawingBufferHeight));
            const renderer = new CubismRenderer_WebGL(width, height);

            this.renderer = renderer;
            renderer.initialize(this.coreModel);
            renderer.setIsPremultipliedAlpha(true);
            renderer.startUp(gl);

            this.shaderPath = normalizeCubism5ShaderPath(config.cubism5ShaderPath);

            const generation = this.shaderGeneration;
            const task = loadCubism5Shaders(
                gl,
                this.shaderPath,
                contextEpoch,
                () => !this.destroyed && generation === this.shaderGeneration,
            )
                .then(() => {
                    if (generation === this.shaderGeneration) {
                        this.shaderState = "ready";
                    }
                })
                .catch((cause) => {
                    if (
                        generation !== this.shaderGeneration ||
                        cause instanceof Cubism5ShaderLoadCancelledError
                    ) {
                        throw cause;
                    }

                    const error = new Error(
                        `Failed to initialize Cubism 5 shaders from ${this.shaderPath}: ${cause instanceof Error ? cause.message : String(cause)}`,
                        { cause },
                    );

                    this.shaderState = "error";
                    this.shaderError = error;
                    this.emit("shaderLoadError", error);

                    throw error;
                });

            this.shaderReady = task;
            task.catch(() => {});
        } catch (cause) {
            if (this.gl === gl) this.releaseWebGLContext(gl);

            const error =
                cause instanceof Error
                    ? cause
                    : new Error(
                          `Failed to initialize the Cubism 5 WebGL renderer: ${String(cause)}`,
                      );

            this.shaderState = "error";
            this.shaderError = error;
            this.emit("shaderLoadError", error);
            throw error;
        }
    }

    bindTexture(index: number, texture: WebGLTexture): void {
        this.renderer?.bindTexture(index, texture);
    }

    protected getHitAreaDefs(): CommonHitArea[] {
        const drawableIds = this.getDrawableIDs();
        return (
            this.settings.hitAreas?.map((hitArea) => {
                const index = drawableIds.indexOf(hitArea.Id);

                return {
                    id: hitArea.Id,
                    name: hitArea.Name,
                    index,
                };
            }) ?? []
        );
    }

    getDrawableIDs(): string[] {
        return this.coreModel.getModel().drawables.ids;
    }

    getDrawableIndex(id: string): number {
        return this.coreModel.getDrawableIndex(id);
    }

    getDrawableVertices(drawIndex: number | string): Float32Array {
        if (typeof drawIndex === "string") {
            drawIndex = this.coreModel.getDrawableIndex(drawIndex);

            if (drawIndex === -1) throw new TypeError("Unable to find drawable ID: " + drawIndex);
        }

        const arr = this.coreModel.getDrawableVertices(drawIndex).slice();

        for (let i = 0; i < arr.length; i += 2) {
            arr[i] = arr[i]! * this.pixelsPerUnit + this.originalWidth / 2;
            arr[i + 1] = -arr[i + 1]! * this.pixelsPerUnit + this.originalHeight / 2;
        }

        return arr;
    }

    updateTransform(transform: Matrix) {
        this.drawingMatrix
            .copyFrom(this.centeringTransform)
            .prepend(this.localTransform)
            .prepend(transform);
    }

    public update(dt: DOMHighResTimeStamp, now: DOMHighResTimeStamp): void {
        super.update(dt, now);

        // cubism5 uses seconds
        dt /= 1000;
        now /= 1000;

        const model = this.coreModel;

        // Expressions are relative to the parameters produced by the current motion. Restore the
        // previous motion state first, then save the newly updated motion state before applying
        // transient effects such as expressions, eye blinking, and breathing.
        model.loadParameters();

        this.emit("beforeMotionUpdate");

        const motionUpdated = this.motionManager.update(this.coreModel, now);

        this.emit("afterMotionUpdate");

        model.saveParameters();

        if (!motionUpdated) {
            this.eyeBlink?.updateParameters(model, dt);
        }

        this.motionManager.expressionManager?.update(model, now);

        // revert the timestamps to be milliseconds
        this.updateNaturalMovements(dt * 1000, now * 1000);

        // TODO: Add lip sync API
        // if (this.lipSync) {
        //     const value = 0; // 0 ~ 1
        //
        //     for (let i = 0; i < this.lipSyncIds.length; ++i) {
        //         model.addParameterValueById(this.lipSyncIds[i], value, 0.8);
        //     }
        // }

        this.physics?.evaluate(model, dt);
        this.pose?.updateParameters(model, dt);

        // Apply focus controller AFTER everything else so it's not overwritten
        this.updateFocus();

        this.emit("beforeModelUpdate");

        model.update();
    }

    updateFocus() {
        // Skip if any parameter indices are invalid
        if (this.eyeballXParamIndex < 0 || this.angleXParamIndex < 0) {
            return;
        }

        // Apply all focus parameters for complete mouse tracking
        const eyeX = this.focusController.x;
        const eyeY = this.focusController.y;
        const angleX = this.focusController.x * 30;
        const angleY = this.focusController.y * 30;

        this.coreModel.setParameterValueByIndex(this.eyeballXParamIndex, eyeX);
        this.coreModel.setParameterValueByIndex(this.eyeballYParamIndex, eyeY);
        this.coreModel.setParameterValueByIndex(this.angleXParamIndex, angleX);
        this.coreModel.setParameterValueByIndex(this.angleYParamIndex, angleY);
        this.coreModel.setParameterValueByIndex(
            this.angleZParamIndex,
            this.focusController.x * this.focusController.y * -30,
        );
        this.coreModel.setParameterValueByIndex(
            this.bodyAngleXParamIndex,
            this.focusController.x * 10,
        );
    }

    updateNaturalMovements(dt: DOMHighResTimeStamp, now: DOMHighResTimeStamp) {
        this.breath?.updateParameters(this.coreModel, dt / 1000);
    }

    draw(gl: WebGL2RenderingContext): void {
        if (this.shaderError) {
            throw this.shaderError;
        }

        const renderer = this.renderer;

        if (!renderer || this.shaderState !== "ready") {
            return;
        }

        const matrix = this.drawingMatrix;
        const array = tempMatrix.getArray();

        // set given 3x3 matrix into a 4x4 matrix, with Y inverted
        array[0] = matrix.a;
        array[1] = matrix.b;
        array[4] = -matrix.c;
        array[5] = -matrix.d;
        array[12] = matrix.tx;
        array[13] = matrix.ty;

        renderer.setMvpMatrix(tempMatrix);
        renderer.setRenderState(gl.getParameter(gl.FRAMEBUFFER_BINDING), this.viewport);
        renderer.drawModel(this.shaderPath);
    }

    override releaseWebGLContext(gl: WebGL2RenderingContext): void {
        if (this.gl !== gl) return;

        this.shaderGeneration++;
        const renderer = this.renderer;

        this.renderer = undefined;
        this.shaderState = "idle";
        this.shaderReady = undefined;
        this.shaderError = undefined;
        this.gl = undefined;

        try {
            renderer?.release();
        } finally {
            releaseCubism5Context(gl);
        }
    }

    destroy() {
        super.destroy();

        if (this.gl) this.releaseWebGLContext(this.gl);
        this.coreModel.release();

        (this as Partial<this>).renderer = undefined;
        (this as Partial<this>).coreModel = undefined;
    }
}
