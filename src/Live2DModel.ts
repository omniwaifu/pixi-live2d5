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
    type Rectangle,
    type Renderer,
    type Texture,
    type Ticker,
} from "pixi.js";
import { Automator, type AutomatorOptions } from "./Automator";
import type { JSONObject } from "./types/helpers";
import { logger } from "./utils";

export interface Live2DModelOptions extends MotionManagerOptions, AutomatorOptions {}

const tempPoint = new Point();
const tempMatrix = new Matrix();

export type Live2DConstructor = { new (options?: Live2DModelOptions): Live2DModel };

/**
 * A wrapper that allows the Live2D model to be used as a DisplayObject in PixiJS.
 *
 * ```js
 * const model = await Live2DModel.from('shizuku.model.json');
 * container.add(model);
 * ```
 * @emits {@link Live2DModelEvents}
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

        return Live2DFactory.setupLive2DModel(model, source, options).then(() => model);
    }

    /**
     * Synchronous version of `Live2DModel.from()`. This method immediately returns a Live2DModel instance,
     * whose resources have not been loaded. Therefore this model can't be manipulated or rendered
     * until the "load" event has been emitted.
     *
     * ```js
     * // no `await` here as it's not a Promise
     * const model = Live2DModel.fromSync('shizuku.model.json');
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
     * @deprecated Use {@link Live2DModelOptions.ticker} instead.
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
    private glContext: WebGLRenderingContext | null = null;

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
     * A callback that observes {@link anchor}, invoked when the anchor's values have been changed.
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
     * @emits {@link Live2DModelEvents.hit}
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

        const gl = (renderer as any).gl as WebGLRenderingContext | undefined;

        // Live2D renderer is WebGL-only (at least for now).
        if (!gl) {
            return;
        }

        // reset certain systems in renderer to make Live2D's drawing system compatible with Pixi
        (renderer as any).shader?.resetState?.();
        (renderer as any).geometry?.resetState?.();
        (renderer as any).state?.resetState?.();
        (renderer as any).stencil?.resetState?.();

        // when the WebGL context has changed
        if (this.glContext !== gl) {
            this.glContext = gl;
            this.glContextID++;

            this.internalModel.updateWebGLContext(gl, this.glContextID);
        }

        for (let i = 0; i < this.textures.length; i++) {
            const texture = this.textures[i]!;

            gl.pixelStorei(WebGLRenderingContext.UNPACK_FLIP_Y_WEBGL, this.internalModel.textureFlipY);

            // Ensure Pixi has created/uploaded the GPU texture.
            (renderer as any).texture.bind(texture, 0);

            // Bind the underlying WebGLTexture into Live2D core.
            const glTexture = (renderer as any).texture.getGlSource(texture.source).texture as WebGLTexture;

            this.internalModel.bindTexture(i, glTexture);
        }

        const viewport = (renderer as any).renderTarget?.viewport as Rectangle | undefined;

        if (viewport) {
            this.internalModel.viewport = [viewport.x, viewport.y, viewport.width, viewport.height];
        }

        // update only if the time has changed, as the model will possibly be updated once but rendered multiple times
        if (this.deltaTime) {
            this.internalModel.update(this.deltaTime, this.elapsedTime);
            this.deltaTime = 0;
        }

        const projectionMatrix = (renderer as any).globalUniforms?.globalUniformData?.projectionMatrix as
            | Matrix
            | undefined;

        if (!projectionMatrix) {
            return;
        }

        const internalTransform = tempMatrix.copyFrom(projectionMatrix).append(this.worldTransform);

        this.internalModel.updateTransform(internalTransform);
        this.internalModel.draw(gl);

        // Live2D draws via raw WebGL calls (viewport, clearColor, bindings...),
        // so restore Pixi's expected render target state + resync internal caches for the next renderables.
        const renderTargetAdaptor = (renderer as any).renderTarget?.adaptor as
            | { _viewPortCache?: Rectangle; _clearColorCache?: number[] }
            | undefined;
        const viewPortCache = renderTargetAdaptor?._viewPortCache;
        if (viewPortCache) {
            gl.viewport(viewPortCache.x, viewPortCache.y, viewPortCache.width, viewPortCache.height);
        }
        const clearColorCache = renderTargetAdaptor?._clearColorCache;
        if (clearColorCache && clearColorCache.length === 4) {
            gl.clearColor(clearColorCache[0]!, clearColorCache[1]!, clearColorCache[2]!, clearColorCache[3]!);
        }
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

        if (typeof options === "object" && options?.texture) {
            const destroySource = Boolean((options as any).textureSource ?? (options as any).baseTexture);
            this.textures.forEach((texture) => texture.destroy(destroySource));
        }

        this.automator.destroy();
        this.internalModel.destroy();

        super.destroy(options as DestroyOptions);
    }
}
