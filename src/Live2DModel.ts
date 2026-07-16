import type { InternalModel, ModelSettings, MotionPriority } from "@/cubism-common";
import type { MotionManagerOptions } from "@/cubism-common/MotionManager";
import type { Live2DFactoryOptions } from "@/factory/Live2DFactory";
import { Live2DFactory } from "@/factory/Live2DFactory";
import {
    Matrix,
    ObservablePoint,
    Point,
    ViewContainer,
    type DestroyOptions,
    type Renderer,
    type Texture,
    type Ticker,
} from "pixi.js";
import { Automator, type AutomatorOptions } from "./Automator";
import type { JSONObject } from "./types/helpers";
import { logger } from "./utils";
import {
    beginFallbackWebGLFrame,
    endFallbackWebGLFrame,
    getWebGLRendererContextState,
    type WebGLRendererContextState,
} from "./WebGLContextLifecycle";

export interface Live2DModelOptions extends MotionManagerOptions, AutomatorOptions {}

const tempPoint = new Point();
const tempMatrix = new Matrix();

interface SavedWebGLState {
    drawFramebuffer: WebGLFramebuffer | null;
    readFramebuffer: WebGLFramebuffer | null;
    viewport: [number, number, number, number];
    clearColor: [number, number, number, number];
}

export type Live2DConstructor = { new (options?: Live2DModelOptions): Live2DModel };

/**
 * A wrapper that allows the Live2D model to be used as a DisplayObject in PixiJS.
 *
 * ```js
 * const model = await Live2DModel.from('shizuku.model3.json');
 * container.add(model);
 * ```
 * Emits the Live2D model event set.
 */
export class Live2DModel<IM extends InternalModel = InternalModel> extends ViewContainer {
    /** @internal */
    override readonly renderPipeId = "customRender";
    /** @internal */
    batched = false;
    /** @internal */
    override allowChildren = true;
    /**
     * Creates a Live2DModel from given source.
     * @param source - Can be one of: settings file URL, settings JSON object, ModelSettings instance.
     * @param options - Options for the creation.
     * @return Promise that resolves with the Live2DModel.
     */
    static from<M extends Live2DConstructor = typeof Live2DModel>(
        this: M,
        source: string | JSONObject | ModelSettings,
        options?: Live2DFactoryOptions,
    ): Promise<InstanceType<M>> {
        const model = new this(options) as InstanceType<M>;

        return Live2DFactory.setupLive2DModel(model, source, options)
            .then(() => {
                options?.onLoad?.();

                return model;
            })
            .catch((error) => {
                options?.onError?.(error as Error);

                throw error;
            });
    }

    /**
     * Synchronous version of `Live2DModel.from()`. This method immediately returns a Live2DModel instance,
     * whose resources have not been loaded. Therefore this model can't be manipulated or rendered
     * until the "load" event has been emitted.
     *
     * ```js
     * // no `await` here as it's not a Promise
     * const model = Live2DModel.fromSync('shizuku.model3.json');
     *
     * // these will cause errors!
     * // app.stage.addChild(model);
     * // model.motion('tap_body');
     *
     * model.once('load', () => {
     *     // now it's safe
     *     app.stage.addChild(model);
     *     model.motion('tap_body');
     * });
     * ```
     */
    static fromSync<M extends Live2DConstructor = typeof Live2DModel>(
        this: M,
        source: string | JSONObject | ModelSettings,
        options?: Live2DFactoryOptions,
    ): InstanceType<M> {
        const model = new this(options) as InstanceType<M>;

        Live2DFactory.setupLive2DModel(model, source, options)
            .then(options?.onLoad)
            .catch(options?.onError);

        return model;
    }

    /**
     * Registers the class of `PIXI.Ticker` for auto updating.
     * @deprecated Use the `ticker` creation option instead.
     */
    static registerTicker(tickerClass: typeof Ticker): void {
        Automator["defaultTicker"] = tickerClass.shared;
    }

    /**
     * Tag for logging.
     */
    tag = "Live2DModel(uninitialized)";

    /**
     * The internal model. Though typed as non-nullable, it'll be undefined until the "ready" event is emitted.
     */
    internalModel!: IM;

    /**
     * Pixi textures.
     */
    textures: Texture[] = [];

    /**
     * The anchor behaves like the one in `PIXI.Sprite`, where `(0, 0)` means the top left
     * and `(1, 1)` means the bottom right.
     */
    private readonly _anchorObserver = { _onUpdate: () => this.onAnchorChange() };
    anchor = new ObservablePoint(this._anchorObserver as any, 0, 0);

    /**
     * WebGL context currently used to render this model.
     */
    private glContext?: WebGL2RenderingContext;

    private rendererContextState?: WebGLRendererContextState;
    private rendererContextEpoch?: object;
    private readonly releaseRendererContext = (state: WebGLRendererContextState): void => {
        if (this.rendererContextState !== state) return;

        state.owners.delete(this.releaseRendererContext);
        if (this.glContext) {
            this.internalModel?.releaseWebGLContext(this.glContext);
        }
        this.glContext = undefined;
        this.rendererContextState = undefined;
        this.rendererContextEpoch = undefined;
    };

    /**
     * An ID that increments when the WebGL context changes. Used by the Live2D renderer
     * to reset context-bound resources.
     */
    protected glContextID = 0;

    /**
     * Elapsed time in milliseconds since created.
     */
    elapsedTime: DOMHighResTimeStamp = 0;

    /**
     * Elapsed time in milliseconds from last frame to this frame.
     */
    deltaTime: DOMHighResTimeStamp = 0;

    automator: Automator;

    constructor(options?: Live2DModelOptions) {
        super({ label: "Live2DModel" });

        this.automator = new Automator(this, options);

        this.once("modelLoaded", () => this.init(options));
    }

    // TODO: rename
    /**
     * A handler of the "modelLoaded" event, invoked when the internal model has been loaded.
     */
    protected init(options?: Live2DModelOptions) {
        this.tag = `Live2DModel(${this.internalModel.settings.name})`;
        this.onAnchorChange();
    }

    /**
     * A callback that observes `anchor`, invoked when the anchor values change.
     */
    protected onAnchorChange(): void {
        if (!this.internalModel) {
            return;
        }

        this.pivot.set(
            this.anchor.x * this.internalModel.width,
            this.anchor.y * this.internalModel.height,
        );
    }

    /**
     * Shorthand to start a motion.
     * @param group - The motion group.
     * @param index - The index in this group. If not presented, a random motion will be started.
     * @param priority - The motion priority. Defaults to `MotionPriority.NORMAL`.
     * @return Promise that resolves with true if the motion is successfully started, with false otherwise.
     */
    motion(group: string, index?: number, priority?: MotionPriority): Promise<boolean> {
        return index === undefined
            ? this.internalModel.motionManager.startRandomMotion(group, priority)
            : this.internalModel.motionManager.startMotion(group, index, priority);
    }

    /**
     * Shorthand to set an expression.
     * @param id - Either the index, or the name of the expression. If not presented, a random expression will be set.
     * @return Promise that resolves with true if succeeded, with false otherwise.
     */
    expression(id?: number | string): Promise<boolean> {
        if (this.internalModel.motionManager.expressionManager) {
            return id === undefined
                ? this.internalModel.motionManager.expressionManager.setRandomExpression()
                : this.internalModel.motionManager.expressionManager.setExpression(id);
        }
        return Promise.resolve(false);
    }

    /**
     * Updates the focus position. This will not cause the model to immediately look at the position,
     * instead the movement will be interpolated.
     * @param x - Position in world space.
     * @param y - Position in world space.
     * @param instant - Should the focus position be instantly applied.
     */
    focus(x: number, y: number, instant: boolean = false): void {
        tempPoint.x = x;
        tempPoint.y = y;

        // we can pass `true` as the third argument to skip the update transform
        // because focus won't take effect until the model is rendered,
        // and a model being rendered will always get transform updated
        this.toModelPosition(tempPoint, tempPoint, true);

        const tx = (tempPoint.x / this.internalModel.originalWidth) * 2 - 1;
        const ty = (tempPoint.y / this.internalModel.originalHeight) * 2 - 1;
        const radian = Math.atan2(ty, tx);
        this.internalModel.focusController.focus(Math.cos(radian), -Math.sin(radian), instant);
    }

    /**
     * Tap on the model. This will perform a hit-testing, and emit a "hit" event
     * if at least one of the hit areas is hit.
     * @param x - Position in world space.
     * @param y - Position in world space.
     * Emits `hit` when at least one hit area matches.
     */
    tap(x: number, y: number): void {
        const hitAreaNames = this.hitTest(x, y);

        if (hitAreaNames.length) {
            logger.log(this.tag, `Hit`, hitAreaNames);

            this.emit("hit", hitAreaNames);
        }
    }

    /**
     * Hit-test on the model.
     * @param x - Position in world space.
     * @param y - Position in world space.
     * @return The names of the *hit* hit areas. Can be empty if none is hit.
     */
    hitTest(x: number, y: number): string[] {
        tempPoint.x = x;
        tempPoint.y = y;
        this.toModelPosition(tempPoint, tempPoint);

        return this.internalModel.hitTest(tempPoint.x, tempPoint.y);
    }

    /**
     * Calculates the position in the canvas of original, unscaled Live2D model.
     * @param position - A Point in world space.
     * @param result - A Point to store the new value. Defaults to a new Point.
     * @param skipUpdate - True to skip the update transform.
     * @return The Point in model canvas space.
     */
    toModelPosition(
        position: Point,
        result: Point = position.clone(),
        skipUpdate?: boolean,
    ): Point {
        this.toLocal(position, undefined, result, skipUpdate);
        this.internalModel.localTransform.applyInverse(result, result);

        return result;
    }

    /** @internal */
    protected updateBounds(): void {
        this._bounds.clear();

        if (!this.internalModel) {
            return;
        }

        this._bounds.addFrame(0, 0, this.internalModel.width, this.internalModel.height);
    }

    /**
     * Updates the model. Note this method just updates the timer,
     * and the actual update will be done right before rendering the model.
     * @param dt - The elapsed time in milliseconds since last frame.
     */
    update(dt: DOMHighResTimeStamp): void {
        this.deltaTime += dt;
        this.elapsedTime += dt;

        // don't call `this.internalModel.update()` here, because it requires WebGL context
    }

    render(renderer: Renderer): void {
        if (!this.internalModel) {
            return;
        }

        const gl = (renderer as any).gl as
            WebGLRenderingContext | WebGL2RenderingContext | undefined;

        if (!gl) {
            throw new Error(
                "Cubism SDK for Web R5 requires a Pixi WebGL 2 renderer; no WebGL context is active.",
            );
        }

        const webGLVersion = (renderer as any).context?.webGLVersion as 1 | 2 | undefined;
        const isWebGL2 =
            webGLVersion === 2 ||
            (webGLVersion === undefined &&
                typeof WebGL2RenderingContext !== "undefined" &&
                gl instanceof WebGL2RenderingContext);

        if (!isWebGL2) {
            throw new Error(
                "Cubism SDK for Web R5 requires WebGL 2; the active Pixi renderer is using WebGL 1.",
            );
        }

        const webGL2 = gl as WebGL2RenderingContext;

        if (webGL2.isContextLost()) {
            return;
        }

        const savedState = this.captureWebGLState(webGL2);
        this.internalModel.viewport = [...savedState.viewport];
        let fallbackFrameState: WebGLRendererContextState | undefined;

        try {
            // Reset the Pixi systems whose cached state Cubism will bypass with raw WebGL calls.
            (renderer as any).shader?.resetState?.();
            (renderer as any).geometry?.resetState?.();
            (renderer as any).state?.resetState?.();
            (renderer as any).stencil?.resetState?.();

            const rendererContextState = getWebGLRendererContextState(renderer);
            if (!rendererContextState.managedByPixiSystem) {
                beginFallbackWebGLFrame(rendererContextState);
                fallbackFrameState = rendererContextState;
            }
            if (
                this.glContext !== webGL2 ||
                this.rendererContextState !== rendererContextState ||
                this.rendererContextEpoch !== rendererContextState.epoch
            ) {
                this.rendererContextState?.owners.delete(this.releaseRendererContext);
                rendererContextState.owners.add(this.releaseRendererContext);
                this.glContext = webGL2;
                this.rendererContextState = rendererContextState;
                this.rendererContextEpoch = rendererContextState.epoch;
                this.glContextID++;

                try {
                    this.internalModel.updateWebGLContext(
                        webGL2,
                        this.glContextID,
                        rendererContextState.epoch,
                    );
                } catch (error) {
                    this.internalModel.releaseWebGLContext(webGL2);
                    rendererContextState.owners.delete(this.releaseRendererContext);
                    this.glContext = undefined;
                    this.rendererContextState = undefined;
                    this.rendererContextEpoch = undefined;
                    throw error;
                }
            }

            for (let i = 0; i < this.textures.length; i++) {
                const texture = this.textures[i]!;

                webGL2.pixelStorei(webGL2.UNPACK_FLIP_Y_WEBGL, this.internalModel.textureFlipY);

                // Ensure Pixi has created/uploaded the GPU texture.
                (renderer as any).texture.bind(texture, 0);

                // Bind the underlying WebGLTexture into Live2D core.
                const glTexture = (renderer as any).texture.getGlSource(texture.source)
                    .texture as WebGLTexture;

                this.internalModel.bindTexture(i, glTexture);
            }

            // Update only if time changed; a model may otherwise render multiple times per tick.
            if (this.deltaTime) {
                this.internalModel.update(this.deltaTime, this.elapsedTime);
                this.deltaTime = 0;
            }

            const projectionMatrix = (renderer as any).globalUniforms?.globalUniformData
                ?.projectionMatrix as Matrix | undefined;

            if (!projectionMatrix) return;

            const internalTransform = tempMatrix
                .copyFrom(projectionMatrix)
                .append(this.worldTransform);

            this.internalModel.updateTransform(internalTransform);
            this.internalModel.draw(webGL2);
        } finally {
            try {
                if (fallbackFrameState) endFallbackWebGLFrame(fallbackFrameState);
            } finally {
                this.restorePixiWebGLState(renderer, webGL2, savedState);
            }
        }
    }

    private captureWebGLState(gl: WebGL2RenderingContext): SavedWebGLState {
        const viewport = gl.getParameter(gl.VIEWPORT) as Int32Array;
        const clearColor = gl.getParameter(gl.COLOR_CLEAR_VALUE) as Float32Array;

        return {
            drawFramebuffer: gl.getParameter(
                gl.DRAW_FRAMEBUFFER_BINDING,
            ) as WebGLFramebuffer | null,
            readFramebuffer: gl.getParameter(
                gl.READ_FRAMEBUFFER_BINDING,
            ) as WebGLFramebuffer | null,
            viewport: [viewport[0]!, viewport[1]!, viewport[2]!, viewport[3]!],
            clearColor: [clearColor[0]!, clearColor[1]!, clearColor[2]!, clearColor[3]!],
        };
    }

    private restorePixiWebGLState(
        renderer: Renderer,
        gl: WebGL2RenderingContext,
        state: SavedWebGLState,
    ): void {
        // Restore the actual GL render target and viewport captured at entry. Pixi's logical
        // viewport uses top-origin coordinates, while WebGL and Cubism use bottom-origin values.
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, state.drawFramebuffer);
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, state.readFramebuffer);
        gl.viewport(...state.viewport);
        gl.clearColor(...state.clearColor);

        // IMPORTANT: Don't call `renderer.resetState()` here. It also resets the renderTarget system,
        // which can break the active render pass and freeze the frame.
        (renderer as any).state?.resetState?.();
        (renderer as any).texture?.resetState?.();
        (renderer as any).shader?.resetState?.();
        (renderer as any).geometry?.resetState?.();
        (renderer as any).stencil?.resetState?.();
        (renderer as any).colorMask?.resetState?.();
        (renderer as any).buffer?.resetState?.();
    }

    /**
     * Destroys the model and all related resources. This takes the same options and also
     * behaves the same as `PIXI.Container#destroy`.
     * @param options - Options parameter. A boolean will act as if all options
     *  have been set to that value
     * @param [options.children=false] - if set to true, all the children will have their destroy
     *  method called as well. 'options' will be passed on to those calls.
     * @param [options.texture=false] - Only used for child Sprites if options.children is set to true
     *  Should it destroy the texture of the child sprite
     * @param [options.baseTexture=false] - Only used for child Sprites if options.children is set to true
     *  Should it destroy the base texture of the child sprite
     */
    destroy(options?: DestroyOptions): void {
        this.emit("destroy");

        this.rendererContextState?.owners.delete(this.releaseRendererContext);
        this.rendererContextState = undefined;
        this.rendererContextEpoch = undefined;
        this.glContext = undefined;

        if (typeof options === "object" && options?.texture) {
            const destroySource = Boolean(
                (options as any).textureSource ?? (options as any).baseTexture,
            );
            this.textures.forEach((texture) => texture.destroy(destroySource));
        }

        this.automator.destroy();
        this.internalModel?.destroy();

        super.destroy(options as DestroyOptions);
    }
}
