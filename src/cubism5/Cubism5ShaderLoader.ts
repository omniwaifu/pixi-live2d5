import {
    registerWebGLContextLifecycleListener,
    type WebGLContextEpoch,
} from "@/WebGLContextLifecycle";
import { CubismWebGLOffscreenManager } from "@cubism/rendering/cubismoffscreenmanager";
import {
    CubismShaderManager_WebGL,
    type CubismShader_WebGL,
} from "@cubism/rendering/cubismshader_webgl";

export const CUBISM5_SHADER_FILES = [
    "fragshadersrcalphablend.frag",
    "fragshadersrccolorblend.frag",
    "fragshadersrccopy.frag",
    "fragshadersrcmaskinvertedpremultipliedalpha.frag",
    "fragshadersrcmaskpremultipliedalpha.frag",
    "fragshadersrcpremultipliedalpha.frag",
    "fragshadersrcpremultipliedalphablend.frag",
    "fragshadersrcsetupmask.frag",
    "vertshadersrc.vert",
    "vertshadersrcblend.vert",
    "vertshadersrccopy.vert",
    "vertshadersrcmasked.vert",
    "vertshadersrcsetupmask.vert",
] as const;

const SHADER_LOAD_TIMEOUT = 30_000;

interface ShaderLoadRecord {
    epoch: WebGLContextEpoch;
    path: string;
    task: Promise<void>;
    valid: boolean;
}

interface Cubism5ContextUsage {
    references: number;
    epoch?: WebGLContextEpoch;
    frameStarted: boolean;
}

let shaderLoadRecords = new WeakMap<CubismShader_WebGL, ShaderLoadRecord>();
const contextUsages = new WeakMap<WebGL2RenderingContext, Cubism5ContextUsage>();
const knownShaders = new Set<CubismShader_WebGL>();
let activeContextCount = 0;

export class Cubism5ShaderLoadCancelledError extends Error {
    constructor() {
        super("Cubism 5 shader loading was superseded by a newer WebGL context.");
        this.name = "Cubism5ShaderLoadCancelledError";
    }
}

export function normalizeCubism5ShaderPath(path: string): string {
    if (!path) {
        throw new Error("config.cubism5ShaderPath must be a non-empty shader directory URL.");
    }

    return path.endsWith("/") ? path : path + "/";
}

export async function verifyCubism5ShaderAssets(
    shaderPath: string,
    signal?: AbortSignal,
): Promise<void> {
    const normalizedPath = normalizeCubism5ShaderPath(shaderPath);

    await Promise.all(
        CUBISM5_SHADER_FILES.map(async (file) => {
            const url = normalizedPath + file;
            let response: Response;

            try {
                response = await fetch(url, { signal });
            } catch (cause) {
                throw new Error(`Failed to fetch Cubism 5 shader ${url}.`, { cause });
            }

            if (!response.ok) {
                throw new Error(
                    `Failed to fetch Cubism 5 shader ${url}: HTTP ${response.status} ${response.statusText}.`,
                );
            }

            const source = await response.text();

            if (!source.trim()) {
                throw new Error(`Cubism 5 shader ${url} was empty.`);
            }
        }),
    );
}

/** Retains the shared R5 state for one model using a WebGL context. */
export function retainCubism5Context(gl: WebGL2RenderingContext): void {
    let usage = contextUsages.get(gl);

    if (!usage) {
        usage = { references: 0, frameStarted: false };
        contextUsages.set(gl, usage);
        activeContextCount++;
    }

    usage.references++;
}

/** Releases one model's ownership of the shared R5 state for a WebGL context. */
export function releaseCubism5Context(gl: WebGL2RenderingContext): void {
    const usage = contextUsages.get(gl);

    if (!usage || usage.references === 0) return;

    usage.references--;
    if (usage.references > 0) return;

    endCubism5Frame(gl, usage);
    contextUsages.delete(gl);
    activeContextCount--;

    const shader = CubismShaderManager_WebGL.getInstance().getShader(gl);
    if (shader) invalidateShaderRecord(shader);

    // R5 has no public per-context removal API for its shader manager. Releasing the
    // singleton when the last live Cubism context goes away clears its strong GL keys.
    if (activeContextCount === 0) {
        releaseKnownShaderPrograms();
        CubismShaderManager_WebGL.deleteInstance();
        CubismWebGLOffscreenManager.getInstance().release();
        shaderLoadRecords = new WeakMap();
    } else {
        CubismWebGLOffscreenManager.getInstance().removeContext(gl);
    }
}

/**
 * Starts or reuses one shader initialization task for a WebGL context epoch.
 * The shared task deliberately has no model-specific cancellation callback: destroying one
 * model must not cancel shader compilation required by other models on the same context.
 */
export function loadCubism5Shaders(
    gl: WebGL2RenderingContext,
    shaderPath: string,
    epoch: WebGLContextEpoch,
    isCurrent: () => boolean,
): Promise<void> {
    assertCurrent(isCurrent);
    prepareCubism5Context(gl, epoch);

    const normalizedPath = normalizeCubism5ShaderPath(shaderPath);
    const shader = CubismShaderManager_WebGL.getInstance().getShader(gl);

    if (!shader) {
        return Promise.reject(
            new Error("Cubism 5 did not register a shader manager for the active WebGL context."),
        );
    }
    knownShaders.add(shader);

    const existing = shaderLoadRecords.get(shader);
    if (existing?.valid && existing.epoch === epoch) {
        if (existing.path !== normalizedPath) {
            return Promise.reject(
                new Error(
                    `Cubism 5 shaders for this WebGL context are already loading from ${existing.path}; cannot also use ${normalizedPath}.`,
                ),
            );
        }

        return observeSharedTask(existing.task, isCurrent);
    }

    // A ready program set may predate this adapter record (for example, after a model was
    // removed while another context remained active). Reuse it before touching the network.
    if (!shader._isShaderLoading && shader._isShaderLoaded) {
        try {
            validateShaderPrograms(gl, shader);
            const task = Promise.resolve();
            shaderLoadRecords.set(shader, {
                epoch,
                path: normalizedPath,
                task,
                valid: true,
            });

            return observeSharedTask(task, isCurrent);
        } catch {
            // The flags can outlive released or context-lost programs. Recompile below.
        }
    }

    if (existing) invalidateShaderRecord(shader);

    const record: ShaderLoadRecord = {
        epoch,
        path: normalizedPath,
        task: Promise.resolve(),
        valid: true,
    };
    record.task = initializeSharedShaders(gl, shader, record);
    shaderLoadRecords.set(shader, record);

    return observeSharedTask(record.task, isCurrent);
}

function initializeSharedShaders(
    gl: WebGL2RenderingContext,
    shader: CubismShader_WebGL,
    record: ShaderLoadRecord,
): Promise<void> {
    return (async () => {
        const deadline = performance.now() + SHADER_LOAD_TIMEOUT;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), SHADER_LOAD_TIMEOUT);

        try {
            await verifyCubism5ShaderAssets(record.path, controller.signal);
            assertSharedRecord(shader, record);

            if (controller.signal.aborted || performance.now() >= deadline) {
                throw shaderTimeoutError(record.path);
            }

            shader.setShaderPath(record.path);
            shader.generateShaders();

            while (true) {
                assertSharedRecord(shader, record);

                if (gl.isContextLost()) {
                    throw new Error(
                        "The WebGL 2 context was lost while Cubism 5 shaders were loading.",
                    );
                }

                if (!shader._isShaderLoading && shader._isShaderLoaded) {
                    validateShaderPrograms(gl, shader);
                    return;
                }

                if (!shader._isShaderLoading && !shader._isShaderLoaded) {
                    throw new Error("Cubism 5 shader compilation stopped before completion.");
                }

                if (performance.now() >= deadline) {
                    throw shaderTimeoutError(record.path);
                }

                await new Promise((resolve) => setTimeout(resolve, 16));
            }
        } catch (cause) {
            if (controller.signal.aborted) throw shaderTimeoutError(record.path);
            throw cause;
        } finally {
            clearTimeout(timeout);
        }
    })();
}

function observeSharedTask(task: Promise<void>, isCurrent: () => boolean): Promise<void> {
    return task.then(() => assertCurrent(isCurrent));
}

function prepareCubism5Context(gl: WebGL2RenderingContext, epoch: WebGLContextEpoch): void {
    const usage = contextUsages.get(gl);
    if (!usage) {
        throw new Error("Cubism 5 WebGL context ownership was not registered.");
    }

    if (usage.epoch !== epoch) {
        if (usage.epoch) resetCubism5Context(gl);
        usage.epoch = epoch;
    }

    // The first model can appear after Pixi's prerender hook in this same render pass.
    if (!usage.frameStarted) beginCubism5Frame(gl, usage);
}

function resetCubism5Context(gl: WebGL2RenderingContext): void {
    const shader = CubismShaderManager_WebGL.getInstance().getShader(gl);

    if (shader) {
        invalidateShaderRecord(shader);
    }

    CubismWebGLOffscreenManager.getInstance().removeContext(gl);
}

function beginCubism5Frame(gl: WebGL2RenderingContext, usage: Cubism5ContextUsage): void {
    const manager = CubismWebGLOffscreenManager.getInstance();

    // Recover from a prior Pixi render that threw before its postrender lifecycle ran.
    if (usage.frameStarted) manager.endFrameProcess(gl);
    manager.beginFrameProcess(gl);
    usage.frameStarted = true;
}

function endCubism5Frame(gl: WebGL2RenderingContext, usage: Cubism5ContextUsage): void {
    if (!usage.frameStarted) return;

    const manager = CubismWebGLOffscreenManager.getInstance();
    manager.endFrameProcess(gl);
    manager.releaseStaleRenderTextures(gl);
    usage.frameStarted = false;
}

registerWebGLContextLifecycleListener({
    contextChange(gl, epoch) {
        const usage = contextUsages.get(gl as WebGL2RenderingContext);
        if (!usage) return;

        resetCubism5Context(gl as WebGL2RenderingContext);
        usage.epoch = epoch;
        usage.frameStarted = false;
    },
    prerender(gl) {
        const webGL2 = gl as WebGL2RenderingContext;
        const usage = contextUsages.get(webGL2);
        if (usage) beginCubism5Frame(webGL2, usage);
    },
    postrender(gl) {
        const webGL2 = gl as WebGL2RenderingContext;
        const usage = contextUsages.get(webGL2);
        if (usage) endCubism5Frame(webGL2, usage);
    },
});

// Framework 5-r.5 exposes no Promise or error result for loadShaders(). Keep all read-only
// compatibility inspection of its public-but-underscore readiness fields isolated here.
function validateShaderPrograms(gl: WebGL2RenderingContext, shader: CubismShader_WebGL): void {
    if (!shader._shaderSets.length) {
        throw new Error("Cubism 5 reported shader readiness without creating shader programs.");
    }

    // R5 allocates three unused tail slots because its count formula does not account for the
    // skipped Normal + Over combination. Validate the compatibility/copy programs and every
    // three-program group that the renderer can actually select through its blend lookup map.
    const requiredIndices = new Set<number>(Array.from({ length: 11 }, (_, index) => index));
    for (const baseIndex of shader._blendShaderSetMap.values()) {
        requiredIndices.add(baseIndex);
        requiredIndices.add(baseIndex + 1);
        requiredIndices.add(baseIndex + 2);
    }

    const programs = new Set<WebGLProgram>();

    for (const index of requiredIndices) {
        const program = shader._shaderSets[index]?.shaderProgram;

        if (!program) {
            throw new Error(`Cubism 5 shader program ${index} failed to compile or link.`);
        }

        programs.add(program);
    }

    for (const program of programs) {
        if (!gl.isProgram(program) || !gl.getProgramParameter(program, gl.LINK_STATUS)) {
            throw new Error("A Cubism 5 shader program failed WebGL link validation.");
        }
    }
}

function invalidateShaderRecord(shader: CubismShader_WebGL): void {
    const record = shaderLoadRecords.get(shader);
    if (record) record.valid = false;
    shaderLoadRecords.delete(shader);
}

function assertSharedRecord(shader: CubismShader_WebGL, record: ShaderLoadRecord): void {
    if (!record.valid || shaderLoadRecords.get(shader) !== record) {
        throw new Cubism5ShaderLoadCancelledError();
    }
}

function assertCurrent(isCurrent: () => boolean): void {
    if (!isCurrent()) throw new Cubism5ShaderLoadCancelledError();
}

function shaderTimeoutError(path: string): Error {
    return new Error(`Timed out while loading or compiling Cubism 5 shaders from ${path}.`);
}

function releaseKnownShaderPrograms(): void {
    // Framework 5-r.5's releaseShaderProgram() assumes every allocated slot contains a valid
    // WebGLProgram. Failed compilation leaves zero-valued programs, and its blend count leaves
    // unused slots, so the public global release can throw during normal renderer destruction.
    // Normalize only this pinned adapter's known shader arrays before invoking the public release.
    for (const shader of knownShaders) {
        for (const shaderSet of shader._shaderSets) {
            const program = shaderSet?.shaderProgram;

            if (program && typeof program === "object") {
                shader.gl.deleteProgram(program);
            }
        }

        shader._shaderSets.length = 0;
    }

    knownShaders.clear();
}
