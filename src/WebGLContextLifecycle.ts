import { ExtensionType, extensions, type Renderer } from "pixi.js";

export type WebGLContextEpoch = object;

export interface WebGLRendererContextState {
    readonly renderer: Renderer;
    readonly owners: Set<(state: WebGLRendererContextState) => void>;
    epoch: WebGLContextEpoch;
    generation: number;
    gl?: WebGLRenderingContext | WebGL2RenderingContext;
    initialized: boolean;
    managedByPixiSystem: boolean;
    fallbackContextLost?: () => void;
    fallbackContextRestored?: () => void;
}

export interface WebGLContextLifecycleListener {
    contextChange?(
        gl: WebGLRenderingContext | WebGL2RenderingContext,
        epoch: WebGLContextEpoch,
    ): void;
    prerender?(gl: WebGLRenderingContext | WebGL2RenderingContext): void;
    postrender?(gl: WebGLRenderingContext | WebGL2RenderingContext): void;
    destroy?(gl: WebGLRenderingContext | WebGL2RenderingContext): void;
}

const rendererContextStates = new WeakMap<object, WebGLRendererContextState>();
const lifecycleListeners = new Set<WebGLContextLifecycleListener>();

export function registerWebGLContextLifecycleListener(
    listener: WebGLContextLifecycleListener,
): () => void {
    lifecycleListeners.add(listener);

    return () => lifecycleListeners.delete(listener);
}

export function getWebGLRendererContextState(renderer: Renderer): WebGLRendererContextState {
    let state = rendererContextStates.get(renderer);

    if (!state) {
        state = createRendererContextState(renderer);
        state.gl = (renderer as any).gl;
        state.initialized = Boolean(state.gl);
        rendererContextStates.set(renderer, state);

        // Extensions are installed before normal Pixi renderer creation. This fallback keeps
        // context restoration correct when pixi-live2d is imported after a renderer already exists.
        const canvas = (renderer as any).canvas as HTMLCanvasElement | undefined;
        if (canvas) {
            state.fallbackContextLost = () => {
                for (const releaseOwner of [...state!.owners]) releaseOwner(state!);
                state!.owners.clear();
            };
            state.fallbackContextRestored = () => {
                const gl = (renderer as any).gl as
                    WebGLRenderingContext | WebGL2RenderingContext | undefined;

                if (gl) {
                    advanceContext(state!, gl);
                }
            };
            canvas.addEventListener("webglcontextlost", state.fallbackContextLost);
            canvas.addEventListener("webglcontextrestored", state.fallbackContextRestored);
        }
    }

    return state;
}

export function beginFallbackWebGLFrame(state: WebGLRendererContextState): void {
    if (state.managedByPixiSystem || !state.gl) return;

    for (const listener of lifecycleListeners) listener.prerender?.(state.gl);
}

export function endFallbackWebGLFrame(state: WebGLRendererContextState): void {
    if (state.managedByPixiSystem || !state.gl) return;

    for (const listener of lifecycleListeners) listener.postrender?.(state.gl);
}

function createRendererContextState(renderer: Renderer): WebGLRendererContextState {
    return {
        renderer,
        owners: new Set(),
        epoch: {},
        generation: 0,
        initialized: false,
        managedByPixiSystem: false,
    };
}

function advanceContext(
    state: WebGLRendererContextState,
    gl: WebGLRenderingContext | WebGL2RenderingContext,
): void {
    if (state.initialized) {
        state.generation++;
        state.epoch = {};
    }

    state.gl = gl;
    state.initialized = true;

    for (const listener of lifecycleListeners) {
        listener.contextChange?.(gl, state.epoch);
    }
}

function destroyRendererContext(state: WebGLRendererContextState): void {
    const gl = state.gl;

    for (const releaseOwner of [...state.owners]) releaseOwner(state);
    state.owners.clear();

    if (gl) {
        for (const listener of lifecycleListeners) {
            listener.destroy?.(gl);
        }
    }

    const canvas = (state.renderer as any).canvas as HTMLCanvasElement | undefined;
    if (canvas && state.fallbackContextLost) {
        canvas.removeEventListener("webglcontextlost", state.fallbackContextLost);
    }
    if (canvas && state.fallbackContextRestored) {
        canvas.removeEventListener("webglcontextrestored", state.fallbackContextRestored);
    }

    rendererContextStates.delete(state.renderer);
    state.gl = undefined;
}

class Live2DWebGLContextSystem {
    static extension = {
        type: [ExtensionType.WebGLSystem],
        name: "live2dContext",
    } as const;

    private renderer?: Renderer;
    private state: WebGLRendererContextState;

    constructor(renderer: Renderer) {
        this.renderer = renderer;
        this.state = rendererContextStates.get(renderer) ?? createRendererContextState(renderer);
        this.state.managedByPixiSystem = true;
        rendererContextStates.set(renderer, this.state);
    }

    contextChange(gl: WebGLRenderingContext | WebGL2RenderingContext): void {
        advanceContext(this.state, gl);
    }

    prerender(): void {
        if (!this.state.gl) return;

        for (const listener of lifecycleListeners) {
            listener.prerender?.(this.state.gl);
        }
    }

    postrender(): void {
        if (!this.state.gl) return;

        for (const listener of lifecycleListeners) {
            listener.postrender?.(this.state.gl);
        }
    }

    destroy(): void {
        destroyRendererContext(this.state);
        this.renderer = undefined;
    }
}

extensions.add(Live2DWebGLContextSystem);
